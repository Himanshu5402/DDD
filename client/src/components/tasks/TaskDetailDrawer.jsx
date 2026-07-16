import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer, Box, Typography, IconButton, Chip, Divider, Avatar, AvatarGroup, Tooltip,
  Checkbox, TextField, Button, LinearProgress, CircularProgress, List, ListItem,
  ListItemText, Alert, Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AddIcon from '@mui/icons-material/Add';
import { tasksApi } from '../../api/tasks.api.js';
import { STATUS_ACCENT, initials, formatDate, formatMinutes } from './taskMeta.js';
import { TASK_STATUS_LABELS } from '../../api/tasks.api.js';
import { useAuth } from '../../auth/AuthContext.jsx';

/** Soft chip palette — muted backgrounds, saturated text. */
const PRIORITY_SOFT = {
  low: { bgcolor: '#F3F4F6', color: '#4B5563' },
  medium: { bgcolor: '#F0F9FF', color: '#0369A1' },
  high: { bgcolor: '#FFFBEB', color: '#B45309' },
  urgent: { bgcolor: '#FEF2F2', color: '#B91C1C' },
};

/** Soft status chip styling derived from the shared accent hex. */
const statusSoft = (status) => ({
  bgcolor: `${STATUS_ACCENT[status] || '#64748b'}1A`,
  color: STATUS_ACCENT[status] || '#64748b',
  fontWeight: 700,
});

export default function TaskDetailDrawer({ open, taskId, onClose, onEdit, onChanged }) {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const canEditAll = hasPermission('tasks', 'update');
  const canDelete = hasPermission('tasks', 'delete');

  const [comment, setComment] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [minutes, setMinutes] = useState('');
  const [summary, setSummary] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId),
    enabled: open && Boolean(taskId),
  });

  const task = data?.task;
  const subtasks = data?.subtasks || [];

  // Jira-style participation: assignees/watchers/creators may work the task
  // (move, comment, checklist, log time) even without tasks:update. The
  // server enforces the same rule.
  const uid = user?._id;
  const isParticipant = Boolean(
    task &&
      uid &&
      ((task.assignees || []).some((a) => (a._id || a) === uid) ||
        (task.watchers || []).some((w) => (w._id || w) === uid) ||
        (task.createdBy?._id || task.createdBy) === uid)
  );
  const canEdit = canEditAll || isParticipant; // gates work actions in this drawer

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    onChanged?.();
  };

  const commentM = useMutation({
    mutationFn: () => tasksApi.addComment(taskId, comment.trim()),
    onSuccess: () => { setComment(''); refetch(); },
  });
  const checklistAddM = useMutation({
    mutationFn: () => tasksApi.addChecklistItem(taskId, checklistText.trim()),
    onSuccess: () => { setChecklistText(''); refetch(); },
  });
  const checklistToggleM = useMutation({
    mutationFn: (itemId) => tasksApi.toggleChecklistItem(taskId, itemId),
    onSuccess: refetch,
  });
  const timeM = useMutation({
    mutationFn: () => tasksApi.logTime(taskId, Number(minutes)),
    onSuccess: () => { setMinutes(''); refetch(); },
  });
  const deleteM = useMutation({
    mutationFn: () => tasksApi.remove(taskId),
    onSuccess: () => { onClose(); onChanged?.(); },
  });
  const summaryM = useMutation({
    mutationFn: () => tasksApi.aiSummary(taskId),
    onSuccess: (res) => setSummary(res),
  });

  const progress = task?.checklistProgress || { total: 0, done: 0 };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 } } }}>
      {isLoading || !task ? (
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ p: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip label={TASK_STATUS_LABELS[task.status]} size="small" sx={statusSoft(task.status)} />
              <Chip
                label={task.priority}
                size="small"
                sx={{ textTransform: 'capitalize', ...(PRIORITY_SOFT[task.priority] || PRIORITY_SOFT.low) }}
              />
              {task.company && (
                <Chip
                  label={task.company.name}
                  size="small"
                  icon={
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: task.company.color || 'primary.main',
                        ml: 0.75,
                      }}
                    />
                  }
                  sx={{ bgcolor: '#FFFFFF', border: '1px solid', borderColor: 'divider', color: 'text.primary' }}
                />
              )}
            </Box>
            <Box>
              {canEditAll && <IconButton size="small" onClick={() => onEdit(task)}><EditIcon fontSize="small" /></IconButton>}
              {canDelete && (
                <IconButton size="small" color="error" onClick={() => { if (window.confirm('Delete this task?')) deleteM.mutate(); }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
            </Box>
          </Box>

          <Typography variant="h6" sx={{ mt: 2 }}>{task.title}</Typography>
          {task.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
              {task.description}
            </Typography>
          )}

          {/* Meta */}
          <Stack direction="row" spacing={3} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
            <Meta label="Due">{formatDate(task.dueDate) || '—'}</Meta>
            <Meta label="Estimate">{task.estimatedMinutes ? formatMinutes(task.estimatedMinutes) : '—'}</Meta>
            <Meta label="Logged">{formatMinutes(task.timeSpentMinutes)}</Meta>
            <Meta label="Assignees">
              {task.assignees?.length ? (
                <AvatarGroup max={4} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
                  {task.assignees.map((a) => (
                    <Tooltip key={a._id} title={a.name}><Avatar sx={{ bgcolor: 'primary.main' }}>{initials(a.name)}</Avatar></Tooltip>
                  ))}
                </AvatarGroup>
              ) : '—'}
            </Meta>
          </Stack>

          {/* AI summary */}
          <Box sx={{ mt: 3 }}>
            <Button size="small" variant="outlined" startIcon={summaryM.isPending ? <CircularProgress size={14} /> : <SmartToyIcon />} onClick={() => summaryM.mutate()} disabled={summaryM.isPending}>
              Summarize with AI
            </Button>
            {summary && (
              <Alert icon={false} severity="info" sx={{ mt: 1, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {summary.summary}
                <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.7 }}>via {summary.provider}</Typography>
              </Alert>
            )}
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Checklist */}
          <Section title={`Checklist${progress.total ? ` (${progress.done}/${progress.total})` : ''}`}>
            {progress.total > 0 && (
              <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} sx={{ height: 6, borderRadius: 3, mb: 1 }} />
            )}
            {task.checklist?.map((item) => (
              <Box key={item._id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox size="small" checked={item.done} onChange={() => checklistToggleM.mutate(item._id)} disabled={!canEdit} />
                <Typography variant="body2" sx={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'text.disabled' : 'text.primary' }}>
                  {item.text}
                </Typography>
              </Box>
            ))}
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <TextField size="small" placeholder="Add item…" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} fullWidth
                  onKeyDown={(e) => { if (e.key === 'Enter' && checklistText.trim()) checklistAddM.mutate(); }} />
                <IconButton onClick={() => checklistText.trim() && checklistAddM.mutate()} disabled={checklistAddM.isPending}><AddIcon /></IconButton>
              </Box>
            )}
          </Section>

          {/* Time log */}
          {canEdit && (
            <Section title="Log time">
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" type="number" placeholder="minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} sx={{ width: 130 }} />
                <Button variant="outlined" size="small" onClick={() => Number(minutes) > 0 && timeM.mutate()} disabled={timeM.isPending || !Number(minutes)}>Log</Button>
              </Box>
            </Section>
          )}

          {/* Subtasks */}
          {subtasks.length > 0 && (
            <Section title={`Subtasks (${subtasks.length})`}>
              <List dense disablePadding>
                {subtasks.map((s) => (
                  <ListItem key={s._id} disableGutters>
                    <Chip label={TASK_STATUS_LABELS[s.status]} size="small" sx={{ mr: 1, height: 20, ...statusSoft(s.status) }} />
                    <ListItemText primary={s.title} primaryTypographyProps={{ fontSize: 13 }} />
                  </ListItem>
                ))}
              </List>
            </Section>
          )}

          {/* Comments */}
          <Section title={`Comments${task.comments?.length ? ` (${task.comments.length})` : ''}`}>
            {task.comments?.map((c) => (
              <Box key={c._id} sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: 'secondary.main' }}>{initials(c.author?.name)}</Avatar>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{c.author?.name}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.body}</Typography>
                </Box>
              </Box>
            ))}
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField size="small" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth multiline maxRows={4} />
                <Button variant="contained" size="small" onClick={() => comment.trim() && commentM.mutate()} disabled={commentM.isPending || !comment.trim()}>Send</Button>
              </Box>
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
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  );
}
