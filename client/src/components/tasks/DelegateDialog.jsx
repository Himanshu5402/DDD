import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert, Box,
  Checkbox, Avatar, Typography, TextField, CircularProgress, ListItemButton,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { tasksApi } from '../../api/tasks.api.js';
import { usersApi } from '../../api/users.api.js';
import api, { getErrorMessage } from '../../lib/axios.js';
import { useAuth } from '../../auth/AuthContext.jsx';

function initialsOf(name = '') {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * Delegate a task down the org chart. Managers pick from their direct reports
 * (GET /users/my-team); users with users:read (admins) see everyone.
 */
export default function DelegateDialog({ task, open, onClose, onDelegated }) {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [note, setNote] = useState('');

  const canSeeAllUsers = hasPermission('users', 'read');

  const teamQuery = useQuery({
    queryKey: ['my-team'],
    queryFn: usersApi.myTeam,
    enabled: open,
  });

  const allUsersQuery = useQuery({
    queryKey: ['users-min'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 100, sort: 'name' } });
      return res.data.data;
    },
    enabled: open && canSeeAllUsers,
  });

  const team = teamQuery.data || [];
  const teamIds = new Set(team.map((t) => t._id));
  // Admins can also hand off to people outside their own reports.
  const others = canSeeAllUsers
    ? (allUsersQuery.data || []).filter((u) => !teamIds.has(u._id) && u._id !== user?._id)
    : [];

  const delegateMutation = useMutation({
    mutationFn: () => tasksApi.delegate(task._id, { assignees: selected, note: note.trim() || undefined }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
      qc.invalidateQueries({ queryKey: ['task', task._id] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
      setSelected([]);
      setNote('');
      onDelegated?.(updated);
      onClose();
    },
  });

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const renderPerson = (person) => (
    <ListItemButton
      key={person._id}
      onClick={() => toggle(person._id)}
      selected={selected.includes(person._id)}
      sx={{ borderRadius: 2, py: 0.75 }}
    >
      <Checkbox size="small" checked={selected.includes(person._id)} sx={{ mr: 0.5, p: 0.5 }} />
      <Avatar sx={{ width: 30, height: 30, fontSize: 12, mr: 1.25, bgcolor: '#EEF2FF', color: '#4338CA' }}>
        {initialsOf(person.name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{person.name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {person.designation || person.email}
        </Typography>
      </Box>
    </ListItemButton>
  );

  const loading = teamQuery.isLoading || (canSeeAllUsers && allUsersQuery.isLoading);
  const nobody = !loading && team.length === 0 && others.length === 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Delegate task</DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Hand off <b>{task?.title}</b>. You'll stay a watcher, so you keep full visibility.
        </Typography>

        {delegateMutation.error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>{getErrorMessage(delegateMutation.error)}</Alert>
        )}

        {loading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}><CircularProgress size={22} /></Box>
        )}

        {nobody && (
          <Alert severity="info">
            You have no direct reports to delegate to. Ask an admin to set up your team in the org chart.
          </Alert>
        )}

        {team.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary">My team</Typography>
            {team.map(renderPerson)}
          </>
        )}
        {others.length > 0 && (
          <>
            <Typography variant="overline" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Everyone else
            </Typography>
            {others.map(renderPerson)}
          </>
        )}

        <TextField
          label="Note (optional)"
          placeholder="Context for the person taking this over…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<SendIcon />}
          disabled={!selected.length || delegateMutation.isPending}
          onClick={() => delegateMutation.mutate()}
        >
          Delegate{selected.length > 1 ? ` to ${selected.length}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
