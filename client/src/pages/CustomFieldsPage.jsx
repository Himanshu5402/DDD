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
  TextField,
  MenuItem,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/ui/PageHeader.jsx';
import CustomFieldDialog from '../components/admin/CustomFieldDialog.jsx';
import { customFieldsApi } from '../api/customFields.api.js';
import { getErrorMessage } from '../lib/axios.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ENTITY_TYPES = ['user', 'goal', 'task', 'rrrmas', 'product', 'finance', 'maintenance', 'asset'];

export default function CustomFieldsPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('custom_fields', 'create') || hasPermission('custom_fields', 'update');

  const [entityType, setEntityType] = useState('user');
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { data: fields = [], isLoading, error } = useQuery({
    queryKey: ['custom-fields', entityType],
    queryFn: () => customFieldsApi.list(entityType, true),
  });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing?._id ? customFieldsApi.update(editing._id, payload) : customFieldsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-fields', entityType] });
      setDialogOpen(false);
      setSaveError('');
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save field')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => customFieldsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', entityType] }),
  });

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (f) => { setEditing(f); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (f) => {
    if (window.confirm(`Delete custom field "${f.label}"?`)) deleteMutation.mutate(f._id);
  };

  return (
    <Box>
      <PageHeader
        title="Custom Fields"
        subtitle="Extend any entity with admin-defined fields — no code changes."
        action={
          canManage && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              New field
            </Button>
          )
        }
      />

      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <TextField
          select
          size="small"
          label="Entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          {ENTITY_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
      </Paper>

      {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}

      {isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Label</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Required</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No custom fields defined for “{entityType}” yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {fields.map((f) => (
                <TableRow key={f._id} hover>
                  <TableCell>{f.order}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{f.label}</TableCell>
                  <TableCell><code>{f.key}</code></TableCell>
                  <TableCell><Chip label={f.type} size="small" variant="outlined" /></TableCell>
                  <TableCell>{f.required ? <Chip label="required" size="small" color="warning" /> : '—'}</TableCell>
                  <TableCell>
                    <Chip label={f.isActive ? 'active' : 'inactive'} size="small" color={f.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    {canManage && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(f)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {hasPermission('custom_fields', 'delete') && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(f)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <CustomFieldDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        field={editing}
        entityType={entityType}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}
