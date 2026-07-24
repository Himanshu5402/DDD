import { useEffect, useState } from 'react';
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
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Drawer,
  Divider,
  Stack,
  Link,
  Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import PageHeader from '../../components/ui/PageHeader.jsx';
import ImportDialog from '../../components/import/ImportDialog.jsx';
import {
  productsApi,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
} from '../../api/products.api.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const STATUS_COLOR = { development: 'warning', active: 'success', deprecated: 'default' };

function statusChipColor(status) {
  return STATUS_COLOR[status] || 'default';
}

function formatPrice(price, currency = 'INR') {
  if (price === null || price === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' }).format(price);
  } catch {
    return `${price} ${currency || ''}`.trim();
  }
}

const EMPTY_FORM = {
  name: '',
  sku: '',
  category: 'other',
  status: 'active',
  currentVersion: '',
  price: '',
  description: '',
  specs: [], // free-form { name, value } rows — admin adds as many as needed
};

/* ------------------------- File import (Excel/PDF) ------------------------ */

const PRODUCT_IMPORT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'sku', label: 'SKU', hint: 'e.g. PRD-001' },
  { key: 'category', label: 'Category', hint: 'e.g. software / other' },
  { key: 'status', label: 'Status', hint: 'development / active / deprecated' },
  { key: 'currentVersion', label: 'Current version', hint: 'e.g. 1.2.0' },
  { key: 'price', label: 'Price (INR)', hint: 'number ≥ 0' },
  { key: 'description', label: 'Description' },
];

function buildProductImportPayload(m, extras) {
  if (!m.name) throw new Error('Name is required');
  const payload = { name: m.name, specs: extras };
  if (m.sku) payload.sku = m.sku;
  const category = (m.category || '').toLowerCase();
  if (category) payload.category = category;
  const status = (m.status || '').toLowerCase();
  if (PRODUCT_STATUSES.includes(status)) payload.status = status;
  if (m.currentVersion) payload.currentVersion = m.currentVersion;
  if (m.price) {
    // Guard the stripped string: "N/A"/"free" must fail, not become ₹0.
    const raw = String(m.price).replace(/[^0-9.-]/g, '');
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price < 0) throw new Error('Price must be a number ≥ 0');
    payload.price = price;
  }
  if (m.description) payload.description = m.description;
  return payload;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canCreate = perms.create;
  const canUpdate = perms.update;
  const canDelete = perms.delete;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const params = {};
  if (search) params.search = search;
  if (category) params.category = category;

  const listQuery = useQuery({
    queryKey: ['products', { search, category }],
    queryFn: () => productsApi.list(params),
  });

  // Open category set: built-ins + admin-added (auto-registered on product save too).
  const categoriesQuery = useQuery({
    queryKey: ['products', 'categories'],
    queryFn: productsApi.categories,
    staleTime: 60_000,
  });
  const categories = categoriesQuery.data || [{ key: 'other', label: 'Other' }];
  const catLabel = (k) => categories.find((c) => c.key === k)?.label || k;

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [snack, setSnack] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['product'] });
  };

  // Live updates: refetch whenever any client changes a product.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => invalidate();
    socket.on('products:changed', handler);
    return () => socket.off('products:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing ? productsApi.update(editing._id, payload) : productsApi.create(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save product')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productsApi.remove(id),
    onSuccess: invalidate,
  });

  const products = listQuery.data?.data || [];
  const total = listQuery.data?.meta?.total ?? products.length;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (product) => { setEditing(product); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (product) => {
    if (window.confirm(`Delete product "${product.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(product._id);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Products"
        subtitle="Product catalog & upgradation — versions, docs and roadmap."
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip label={`${total} total`} />
            {canCreate && (
              <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
            )}
            {canCreate && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                New product
              </Button>
            )}
          </Box>
        }
      />

      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}
      >
        <TextField
          size="small"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
        <TextField
          select
          size="small"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>
          ))}
        </TextField>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setCatDialogOpen(true)}>
          Add category
        </Button>
      </Paper>

      <AddCategoryDialog
        open={catDialogOpen}
        onClose={() => setCatDialogOpen(false)}
        onAdded={(cat) => setSnack(`Category "${cat.label}" added — it's now available in the dropdowns`)}
      />
      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnack('')}>
          {snack}
        </Alert>
      </Snackbar>

      {listQuery.error && <Alert severity="error">{getErrorMessage(listQuery.error, 'Failed to load products')}</Alert>}

      {listQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No products found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {products.map((p) => (
                <TableRow
                  key={p._id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setDetailId(p._id)}
                >
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{p.name}</Typography>
                    {p.sku && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {p.sku}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip label={catLabel(p.category)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{p.currentVersion || '—'}</TableCell>
                  <TableCell>
                    <Chip label={PRODUCT_STATUS_LABELS[p.status] || p.status} size="small" color={statusChipColor(p.status)} />
                  </TableCell>
                  <TableCell align="right">{formatPrice(p.price, p.currency)}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    {canUpdate && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(p)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        product={editing}
        saving={saveMutation.isPending}
        error={saveError}
        categories={categories}
      />

      <ProductDetailDrawer
        open={Boolean(detailId)}
        productId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(product) => { setDetailId(null); openEdit(product); }}
        canEdit={canUpdate}
        catLabel={catLabel}
      />

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import products from Excel / PDF"
        entity="products (product catalog items with versions and specifications)"
        fields={PRODUCT_IMPORT_FIELDS}
        buildPayload={buildProductImportPayload}
        createFn={(payload) => productsApi.create(payload)}
        onDone={invalidate}
        unmappedAsExtras
      />
    </Box>
  );
}

/** Small dialog to add a product category; used from the filter bar and the product form. */
function AddCategoryDialog({ open, onClose, onAdded }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setLabel(''); setErr(''); }
  }, [open]);

  const m = useMutation({
    mutationFn: () => productsApi.addCategory(label.trim()),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['products', 'categories'] });
      onAdded?.(cat);
      onClose();
    },
    onError: (e) => setErr(getErrorMessage(e, 'Failed to add category')),
  });

  const canSave = label.trim().length >= 2 && !m.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add category</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <TextField
          label="Category name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) m.mutate(); }}
          placeholder="e.g. Training Kits"
          autoFocus
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => m.mutate()} disabled={!canSave}>
          {m.isPending ? 'Adding…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Create / edit form for a product's core fields. */
function ProductDialog({ open, onClose, onSave, product, saving, error, categories = [] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [addCatOpen, setAddCatOpen] = useState(false);

  // The Select must always have an option matching the current value (e.g. a
  // just-added category that hasn't refetched yet, or an old custom one).
  const categoryOptions = categories.some((c) => c.key === form.category)
    ? categories
    : [...categories, { key: form.category, label: form.category }];

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name || '',
        sku: product.sku || '',
        category: product.category || 'other',
        status: product.status || 'active',
        currentVersion: product.currentVersion || '',
        price: product.price ?? '',
        description: product.description || '',
        specs: (product.specs || []).map((s) => ({ name: s.name || '', value: s.value || '' })),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, product]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setSpec = (i, key) => (e) =>
    setForm((f) => ({
      ...f,
      specs: f.specs.map((s, idx) => (idx === i ? { ...s, [key]: e.target.value } : s)),
    }));
  const addSpec = () => setForm((f) => ({ ...f, specs: [...f.specs, { name: '', value: '' }] }));
  const removeSpec = (i) => setForm((f) => ({ ...f, specs: f.specs.filter((_, idx) => idx !== i) }));

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      category: form.category,
      status: form.status,
      description: form.description,
      specs: form.specs
        .map((s) => ({ name: s.name.trim(), value: s.value.trim() }))
        .filter((s) => s.name),
    };

    const sku = form.sku.trim();
    if (sku) payload.sku = sku;
    else if (product) payload.sku = null; // clear on edit

    const cv = form.currentVersion.trim();
    if (cv) payload.currentVersion = cv;

    const price = String(form.price).trim();
    if (price !== '' && !Number.isNaN(Number(price))) payload.price = Number(price);
    else if (product) payload.price = null; // clear on edit

    onSave(payload);
  };

  const canSubmit = form.name.trim().length > 0 && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{product ? 'Edit product' : 'New product'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Name" value={form.name} onChange={set('name')} required autoFocus sx={{ flex: 2, minWidth: 220 }} />
            <TextField label="SKU" value={form.sku} onChange={set('sku')} placeholder="e.g. PRD-001" sx={{ flex: 1, minWidth: 140 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              select
              label="Category"
              value={form.category}
              onChange={(e) => {
                if (e.target.value === '__add__') { setAddCatOpen(true); return; }
                set('category')(e);
              }}
              sx={{ flex: 1, minWidth: 200 }}
            >
              {categoryOptions.map((c) => (
                <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>
              ))}
              <Divider />
              <MenuItem value="__add__" sx={{ color: 'primary.main', fontWeight: 600 }}>
                + Add new category…
              </MenuItem>
            </TextField>
            <TextField select label="Status" value={form.status} onChange={set('status')} sx={{ flex: 1, minWidth: 200 }}>
              {PRODUCT_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Current version" value={form.currentVersion} onChange={set('currentVersion')} placeholder="e.g. 1.2.0" sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Price (INR)" value={form.price} onChange={set('price')} type="number" inputProps={{ min: 0 }} sx={{ flex: 1, minWidth: 160 }} />
          </Box>
          <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={2} />

          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Specifications</Typography>
              <Typography variant="caption" color="text.secondary">
                Add as many name/value specifications as this product needs (e.g. components of a CPU).
              </Typography>
            </Box>
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addSpec}>
              Add field
            </Button>
          </Box>
          {form.specs.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
              No specifications yet — click "Add field" to add one.
            </Typography>
          )}
          {form.specs.map((s, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <TextField
                size="small"
                label={`Field ${i + 1} name`}
                value={s.name}
                onChange={setSpec(i, 'name')}
                placeholder="e.g. Processor"
                sx={{ flex: 1, minWidth: 140 }}
              />
              <TextField
                size="small"
                label="Value"
                value={s.value}
                onChange={setSpec(i, 'value')}
                placeholder="e.g. Intel i7-12700"
                sx={{ flex: 1.4, minWidth: 160 }}
              />
              <Tooltip title="Remove field">
                <IconButton size="small" color="error" onClick={() => removeSpec(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>

      <AddCategoryDialog
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onAdded={(cat) => setForm((f) => ({ ...f, category: cat.key }))}
      />
    </Dialog>
  );
}

/** Side drawer: product detail + specifications; everything edits via the Edit dialog. */
function ProductDetailDrawer({ open, productId, onClose, onEdit, canEdit, catLabel }) {
  const detailQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.get(productId),
    enabled: open && Boolean(productId),
  });

  const product = detailQuery.data;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      <Box sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6" sx={{ pr: 1 }}>{product?.name || 'Product'}</Typography>
          <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
        </Box>

        {detailQuery.isLoading && (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
        )}
        {detailQuery.error && <Alert severity="error" sx={{ mt: 2 }}>{getErrorMessage(detailQuery.error)}</Alert>}

        {product && (
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
              {product.sku && <Chip label={product.sku} size="small" sx={{ fontFamily: 'monospace' }} />}
              <Chip
                label={catLabel ? catLabel(product.category) : product.category}
                size="small"
                variant="outlined"
              />
              <Chip label={PRODUCT_STATUS_LABELS[product.status] || product.status} size="small" color={statusChipColor(product.status)} />
              {product.currentVersion && <Chip label={`v${product.currentVersion}`} size="small" color="primary" variant="outlined" />}
              {product.price != null && <Chip label={formatPrice(product.price, product.currency)} size="small" variant="outlined" />}
            </Box>

            {product.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                {product.description}
              </Typography>
            )}

            {(product.docsUrl || product.trainingUrl) && (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                {product.docsUrl && (
                  <Link href={product.docsUrl} target="_blank" rel="noopener noreferrer" variant="body2">
                    Documentation
                  </Link>
                )}
                {product.trainingUrl && (
                  <Link href={product.trainingUrl} target="_blank" rel="noopener noreferrer" variant="body2">
                    Training
                  </Link>
                )}
              </Box>
            )}

            {product.supportNotes && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Support notes</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, whiteSpace: 'pre-wrap' }}>
                  {product.supportNotes}
                </Typography>
              </>
            )}

            {(product.specs || []).length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                  Specifications ({product.specs.length})
                </Typography>
                <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableBody>
                      {product.specs.map((s) => (
                        <TableRow key={s._id || s.name}>
                          <TableCell sx={{ fontWeight: 600, width: '40%' }}>{s.name}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{s.value || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </>
            )}

            {canEdit && (
              <Button
                variant="contained"
                startIcon={<EditIcon fontSize="small" />}
                onClick={() => onEdit(product)}
                sx={{ mt: 1 }}
                fullWidth
              >
                Edit product
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
