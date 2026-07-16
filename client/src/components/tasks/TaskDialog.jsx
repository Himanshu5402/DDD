import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem,
  Box, Alert, OutlinedInput, Select, InputLabel, FormControl, Checkbox, Chip,
  Avatar, Typography, FormHelperText, ListSubheader,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import api from '../../lib/axios.js';
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES } from '../../api/tasks.api.js';

const toDateInput = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};

const initials = (name = '') =>
  name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

const PRIORITY_META = {
  low: { label: 'Low', color: '#64748b' },
  medium: { label: 'Medium', color: '#0ea5e9' },
  high: { label: 'High', color: '#f59e0b' },
  urgent: { label: 'Urgent', color: '#dc2626' },
};

const empty = {
  title: '', description: '', status: 'todo', priority: 'medium',
  company: '', assignees: [], startDate: '', dueDate: '',
  estimatedMinutes: '', tags: '',
  recurrenceFrequency: 'none', recurrenceInterval: 1,
};

function SectionLabel({ children }) {
  return (
    <Typography
      variant="overline"
      sx={{ display: 'block', color: 'text.secondary', letterSpacing: 1, mt: 2.5, mb: 0.75, lineHeight: 1 }}
    >
      {children}
    </Typography>
  );
}

/**
 * Owner assignment dialog: what needs doing, for which company, by whom,
 * and by when. Company is required — every task belongs to one business.
 */
export default function TaskDialog({ open, onClose, onSave, task, saving, error }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data.companies;
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-min'],
    queryFn: async () => {
      try {
        const res = await api.get('/users', { params: { limit: 100, sort: 'name' } });
        return res.data.data;
      } catch {
        return []; // no users:read permission — assignment picker hidden
      }
    },
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setForm(
      task
        ? {
            title: task.title || '',
            description: task.description || '',
            status: task.status || 'todo',
            priority: task.priority || 'medium',
            company: task.company?._id || task.company || '',
            assignees: (task.assignees || []).map((a) => a._id || a),
            startDate: toDateInput(task.startDate),
            dueDate: toDateInput(task.dueDate),
            estimatedMinutes: task.estimatedMinutes ?? '',
            tags: (task.tags || []).join(', '),
            recurrenceFrequency: task.recurrence?.frequency || 'none',
            recurrenceInterval: task.recurrence?.interval || 1,
          }
        : empty
    );
  }, [open, task]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const companyMissing = !form.company;
  const canSave = form.title.trim() && !companyMissing;

  const handleSave = () => {
    setTouched(true);
    if (!canSave) return;
    const payload = {
      title: form.title.trim(),
      description: form.description,
      priority: form.priority,
      company: form.company,
      assignees: form.assignees,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (!isEdit) payload.status = form.status;
    if (form.startDate) payload.startDate = new Date(form.startDate).toISOString();
    if (form.dueDate) payload.dueDate = new Date(form.dueDate).toISOString();
    if (form.estimatedMinutes !== '') payload.estimatedMinutes = Number(form.estimatedMinutes);
    payload.recurrence = {
      frequency: form.recurrenceFrequency,
      interval: Number(form.recurrenceInterval) || 1,
    };
    onSave(payload);
  };

  const selectedCompany = companies.find((c) => c._id === form.company);

  // Company-aware grouping: the selected company's team first, others after.
  const companyIdOf = (u) => u.company?._id || u.company || null;
  const teamUsers = form.company ? users.filter((u) => companyIdOf(u) === form.company) : users;
  const otherUsers = form.company ? users.filter((u) => companyIdOf(u) !== form.company) : [];

  const renderUserItem = (u) => (
    <MenuItem key={u._id} value={u._id}>
      <Checkbox checked={form.assignees.includes(u._id)} sx={{ mr: 0.5 }} />
      <Avatar sx={{ width: 28, height: 28, mr: 1.25, bgcolor: u.company?.color || 'primary.main', fontSize: 12 }}>
        {initials(u.name)}
      </Avatar>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{u.name}</Typography>
        <Typography variant="caption" color="text.secondary">
          {[u.designation, u.department].filter(Boolean).join(' · ') || u.email}
          {u.company?.code ? ` · ${u.company.code}` : ''}
        </Typography>
      </Box>
    </MenuItem>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {isEdit ? 'Edit task' : 'Assign a task'}
        {!isEdit && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            What needs to be done, for which company, and by whom.
          </Typography>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <SectionLabel>Task</SectionLabel>
        <TextField
          label="Title"
          placeholder="e.g. Prepare Kontrolix dispatch checklist"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          fullWidth
          required
          autoFocus
          error={touched && !form.title.trim()}
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="Description"
          placeholder="Context, links, acceptance criteria…"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          fullWidth
          multiline
          minRows={2}
        />

        <SectionLabel>Company & people</SectionLabel>
        <FormControl fullWidth required error={touched && companyMissing} sx={{ mb: 1.5 }}>
          <InputLabel>Company</InputLabel>
          <Select
            value={form.company}
            onChange={(e) => set('company', e.target.value)}
            input={<OutlinedInput label="Company" />}
            renderValue={(id) => {
              const c = companies.find((x) => x._id === id);
              return c ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color }} />
                  {c.name}
                </Box>
              ) : '';
            }}
          >
            <ListSubheader sx={{ lineHeight: '32px' }}>Owner's companies</ListSubheader>
            {companies.map((c) => (
              <MenuItem key={c._id} value={c._id}>
                <Avatar sx={{ width: 26, height: 26, mr: 1.25, bgcolor: c.color, fontSize: 11, fontWeight: 700 }}>
                  {c.code?.slice(0, 3)}
                </Avatar>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
                  {c.description && (
                    <Typography variant="caption" color="text.secondary">{c.description}</Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
          {touched && companyMissing && <FormHelperText>Select which company this task belongs to</FormHelperText>}
        </FormControl>

        {users.length > 0 && (
          <FormControl fullWidth>
            <InputLabel>Assign to</InputLabel>
            <Select
              multiple
              value={form.assignees}
              onChange={(e) => set('assignees', e.target.value)}
              input={<OutlinedInput label="Assign to" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const u = users.find((x) => x._id === id);
                    return u ? (
                      <Chip
                        key={id}
                        size="small"
                        avatar={<Avatar sx={{ bgcolor: 'primary.main' }}>{initials(u.name)}</Avatar>}
                        label={u.name}
                        sx={{ height: 24 }}
                      />
                    ) : null;
                  })}
                </Box>
              )}
            >
              {form.company && teamUsers.length > 0 && (
                <ListSubheader sx={{ lineHeight: '32px' }}>
                  {selectedCompany ? `${selectedCompany.name} team` : 'Team'}
                </ListSubheader>
              )}
              {teamUsers.map(renderUserItem)}
              {otherUsers.length > 0 && (
                <ListSubheader sx={{ lineHeight: '32px' }}>Other companies</ListSubheader>
              )}
              {otherUsers.map(renderUserItem)}
            </Select>
            <FormHelperText>
              {form.company && teamUsers.length === 0
                ? 'No employees in this company yet — showing everyone'
                : 'Employees or managers responsible for this task'}
            </FormHelperText>
          </FormControl>
        )}

        <SectionLabel>Schedule & priority</SectionLabel>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            select
            label="Priority"
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
            sx={{ flex: '1 1 140px' }}
          >
            {TASK_PRIORITIES.map((p) => (
              <MenuItem key={p} value={p}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: PRIORITY_META[p].color }} />
                  {PRIORITY_META[p].label}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: '1 1 150px' }}
          />
          <TextField
            label="Due date"
            type="date"
            value={form.dueDate}
            onChange={(e) => set('dueDate', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: '1 1 150px' }}
          />
          {!isEdit && (
            <TextField
              select
              label="Starts in column"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
              sx={{ flex: '1 1 150px' }}
            >
              {TASK_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        <SectionLabel>Extras</SectionLabel>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            label="Estimate (min)"
            type="number"
            value={form.estimatedMinutes}
            onChange={(e) => set('estimatedMinutes', e.target.value)}
            sx={{ flex: '1 1 130px' }}
          />
          <TextField
            label="Tags (comma-separated)"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            sx={{ flex: '2 1 200px' }}
          />
          <TextField
            select
            label="Repeat"
            value={form.recurrenceFrequency}
            onChange={(e) => set('recurrenceFrequency', e.target.value)}
            sx={{ flex: '1 1 130px' }}
          >
            {['none', 'daily', 'weekly', 'monthly'].map((f) => (
              <MenuItem key={f} value={f} sx={{ textTransform: 'capitalize' }}>{f}</MenuItem>
            ))}
          </TextField>
          {form.recurrenceFrequency !== 'none' && (
            <TextField
              label="Every N"
              type="number"
              value={form.recurrenceInterval}
              onChange={(e) => set('recurrenceInterval', e.target.value)}
              sx={{ width: 110 }}
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', minWidth: 0 }}>
          {selectedCompany && (
            <>
              <ApartmentIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" noWrap>
                {selectedCompany.name}
                {form.assignees.length > 0 ? ` · ${form.assignees.length} assignee${form.assignees.length > 1 ? 's' : ''}` : ' · unassigned'}
              </Typography>
            </>
          )}
        </Box>
        <Box>
          <Button onClick={onClose} sx={{ mr: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || (touched && !canSave)}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Assign task'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
