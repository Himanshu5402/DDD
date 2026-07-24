import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, CircularProgress, Alert, Chip, TextField, MenuItem,
  InputAdornment, LinearProgress, Card, CardActionArea, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions, Drawer, IconButton, Divider,
  Checkbox, Stack, Slider, Avatar, Tooltip, List, ListItem, ListItemText,
} from '@mui/material';
import Masonry from '@mui/lab/Masonry';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import FlagIcon from '@mui/icons-material/OutlinedFlag';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import {
  goalsApi, GOAL_TYPES, GOAL_TYPE_LABELS, GOAL_STATUSES, GOAL_STATUS_LABELS, GOAL_STATUS_COLOR,
} from '../../api/goals.api.js';
import { TASK_STATUS_LABELS } from '../../api/tasks.api.js';
import { STATUS_ACCENT } from '../../components/tasks/taskMeta.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const toDateInput = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

const initials = (name = '') => name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

const formatTarget = (target) => {
  if (!target?.metric) return '';
  return `${target.metric}: ${target.currentValue ?? 0}/${target.targetValue ?? '—'} ${target.unit || ''}`.trim();
};

// Soft chip palettes keyed by the semantic color names in GOAL_STATUS_COLOR.
const SOFT_CHIP = {
  default: { bgcolor: '#F3F4F6', color: '#4B5563' },
  primary: { bgcolor: '#EEF2FF', color: '#4338CA' },
  info: { bgcolor: '#F0F9FF', color: '#0369A1' },
  success: { bgcolor: '#ECFDF5', color: '#047857' },
  warning: { bgcolor: '#FFFBEB', color: '#B45309' },
  error: { bgcolor: '#FEF2F2', color: '#B91C1C' },
};

const statusChipSx = (status) => SOFT_CHIP[GOAL_STATUS_COLOR[status]] || SOFT_CHIP.default;

/* ------------------------- File import (Excel/PDF) ------------------------ */

const GOAL_IMPORT_FIELDS = [
  { key: 'title', label: 'Title', required: true },
  { key: 'description', label: 'Description' },
  { key: 'type', label: 'Type', hint: 'daily / weekly / monthly / quarterly / yearly…' },
  { key: 'status', label: 'Status', hint: 'not_started / in_progress / on_track / at_risk / achieved / abandoned' },
  { key: 'startDate', label: 'Start date', hint: 'YYYY-MM-DD' },
  { key: 'targetDate', label: 'Target date', hint: 'YYYY-MM-DD' },
  { key: 'progress', label: 'Progress %', hint: '0–100' },
  { key: 'targetMetric', label: 'Target metric', hint: 'e.g. New clients' },
  { key: 'targetUnit', label: 'Target unit', hint: 'e.g. clients' },
  { key: 'targetValue', label: 'Target value', hint: 'number' },
  { key: 'tags', label: 'Tags', hint: 'comma-separated' },
];

// Normalize enum-ish text from files ("Half-Yearly", "On Track") to schema slugs.
const toSlug = (v) => String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function buildGoalImportPayload(m) {
  if (!m.title) throw new Error('Title is required');
  const payload = { title: m.title };
  if (m.description) payload.description = m.description;
  // Accept both raw slugs and the UI's display labels ("2-Year" → two_year).
  const typeSlug = toSlug(m.type);
  const type = GOAL_TYPES.includes(typeSlug)
    ? typeSlug
    : GOAL_TYPES.find((k) => toSlug(GOAL_TYPE_LABELS[k]) === typeSlug);
  if (type) payload.type = type;
  const status = toSlug(m.status);
  if (GOAL_STATUSES.includes(status)) payload.status = status;
  if (m.startDate) payload.startDate = m.startDate;
  if (m.targetDate) payload.targetDate = m.targetDate;
  if (m.progress) {
    const progress = Number(String(m.progress).replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(progress)) throw new Error('Progress must be a number between 0 and 100');
    payload.progress = Math.min(100, Math.max(0, progress));
  }
  if (m.targetMetric || m.targetUnit || m.targetValue) {
    const target = {};
    if (m.targetMetric) target.metric = m.targetMetric;
    if (m.targetUnit) target.unit = m.targetUnit;
    if (m.targetValue) {
      const targetValue = Number(String(m.targetValue).replace(/[^0-9.-]/g, ''));
      if (!Number.isFinite(targetValue)) throw new Error('Target value must be a number');
      target.targetValue = targetValue;
    }
    payload.target = target;
  }
  if (m.tags) {
    const tags = m.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length) payload.tags = tags;
  }
  return payload;
}

export default function GoalsPage() {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canCreate = perms.create;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const listQuery = useQuery({
    queryKey: ['goals', { search, type: typeFilter }],
    queryFn: () =>
      goalsApi.list({
        limit: 100,
        ...(search ? { search } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['goals'] });

  // Live updates: refetch whenever any client changes a goal.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal'] });
    };
    socket.on('goals:changed', handler);
    return () => socket.off('goals:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? goalsApi.update(editing._id, payload) : goalsApi.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidate(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save goal')),
  });

  const goals = listQuery.data?.data || [];

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (goal) => { setEditing(goal); setSaveError(''); setDialogOpen(true); };

  return (
    <Box>
      <PageHeader
        title="Goals"
        subtitle="Plan, track and achieve goals across every time horizon."
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            {canCreate && <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>Import</Button>}
            {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New goal</Button>}
          </Box>
        }
      />

      {/* Type filter chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        <Chip
          label="All"
          size="small"
          color={!typeFilter ? 'primary' : 'default'}
          variant={!typeFilter ? 'filled' : 'outlined'}
          onClick={() => setTypeFilter('')}
          sx={!typeFilter ? undefined : { borderColor: 'divider', color: 'text.secondary', bgcolor: '#FFFFFF' }}
        />
        {GOAL_TYPES.map((t) => (
          <Chip
            key={t}
            label={GOAL_TYPE_LABELS[t]}
            size="small"
            color={typeFilter === t ? 'primary' : 'default'}
            variant={typeFilter === t ? 'filled' : 'outlined'}
            onClick={() => setTypeFilter(t)}
            sx={typeFilter === t ? undefined : { borderColor: 'divider', color: 'text.secondary', bgcolor: '#FFFFFF' }}
          />
        ))}
      </Box>

      {listQuery.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {listQuery.error && <Alert severity="error">{getErrorMessage(listQuery.error, 'Failed to load goals')}</Alert>}

      {!listQuery.isLoading && !listQuery.error && (
        goals.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <FlagIcon sx={{ fontSize: 40, opacity: 0.4 }} />
            <Typography sx={{ mt: 1 }}>No goals yet.</Typography>
            {canCreate && <Button sx={{ mt: 1 }} startIcon={<AddIcon />} onClick={openCreate}>Create your first goal</Button>}
          </Box>
        ) : (
          <Masonry columns={{ xs: 1, sm: 2, lg: 3 }} spacing={2.5}>
            {goals.map((goal) => (
              <GoalCard key={goal._id} goal={goal} onClick={() => setDetailId(goal._id)} />
            ))}
          </Masonry>
        )
      )}

      <GoalDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        goal={editing}
        saving={saveMutation.isPending}
        error={saveError}
      />

      <GoalDetailDrawer
        open={Boolean(detailId)}
        goalId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(goal) => { setDetailId(null); openEdit(goal); }}
        onChanged={invalidate}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import goals from Excel / PDF"
        entity="goals (personal and business objectives with progress targets)"
        fields={GOAL_IMPORT_FIELDS}
        buildPayload={buildGoalImportPayload}
        createFn={(payload) => goalsApi.create(payload)}
        onDone={invalidate}
      />
    </Box>
  );
}

function GoalCard({ goal, onClick }) {
  const milestones = goal.milestoneProgress || { total: 0, done: 0 };
  const target = formatTarget(goal.target);
  return (
    <Card
      sx={{
        bgcolor: '#FFFFFF',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        boxShadow: 'none',
        transition: 'box-shadow 180ms ease, transform 180ms ease',
        '&:hover': { boxShadow: '0 10px 30px rgba(15,23,42,0.08)', transform: 'translateY(-2px)' },
      }}
    >
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
            <Chip label={GOAL_TYPE_LABELS[goal.type] || goal.type} size="small" sx={SOFT_CHIP.default} />
            <Chip label={GOAL_STATUS_LABELS[goal.status] || goal.status} size="small" sx={statusChipSx(goal.status)} />
          </Box>

          <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35, color: 'text.primary' }}>{goal.title}</Typography>

          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="caption" color="text.secondary">Progress</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>{goal.progress || 0}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={Math.min(100, goal.progress || 0)} sx={{ height: 6, borderRadius: 99 }} />
          </Box>

          {target && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              {target}
            </Typography>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
            <Stack direction="row" spacing={2}>
              {milestones.total > 0 && (
                <Typography variant="caption" color="text.disabled">
                  Milestones: {milestones.done}/{milestones.total}
                </Typography>
              )}
              {goal.targetDate && (
                <Typography variant="caption" color="text.secondary">Due {formatDate(goal.targetDate)}</Typography>
              )}
            </Stack>
            {goal.owner && (
              <Tooltip title={goal.owner.name || ''}>
                <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: 'primary.main' }}>
                  {initials(goal.owner.name)}
                </Avatar>
              </Tooltip>
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

const emptyForm = {
  title: '', description: '', type: 'monthly', status: 'not_started',
  startDate: '', targetDate: '', targetMetric: '', targetUnit: '', targetValue: '',
  tags: '', progress: 0,
};

function GoalDialog({ open, onClose, onSave, goal, saving, error }) {
  const isEdit = Boolean(goal);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm(
      goal
        ? {
            title: goal.title || '',
            description: goal.description || '',
            type: goal.type || 'monthly',
            status: goal.status || 'not_started',
            startDate: toDateInput(goal.startDate),
            targetDate: toDateInput(goal.targetDate),
            targetMetric: goal.target?.metric || '',
            targetUnit: goal.target?.unit || '',
            targetValue: goal.target?.targetValue ?? '',
            tags: (goal.tags || []).join(', '),
            progress: goal.progress || 0,
          }
        : emptyForm
    );
  }, [open, goal]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    const payload = {
      title: form.title.trim(),
      description: form.description,
      type: form.type,
      status: form.status,
      progress: Number(form.progress) || 0,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      target: {
        metric: form.targetMetric.trim(),
        unit: form.targetUnit.trim(),
        targetValue: form.targetValue !== '' ? Number(form.targetValue) : null,
      },
    };
    if (form.startDate) payload.startDate = new Date(form.startDate).toISOString();
    else if (isEdit) payload.startDate = null;
    if (form.targetDate) payload.targetDate = new Date(form.targetDate).toISOString();
    else if (isEdit) payload.targetDate = null;
    onSave(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit goal' : 'New goal'}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} fullWidth required autoFocus sx={{ mb: 2 }} />
        <TextField label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} fullWidth multiline minRows={2} sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField select label="Type" value={form.type} onChange={(e) => set('type', e.target.value)} sx={{ flex: '1 1 160px' }}>
            {GOAL_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{GOAL_TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>
          <TextField select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)} sx={{ flex: '1 1 160px' }}>
            {GOAL_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>{GOAL_STATUS_LABELS[s]}</MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField label="Start date" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: '1 1 160px' }} />
          <TextField label="Target date" type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} InputLabelProps={{ shrink: true }} sx={{ flex: '1 1 160px' }} />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField label="Target metric" placeholder="e.g. New clients" value={form.targetMetric} onChange={(e) => set('targetMetric', e.target.value)} sx={{ flex: '2 1 180px' }} />
          <TextField label="Unit" placeholder="e.g. clients" value={form.targetUnit} onChange={(e) => set('targetUnit', e.target.value)} sx={{ flex: '1 1 110px' }} />
          <TextField label="Target value" type="number" value={form.targetValue} onChange={(e) => set('targetValue', e.target.value)} sx={{ flex: '1 1 120px' }} />
        </Box>

        <TextField label="Tags (comma-separated)" value={form.tags} onChange={(e) => set('tags', e.target.value)} fullWidth sx={{ mb: 2 }} />

        <Box sx={{ px: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Progress: {form.progress}%</Typography>
          <Slider
            value={Number(form.progress) || 0}
            onChange={(_e, v) => set('progress', v)}
            min={0}
            max={100}
            step={5}
            valueLabelDisplay="auto"
            size="small"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !form.title.trim()}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function GoalDetailDrawer({ open, goalId, onClose, onEdit, onChanged }) {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canEdit = perms.update;
  const canDelete = perms.delete;

  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [currentValueInput, setCurrentValueInput] = useState('');
  const [suggestions, setSuggestions] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['goal', goalId],
    queryFn: () => goalsApi.get(goalId),
    enabled: open && Boolean(goalId),
  });

  const tasksQuery = useQuery({
    queryKey: ['goal-tasks', goalId],
    queryFn: () => goalsApi.linkedTasks(goalId),
    enabled: open && Boolean(goalId),
  });

  const goal = data?.goal;
  const children = data?.children || [];
  const linkedTasks = tasksQuery.data || [];

  useEffect(() => {
    if (!open) setSuggestions(null);
  }, [open]);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['goal', goalId] });
    onChanged?.();
  };

  const addMilestoneM = useMutation({
    mutationFn: () => goalsApi.addMilestone(goalId, {
      title: milestoneTitle.trim(),
      ...(milestoneDue ? { dueDate: new Date(milestoneDue).toISOString() } : {}),
    }),
    onSuccess: () => { setMilestoneTitle(''); setMilestoneDue(''); refetch(); },
  });
  const toggleMilestoneM = useMutation({
    mutationFn: (itemId) => goalsApi.toggleMilestone(goalId, itemId),
    onSuccess: refetch,
  });
  const addChecklistM = useMutation({
    mutationFn: () => goalsApi.addChecklistItem(goalId, checklistText.trim()),
    onSuccess: () => { setChecklistText(''); refetch(); },
  });
  const toggleChecklistM = useMutation({
    mutationFn: (itemId) => goalsApi.toggleChecklistItem(goalId, itemId),
    onSuccess: refetch,
  });
  const progressM = useMutation({
    mutationFn: (body) => goalsApi.updateProgress(goalId, body),
    onSuccess: () => { setCurrentValueInput(''); refetch(); },
  });
  const deleteM = useMutation({
    mutationFn: () => goalsApi.remove(goalId),
    onSuccess: () => { onClose(); onChanged?.(); },
  });
  const suggestM = useMutation({
    mutationFn: () => goalsApi.aiSuggestions(goalId),
    onSuccess: (res) => setSuggestions(res),
  });

  const milestones = goal?.milestones || [];
  const checklist = goal?.checklist || [];
  const hasTargetValue = Number(goal?.target?.targetValue) > 0;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 } } }}>
      {isLoading || !goal ? (
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ p: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              <Chip label={GOAL_TYPE_LABELS[goal.type] || goal.type} size="small" sx={SOFT_CHIP.default} />
              <Chip label={GOAL_STATUS_LABELS[goal.status] || goal.status} size="small" sx={statusChipSx(goal.status)} />
            </Box>
            <Box>
              {canEdit && <IconButton size="small" onClick={() => onEdit(goal)}><EditIcon fontSize="small" /></IconButton>}
              {canDelete && (
                <IconButton size="small" color="error" onClick={() => { if (window.confirm('Delete this goal? Its sub-goals will become top-level goals.')) deleteM.mutate(); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
            </Box>
          </Box>

          <Typography variant="h6" sx={{ mt: 1.5 }}>{goal.title}</Typography>
          {goal.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
              {goal.description}
            </Typography>
          )}

          {/* Progress */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="subtitle2">Progress</Typography>
              <Typography variant="subtitle2">{goal.progress || 0}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={Math.min(100, goal.progress || 0)} sx={{ height: 7, borderRadius: 99 }} />
          </Box>

          {/* Meta */}
          <Stack direction="row" spacing={3} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
            <Meta label="Start">{formatDate(goal.startDate) || '—'}</Meta>
            <Meta label="Target date">{formatDate(goal.targetDate) || '—'}</Meta>
            <Meta label="Target">{formatTarget(goal.target) || '—'}</Meta>
            <Meta label="Owner">{goal.owner?.name || '—'}</Meta>
          </Stack>

          {/* Update the tracked current value (derives progress server-side). */}
          {canEdit && hasTargetValue && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
              <TextField
                size="small"
                type="number"
                placeholder={`Current ${goal.target?.unit || 'value'}`}
                value={currentValueInput}
                onChange={(e) => setCurrentValueInput(e.target.value)}
                sx={{ width: 170 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={currentValueInput === '' || progressM.isPending}
                onClick={() => progressM.mutate({ currentValue: Number(currentValueInput) })}
              >
                Update
              </Button>
            </Box>
          )}

          {/* AI suggestions */}
          <Box sx={{ mt: 3 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={suggestM.isPending ? <CircularProgress size={14} /> : <SmartToyIcon />}
              onClick={() => suggestM.mutate()}
              disabled={suggestM.isPending}
            >
              AI suggestions
            </Button>
            {suggestM.error && (
              <Alert severity="error" sx={{ mt: 1 }}>{getErrorMessage(suggestM.error, 'Failed to get suggestions')}</Alert>
            )}
            {suggestions && (
              <Alert icon={false} severity="info" sx={{ mt: 1, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {suggestions.suggestions}
                <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.7 }}>via {suggestions.provider}</Typography>
              </Alert>
            )}
          </Box>

          <Divider sx={{ mt: 3, mb: 0 }} />

          {/* Milestones */}
          <Section title={`Milestones${milestones.length ? ` (${milestones.filter((m) => m.done).length}/${milestones.length})` : ''}`}>
            {milestones.map((m) => (
              <Box key={m._id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox size="small" checked={m.done} onChange={() => toggleMilestoneM.mutate(m._id)} disabled={!canEdit} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'text.disabled' : 'text.primary' }}>
                    {m.title}
                  </Typography>
                  {m.dueDate && (
                    <Typography variant="caption" color="text.secondary">Due {formatDate(m.dueDate)}</Typography>
                  )}
                </Box>
              </Box>
            ))}
            {milestones.length === 0 && (
              <Typography variant="body2" color="text.secondary">No milestones yet.</Typography>
            )}
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  placeholder="Add milestone…"
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  sx={{ flex: '1 1 160px' }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && milestoneTitle.trim()) addMilestoneM.mutate(); }}
                />
                <TextField size="small" type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} sx={{ width: 150 }} />
                <IconButton onClick={() => milestoneTitle.trim() && addMilestoneM.mutate()} disabled={addMilestoneM.isPending}><AddIcon /></IconButton>
              </Box>
            )}
          </Section>

          {/* Checklist */}
          <Section title={`Checklist${checklist.length ? ` (${checklist.filter((c) => c.done).length}/${checklist.length})` : ''}`}>
            {checklist.map((item) => (
              <Box key={item._id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox size="small" checked={item.done} onChange={() => toggleChecklistM.mutate(item._id)} disabled={!canEdit} />
                <Typography variant="body2" sx={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'text.disabled' : 'text.primary' }}>
                  {item.text}
                </Typography>
              </Box>
            ))}
            {checklist.length === 0 && (
              <Typography variant="body2" color="text.secondary">No checklist items yet.</Typography>
            )}
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <TextField
                  size="small"
                  placeholder="Add item…"
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  fullWidth
                  onKeyDown={(e) => { if (e.key === 'Enter' && checklistText.trim()) addChecklistM.mutate(); }}
                />
                <IconButton onClick={() => checklistText.trim() && addChecklistM.mutate()} disabled={addChecklistM.isPending}><AddIcon /></IconButton>
              </Box>
            )}
          </Section>

          {/* Sub-goals */}
          {children.length > 0 && (
            <Section title={`Sub-goals (${children.length})`}>
              {children.map((child) => (
                <Box key={child._id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Chip label={GOAL_STATUS_LABELS[child.status] || child.status} size="small" sx={{ height: 20, ...statusChipSx(child.status) }} />
                  <Typography variant="body2" sx={{ flex: 1 }}>{child.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{child.progress || 0}%</Typography>
                </Box>
              ))}
            </Section>
          )}

          {/* Linked tasks */}
          <Section title={`Linked tasks${linkedTasks.length ? ` (${linkedTasks.length})` : ''}`}>
            {tasksQuery.isLoading && <CircularProgress size={18} />}
            {!tasksQuery.isLoading && linkedTasks.length === 0 && (
              <Typography variant="body2" color="text.secondary">No tasks linked to this goal.</Typography>
            )}
            {linkedTasks.length > 0 && (
              <List dense disablePadding>
                {linkedTasks.map((t) => (
                  <ListItem key={t._id} disableGutters>
                    <Chip label={TASK_STATUS_LABELS[t.status] || t.status} size="small" sx={{ mr: 1, bgcolor: STATUS_ACCENT[t.status], color: '#fff', height: 20 }} />
                    <ListItemText primary={t.title} primaryTypographyProps={{ fontSize: 13 }} />
                  </ListItem>
                ))}
              </List>
            )}
          </Section>
        </Box>
      )}
    </Drawer>
  );
}

function Meta({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ fontSize: 14, mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  );
}
