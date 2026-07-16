import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/ui/PageHeader.jsx';
import RoleEditorDialog from '../components/admin/RoleEditorDialog.jsx';
import { rolesApi } from '../api/roles.api.js';
import { getErrorMessage } from '../lib/axios.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function RolesPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('roles', 'update') || hasPermission('roles', 'create');

  const [editing, setEditing] = useState(null); // role object or {} for create
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState('');

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const catalogQuery = useQuery({ queryKey: ['permission-catalog'], queryFn: rolesApi.catalog });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing?._id ? rolesApi.update(editing._id, payload) : rolesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setDialogOpen(false);
      setSaveError('');
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save role')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => rolesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  const roles = rolesQuery.data?.data || [];

  const openCreate = () => {
    setEditing(null);
    setSaveError('');
    setDialogOpen(true);
  };
  const openEdit = (role) => {
    setEditing(role);
    setSaveError('');
    setDialogOpen(true);
  };

  const handleDelete = (role) => {
    if (window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(role._id, {
        onError: (err) => window.alert(getErrorMessage(err, 'Failed to delete role')),
      });
    }
  };

  const loading = rolesQuery.isLoading || catalogQuery.isLoading;

  return (
    <Box>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Define roles and grant module-level permissions."
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New role
            </Button>
          )
        }
      />

      {loading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {rolesQuery.error && <Alert severity="error">{getErrorMessage(rolesQuery.error)}</Alert>}

      {!loading && !rolesQuery.error && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Role</TableCell>
                <TableCell>Level</TableCell>
                <TableCell>Permissions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role._id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{role.name}</Typography>
                      {role.isSuperAdmin && <Chip label="super admin" size="small" color="secondary" />}
                      {role.isSystem && <Chip label="system" size="small" variant="outlined" />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {role.description || role.slug}
                    </Typography>
                  </TableCell>
                  <TableCell>{role.level}</TableCell>
                  <TableCell>
                    <Chip
                      label={role.isSuperAdmin ? 'All' : `${role.permissions?.length || 0} granted`}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    {canManage && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(role)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {hasPermission('roles', 'delete') && !role.isSystem && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(role)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <RoleEditorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        role={editing}
        catalog={catalogQuery.data || {}}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}
