import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Typography, Button, CircularProgress, Alert, Chip, TextField, InputAdornment, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import PageHeader from '../../components/ui/PageHeader.jsx';
import TaskCard from '../../components/tasks/TaskCard.jsx';
import TaskDialog from '../../components/tasks/TaskDialog.jsx';
import TaskDetailDrawer from '../../components/tasks/TaskDetailDrawer.jsx';
import { STATUS_ACCENT } from '../../components/tasks/taskMeta.js';
import { tasksApi, TASK_STATUS_LABELS } from '../../api/tasks.api.js';
import api, { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function TasksBoardPage() {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const canCreate = hasPermission('tasks', 'create');
  const canMove = hasPermission('tasks', 'update');

  // Jira-style: even without tasks:update, users may move tasks they
  // participate in (assignee/watcher/creator). The server enforces the same rule.
  const canDragTask = (task) => {
    if (canMove) return true;
    const uid = user?._id;
    if (!uid) return false;
    return (
      (task.assignees || []).some((a) => (a._id || a) === uid) ||
      (task.watchers || []).some((w) => (w._id || w) === uid) ||
      (task.createdBy?._id || task.createdBy) === uid
    );
  };

  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data.companies;
    },
    staleTime: 5 * 60_000,
  });

  const boardQuery = useQuery({
    queryKey: ['tasks-board', search, companyFilter, mineOnly],
    queryFn: () =>
      tasksApi.board({
        ...(search ? { search } : {}),
        ...(companyFilter ? { company: companyFilter } : {}),
        ...(mineOnly ? { mine: 'true' } : {}),
      }),
  });

  const invalidateBoard = () => qc.invalidateQueries({ queryKey: ['tasks-board'] });

  // Live updates: refetch the board whenever any client changes a task.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => invalidateBoard();
    socket.on('tasks:changed', handler);
    return () => socket.off('tasks:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload) => (editing ? tasksApi.update(editing._id, payload) : tasksApi.create(payload)),
    onSuccess: () => { setDialogOpen(false); setSaveError(''); invalidateBoard(); },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save task')),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, status }) => tasksApi.move(id, { status }),
    onSuccess: invalidateBoard,
  });

  const columns = boardQuery.data?.columns || [];

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (task) => { setEditing(task); setSaveError(''); setDialogOpen(true); };

  const onDragStart = (e, task) => e.dataTransfer.setData('text/taskId', task._id);
  const onDrop = (e, status) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('text/taskId');
    // Drags can only start from cards the viewer may move; the server
    // enforces the same participant rule as a backstop.
    if (id) moveMutation.mutate({ id, status });
  };

  return (
    <Box>
      <PageHeader
        title="Tasks"
        subtitle="Kanban board — drag cards between columns."
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New task</Button>}
          </Box>
        }
      />

      {/* Company filter — the owner's businesses */}
      {companies.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            label="My tasks"
            size="small"
            onClick={() => setMineOnly((v) => !v)}
            sx={
              mineOnly
                ? { bgcolor: '#111827', color: '#fff', '&:hover': { bgcolor: '#1F2937' } }
                : { bgcolor: '#FFFFFF', border: '1px solid', borderColor: 'divider', color: 'text.secondary' }
            }
          />
          <Chip
            label="All companies"
            size="small"
            onClick={() => setCompanyFilter('')}
            sx={
              !companyFilter
                ? { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }
                : { bgcolor: '#FFFFFF', border: '1px solid', borderColor: 'divider', color: 'text.secondary' }
            }
          />
          {companies.map((c) => (
            <Chip
              key={c._id}
              size="small"
              label={c.name}
              onClick={() => setCompanyFilter(companyFilter === c._id ? '' : c._id)}
              icon={
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: companyFilter === c._id ? '#fff' : c.color,
                    ml: 0.75,
                  }}
                />
              }
              sx={
                companyFilter === c._id
                  ? { bgcolor: c.color, color: '#fff' }
                  : { bgcolor: '#FFFFFF', border: '1px solid', borderColor: 'divider', color: 'text.primary' }
              }
            />
          ))}
        </Stack>
      )}

      {boardQuery.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {boardQuery.error && <Alert severity="error">{getErrorMessage(boardQuery.error)}</Alert>}

      {!boardQuery.isLoading && !boardQuery.error && (
        <Box sx={{ display: 'flex', gap: 2.5, overflowX: 'auto', pb: 2, alignItems: 'flex-start' }}>
          {columns.map((col) => (
            <Box
              key={col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={() => setDragOverCol((c) => (c === col.status ? null : c))}
              onDrop={(e) => onDrop(e, col.status)}
              sx={{
                minWidth: 300,
                width: 300,
                bgcolor: dragOverCol === col.status ? '#EEF2FF' : '#F1F3F7',
                borderRadius: 3,
                p: 1.5,
                border: '1px solid',
                borderColor: dragOverCol === col.status ? 'primary.main' : 'transparent',
                transition: 'background-color .15s, border-color .15s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.75, mb: 1.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_ACCENT[col.status] }} />
                <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{TASK_STATUS_LABELS[col.status]}</Typography>
                <Chip
                  label={col.tasks.length}
                  size="small"
                  sx={{ height: 18, fontSize: 11, fontWeight: 700, bgcolor: '#E5E9F0', color: 'text.secondary' }}
                />
              </Box>

              {col.tasks.map((task) => (
                <TaskCard
                  key={task._id}
                  task={task}
                  onClick={() => setDetailId(task._id)}
                  onDragStart={onDragStart}
                  draggable={canDragTask(task)}
                />
              ))}

              {col.tasks.length === 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', py: 4 }}>
                  Drop tasks here
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      <TaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        task={editing}
        saving={saveMutation.isPending}
        error={saveError}
      />

      <TaskDetailDrawer
        open={Boolean(detailId)}
        taskId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(task) => { setDetailId(null); openEdit(task); }}
        onChanged={invalidateBoard}
      />
    </Box>
  );
}
