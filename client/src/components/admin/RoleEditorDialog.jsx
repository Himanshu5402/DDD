import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  Typography,
  Alert,
  Chip,
} from '@mui/material';

const ACTION_ORDER = ['create', 'read', 'update', 'delete', 'manage'];

const prettyModule = (m) =>
  m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Create/edit a role. Renders a module × action permission matrix built from
 * the permission catalog. `role` = null → create mode.
 */
export default function RoleEditorDialog({ open, onClose, onSave, role, catalog, saving, error }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState(0);
  const [selected, setSelected] = useState(() => new Set());

  const isEdit = Boolean(role);
  const isSystem = Boolean(role?.isSystem);

  // Columns = union of actions present in the catalog, in canonical order.
  const actions = useMemo(() => {
    const present = new Set();
    Object.values(catalog || {}).forEach((perms) => perms.forEach((p) => present.add(p.action)));
    return ACTION_ORDER.filter((a) => present.has(a));
  }, [catalog]);

  const modules = useMemo(() => Object.keys(catalog || {}).sort(), [catalog]);

  useEffect(() => {
    if (!open) return;
    setName(role?.name || '');
    setDescription(role?.description || '');
    setLevel(role?.level ?? 0);
    setSelected(new Set((role?.permissions || []).map((p) => p._id)));
  }, [open, role]);

  const permId = (module, action) => catalog[module]?.find((p) => p.action === action)?._id;

  const toggle = (module, action) => {
    const id = permId(module, action);
    if (!id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleRow = (module) => {
    const ids = (catalog[module] || []).map((p) => p._id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const handleSave = () => {
    onSave({ name, description, level: Number(level), permissions: [...selected] });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? `Edit role: ${role.name}` : 'Create role'}</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {isSystem && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This is a system role — its permissions can be edited, but its slug and level are locked.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ flex: '1 1 200px' }}
            required
          />
          <TextField
            label="Level"
            type="number"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={isSystem}
            sx={{ width: 120 }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ flex: '1 1 100%' }}
          />
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Permissions{' '}
          <Chip label={`${selected.size} selected`} size="small" sx={{ ml: 1 }} />
        </Typography>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'auto', maxHeight: 380 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Module</TableCell>
                {actions.map((a) => (
                  <TableCell key={a} align="center" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                    {a}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {modules.map((module) => {
                const ids = (catalog[module] || []).map((p) => p._id);
                const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
                const someOn = ids.some((id) => selected.has(id));
                return (
                  <TableRow key={module} hover>
                    <TableCell>
                      <Checkbox
                        size="small"
                        checked={allOn}
                        indeterminate={!allOn && someOn}
                        onChange={() => toggleRow(module)}
                      />
                      {prettyModule(module)}
                    </TableCell>
                    {actions.map((action) => {
                      const id = permId(module, action);
                      return (
                        <TableCell key={action} align="center">
                          {id ? (
                            <Checkbox size="small" checked={selected.has(id)} onChange={() => toggle(module, action)} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
