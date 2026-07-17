import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Box, Button, CircularProgress, Divider, IconButton, Menu, Tooltip, Typography, Avatar,
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { notificationsApi } from '../../api/notifications.api.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const TYPE_ICON = {
  task_assigned: AssignmentIndIcon,
  task_delegated: AssignmentIndIcon,
  task_completed: TaskAltIcon,
  task_commented: ChatBubbleOutlineIcon,
};

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Topbar notification bell: unread badge + dropdown feed, updated in real time
 * via the per-user `notification:new` socket event.
 */
export default function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000, // safety net; real-time path is the socket event
  });

  const feedQuery = useQuery({
    queryKey: ['notifications', 'feed'],
    queryFn: () => notificationsApi.list({ limit: 15 }),
    enabled: open, // fetch when the dropdown opens
  });

  // Real-time: a notification addressed to me arrives on my user room.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      // A notification means something changed for me — refresh my surfaces.
      qc.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
      qc.invalidateQueries({ queryKey: ['tasks-board'] });
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [qc]);

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = unreadQuery.data ?? 0;
  const items = feedQuery.data?.items || [];

  const openNotification = (n) => {
    if (!n.read) markRead.mutate(n._id);
    setAnchor(null);
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 400, maxHeight: 480 } } }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700 }}>Notifications</Typography>
          {unread > 0 && (
            <Button size="small" startIcon={<DoneAllIcon />} onClick={() => markAll.mutate()}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />

        {feedQuery.isLoading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        )}

        {!feedQuery.isLoading && items.length === 0 && (
          <Typography sx={{ px: 2, py: 4, textAlign: 'center' }} color="text.secondary" variant="body2">
            You're all caught up 🎉
          </Typography>
        )}

        {items.map((n) => {
          const Icon = TYPE_ICON[n.type] || NotificationsNoneIcon;
          return (
            <Box
              key={n._id}
              onClick={() => openNotification(n)}
              sx={{
                px: 2, py: 1.25, display: 'flex', gap: 1.5, cursor: 'pointer',
                bgcolor: n.read ? 'transparent' : '#EEF2FF',
                '&:hover': { bgcolor: n.read ? 'action.hover' : '#E0E7FF' },
              }}
            >
              <Avatar sx={{ width: 34, height: 34, bgcolor: n.read ? 'grey.100' : '#EEF2FF', color: '#4338CA' }}>
                <Icon sx={{ fontSize: 18 }} />
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: n.read ? 500 : 700, lineHeight: 1.35 }}>
                  {n.message}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {n.actor?.name ? `${n.actor.name} · ` : ''}{timeAgo(n.createdAt)}
                </Typography>
              </Box>
              {!n.read && (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', mt: 1, flexShrink: 0 }} />
              )}
            </Box>
          );
        })}
      </Menu>
    </>
  );
}
