import { Paper, Box, Typography, Chip, Avatar, AvatarGroup, Tooltip } from '@mui/material';
import CommentIcon from '@mui/icons-material/ChatBubbleOutline';
import ChecklistIcon from '@mui/icons-material/CheckBoxOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { initials, formatDate, isOverdue } from './taskMeta.js';

/** Soft chip palette — muted backgrounds, saturated text. */
const PRIORITY_SOFT = {
  low: { bgcolor: '#F3F4F6', color: '#4B5563' },
  medium: { bgcolor: '#F0F9FF', color: '#0369A1' },
  high: { bgcolor: '#FFFBEB', color: '#B45309' },
  urgent: { bgcolor: '#FEF2F2', color: '#B91C1C' },
};

/** A single Kanban card; draggable only when the viewer may move it. */
export default function TaskCard({ task, onClick, onDragStart, onDragEnd, draggable = true }) {
  const overdue = isOverdue(task.dueDate, task.status);
  const progress = task.checklistProgress || { total: 0, done: 0 };

  return (
    <Paper
      elevation={0}
      draggable={draggable}
      onDragStart={(e) => (draggable ? onDragStart?.(e, task) : e.preventDefault())}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(task)}
      sx={{
        p: 1.75,
        mb: 1.25,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'grab',
        transition: 'box-shadow .15s, transform .15s',
        '&:hover': { boxShadow: '0 10px 30px rgba(15,23,42,0.08)', transform: 'translateY(-2px)' },
        '&:active': { cursor: 'grabbing' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{task.title}</Typography>
        <Chip
          label={task.priority}
          size="small"
          sx={{
            height: 20,
            fontSize: 10,
            textTransform: 'capitalize',
            ...(PRIORITY_SOFT[task.priority] || PRIORITY_SOFT.low),
          }}
        />
      </Box>

      {task.tags?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
          {task.tags.slice(0, 3).map((t) => (
            <Chip
              key={t}
              label={t}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: 10, borderColor: 'divider', color: 'text.secondary' }}
            />
          ))}
        </Box>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          {task.company && (
            <Tooltip title={task.company.name}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: task.company.color || 'primary.main' }} />
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: task.company.color || 'text.secondary', letterSpacing: 0.3 }}>
                  {task.company.code}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {task.dueDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, color: overdue ? 'error.main' : 'text.secondary' }}>
              <ScheduleIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 11.5, fontWeight: overdue ? 700 : 500 }}>{formatDate(task.dueDate)}</Typography>
            </Box>
          )}
          {progress.total > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <ChecklistIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 11.5 }}>{progress.done}/{progress.total}</Typography>
            </Box>
          )}
          {task.comments?.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <CommentIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 11.5 }}>{task.comments.length}</Typography>
            </Box>
          )}
        </Box>

        {task.assignees?.length > 0 && (
          <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11 } }}>
            {task.assignees.map((a) => (
              <Tooltip key={a._id} title={a.name}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>{initials(a.name)}</Avatar>
              </Tooltip>
            ))}
          </AvatarGroup>
        )}
      </Box>
    </Paper>
  );
}
