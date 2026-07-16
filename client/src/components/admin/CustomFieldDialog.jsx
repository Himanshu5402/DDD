import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  FormControlLabel,
  Switch,
  Typography,
  IconButton,
  Alert,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';

const FIELD_TYPES = ['text', 'textarea', 'number', 'boolean', 'date', 'select', 'multiselect', 'email', 'url'];
const OPTION_TYPES = ['select', 'multiselect'];

const emptyForm = {
  key: '',
  label: '',
  type: 'text',
  required: false,
  placeholder: '',
  helpText: '',
  order: 0,
  isActive: true,
  options: [],
  validation: {},
};

/** Create/edit a custom-field definition. `field` = null → create. */
export default function CustomFieldDialog({ open, onClose, onSave, field, entityType, saving, error }) {
  const [form, setForm] = useState(emptyForm);
  const isEdit = Boolean(field);

  useEffect(() => {
    if (!open) return;
    setForm(
      field
        ? {
            key: field.key,
            label: field.label,
            type: field.type,
            required: field.required,
            placeholder: field.placeholder || '',
            helpText: field.helpText || '',
            order: field.order ?? 0,
            isActive: field.isActive,
            options: field.options || [],
            validation: field.validation || {},
          }
        : emptyForm
    );
  }, [open, field]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setValidation = (key, value) =>
    setForm((f) => ({ ...f, validation: { ...f.validation, [key]: value === '' ? undefined : Number.isNaN(Number(value)) ? value : Number(value) } }));

  const addOption = () => set('options', [...form.options, { label: '', value: '' }]);
  const updateOption = (i, k, v) =>
    set('options', form.options.map((o, idx) => (idx === i ? { ...o, [k]: v } : o)));
  const removeOption = (i) => set('options', form.options.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const payload = {
      label: form.label,
      type: form.type,
      required: form.required,
      placeholder: form.placeholder,
      helpText: form.helpText,
      order: Number(form.order) || 0,
      isActive: form.isActive,
      options: OPTION_TYPES.includes(form.type) ? form.options.filter((o) => o.value) : [],
      validation: cleanValidation(form.validation),
    };
    if (!isEdit) {
      payload.entityType = entityType;
      payload.key = form.key;
    }
    onSave(payload);
  };

  const showOptions = OPTION_TYPES.includes(form.type);
  const showNumberValidation = form.type === 'number';
  const showTextValidation = form.type === 'text' || form.type === 'textarea';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? `Edit field: ${field.label}` : `New custom field · ${entityType}`}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="Key"
            value={form.key}
            onChange={(e) => set('key', e.target.value)}
            disabled={isEdit}
            helperText={isEdit ? 'Immutable' : 'e.g. employeeCode'}
            sx={{ flex: '1 1 200px' }}
            required
          />
          <TextField
            label="Label"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            sx={{ flex: '1 1 200px' }}
            required
          />
          <TextField
            select
            label="Type"
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            sx={{ flex: '1 1 160px' }}
          >
            {FIELD_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Order"
            type="number"
            value={form.order}
            onChange={(e) => set('order', e.target.value)}
            sx={{ width: 100 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
          <TextField
            label="Placeholder"
            value={form.placeholder}
            onChange={(e) => set('placeholder', e.target.value)}
            sx={{ flex: '1 1 200px' }}
          />
          <TextField
            label="Help text"
            value={form.helpText}
            onChange={(e) => set('helpText', e.target.value)}
            sx={{ flex: '1 1 200px' }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
          <FormControlLabel
            control={<Switch checked={form.required} onChange={(e) => set('required', e.target.checked)} />}
            label="Required"
          />
          <FormControlLabel
            control={<Switch checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />}
            label="Active"
          />
        </Box>

        {showOptions && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Options</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addOption}>Add option</Button>
            </Box>
            {form.options.length === 0 && (
              <Typography variant="caption" color="text.secondary">Add at least one option.</Typography>
            )}
            {form.options.map((o, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField size="small" label="Label" value={o.label} onChange={(e) => updateOption(i, 'label', e.target.value)} sx={{ flex: 1 }} />
                <TextField size="small" label="Value" value={o.value} onChange={(e) => updateOption(i, 'value', e.target.value)} sx={{ flex: 1 }} />
                <IconButton onClick={() => removeOption(i)} color="error"><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Box>
        )}

        {(showNumberValidation || showTextValidation) && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Validation (optional)</Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {showNumberValidation && (
                <>
                  <TextField size="small" type="number" label="Min" value={form.validation.min ?? ''} onChange={(e) => setValidation('min', e.target.value)} sx={{ width: 120 }} />
                  <TextField size="small" type="number" label="Max" value={form.validation.max ?? ''} onChange={(e) => setValidation('max', e.target.value)} sx={{ width: 120 }} />
                </>
              )}
              {showTextValidation && (
                <>
                  <TextField size="small" type="number" label="Min length" value={form.validation.minLength ?? ''} onChange={(e) => setValidation('minLength', e.target.value)} sx={{ width: 130 }} />
                  <TextField size="small" type="number" label="Max length" value={form.validation.maxLength ?? ''} onChange={(e) => setValidation('maxLength', e.target.value)} sx={{ width: 130 }} />
                  <TextField size="small" label="Pattern (regex)" value={form.validation.pattern ?? ''} onChange={(e) => setForm((f) => ({ ...f, validation: { ...f.validation, pattern: e.target.value || undefined } }))} sx={{ flex: '1 1 180px' }} />
                </>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !form.label.trim() || (!isEdit && !form.key.trim())}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create field'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function cleanValidation(v = {}) {
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined && val !== '' && val !== null) out[k] = val;
  }
  return out;
}
