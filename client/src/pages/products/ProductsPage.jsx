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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  productsApi,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  ROADMAP_STATUS_LABELS,
} from '../../api/products.api.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const STATUS_COLOR = { development: 'warning', active: 'success', deprecated: 'default' };
const ROADMAP_STATUS_COLOR = { planned: 'default', in_progress: 'warning', released: 'success' };
const NEXT_ROADMAP_STATUS = { planned: 'in_progress', in_progress: 'released' };
const ADVANCE_LABEL = { planned: 'Start', in_progress: 'Mark released' };

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
  docsUrl: '',
  trainingUrl: '',
  supportNotes: '',
  tags: '',
};

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
          {PRODUCT_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>{PRODUCT_CATEGORY_LABELS[c]}</MenuItem>
          ))}
        </TextField>
      </Paper>

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
                    <Chip label={PRODUCT_CATEGORY_LABELS[p.category] || p.category} size="small" variant="outlined" />
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
      />

      <ProductDetailDrawer
        open={Boolean(detailId)}
        productId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(product) => { setDetailId(null); openEdit(product); }}
        canEdit={canUpdate}
        onChanged={invalidate}
      />
    </Box>
  );
}

/** Create / edit form for a product's core fields. */
function ProductDialog({ open, onClose, onSave, product, saving, error }) {
  const [form, setForm] = useState(EMPTY_FORM);

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
        docsUrl: product.docsUrl || '',
        trainingUrl: product.trainingUrl || '',
        supportNotes: product.supportNotes || '',
        tags: (product.tags || []).join(', '),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, product]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      category: form.category,
      status: form.status,
      description: form.description,
      docsUrl: form.docsUrl.trim(),
      trainingUrl: form.trainingUrl.trim(),
      supportNotes: form.supportNotes,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
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
            <TextField select label="Category" value={form.category} onChange={set('category')} sx={{ flex: 1, minWidth: 200 }}>
              {PRODUCT_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>{PRODUCT_CATEGORY_LABELS[c]}</MenuItem>
              ))}
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
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Docs URL" value={form.docsUrl} onChange={set('docsUrl')} placeholder="https://…" sx={{ flex: 1, minWidth: 200 }} />
            <TextField label="Training URL" value={form.trainingUrl} onChange={set('trainingUrl')} placeholder="https://…" sx={{ flex: 1, minWidth: 200 }} />
          </Box>
          <TextField label="Support notes" value={form.supportNotes} onChange={set('supportNotes')} fullWidth multiline minRows={2} />
          <TextField label="Tags" value={form.tags} onChange={set('tags')} fullWidth placeholder="comma, separated, tags" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Side drawer: product detail, version history (release form) and upgrade roadmap. */
function ProductDetailDrawer({ open, productId, onClose, onEdit, canEdit, onChanged }) {
  const qc = useQueryClient();
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [versionError, setVersionError] = useState('');
  const [roadmapTitle, setRoadmapTitle] = useState('');
  const [plannedFor, setPlannedFor] = useState('');
  const [roadmapError, setRoadmapError] = useState('');

  const detailQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.get(productId),
    enabled: open && Boolean(productId),
  });

  useEffect(() => {
    if (open) {
      setVersion(''); setNotes(''); setVersionError('');
      setRoadmapTitle(''); setPlannedFor(''); setRoadmapError('');
    }
  }, [open, productId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['product', productId] });
    onChanged?.();
  };

  const addVersionMutation = useMutation({
    mutationFn: (body) => productsApi.addVersion(productId, body),
    onSuccess: () => { setVersion(''); setNotes(''); setVersionError(''); refresh(); },
    onError: (err) => setVersionError(getErrorMessage(err, 'Failed to add version')),
  });

  const addRoadmapMutation = useMutation({
    mutationFn: (body) => productsApi.addRoadmapItem(productId, body),
    onSuccess: () => { setRoadmapTitle(''); setPlannedFor(''); setRoadmapError(''); refresh(); },
    onError: (err) => setRoadmapError(getErrorMessage(err, 'Failed to add roadmap item')),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ itemId, status }) => productsApi.updateRoadmapItem(productId, itemId, { status }),
    onSuccess: () => { setRoadmapError(''); refresh(); },
    onError: (err) => setRoadmapError(getErrorMessage(err, 'Failed to update roadmap item')),
  });

  const product = detailQuery.data;
  const history = [...(product?.versions || [])].sort(
    (a, b) => new Date(b.releasedAt || 0) - new Date(a.releasedAt || 0)
  );
  const roadmap = product?.upgradeRoadmap || [];

  const submitVersion = () => {
    const v = version.trim();
    if (!v) return;
    addVersionMutation.mutate({ version: v, notes: notes.trim() || undefined });
  };

  const submitRoadmapItem = () => {
    const title = roadmapTitle.trim();
    if (!title) return;
    addRoadmapMutation.mutate({ title, plannedFor: plannedFor.trim() || undefined });
  };

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
              <Chip label={PRODUCT_CATEGORY_LABELS[product.category] || product.category} size="small" variant="outlined" />
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

            {canEdit && (
              <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => onEdit(product)} sx={{ mb: 1 }}>
                Edit product
              </Button>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Version history
            </Typography>

            {canEdit && (
              <Paper elevation={0} sx={{ p: 1.5, mb: 2, border: '1px solid', borderColor: 'divider' }}>
                {versionError && <Alert severity="error" sx={{ mb: 1 }}>{versionError}</Alert>}
                <Stack spacing={1.25}>
                  <TextField size="small" label="Version" placeholder="e.g. 1.3.0" value={version} onChange={(e) => setVersion(e.target.value)} fullWidth />
                  <TextField size="small" label="Release notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={submitVersion}
                      disabled={!version.trim() || addVersionMutation.isPending}
                    >
                      {addVersionMutation.isPending ? 'Releasing…' : 'Release version'}
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            )}

            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No versions released yet.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {history.map((v) => (
                  <Paper key={v._id || v.version} elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Chip label={`v${v.version}`} size="small" color="primary" variant="outlined" />
                      {v.releasedAt && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(v.releasedAt).toLocaleDateString()}
                        </Typography>
                      )}
                    </Box>
                    {v.notes && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>
                        {v.notes}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Stack>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              Upgrade roadmap
            </Typography>

            {roadmapError && <Alert severity="error" sx={{ mb: 1 }}>{roadmapError}</Alert>}

            {canEdit && (
              <Paper elevation={0} sx={{ p: 1.5, mb: 2, border: '1px solid', borderColor: 'divider' }}>
                <Stack spacing={1.25}>
                  <TextField size="small" label="Title" placeholder="e.g. Mobile app support" value={roadmapTitle} onChange={(e) => setRoadmapTitle(e.target.value)} fullWidth />
                  <TextField size="small" label="Planned for" placeholder="e.g. Q4 2026" value={plannedFor} onChange={(e) => setPlannedFor(e.target.value)} fullWidth />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={submitRoadmapItem}
                      disabled={!roadmapTitle.trim() || addRoadmapMutation.isPending}
                    >
                      {addRoadmapMutation.isPending ? 'Adding…' : 'Add item'}
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            )}

            {roadmap.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No roadmap items yet.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                {roadmap.map((item) => (
                  <Paper key={item._id} elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{item.title}</Typography>
                        {item.plannedFor && (
                          <Typography variant="caption" color="text.secondary">
                            Planned for {item.plannedFor}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                        <Chip
                          label={ROADMAP_STATUS_LABELS[item.status] || item.status}
                          size="small"
                          color={ROADMAP_STATUS_COLOR[item.status] || 'default'}
                        />
                        {canEdit && NEXT_ROADMAP_STATUS[item.status] && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => advanceMutation.mutate({ itemId: item._id, status: NEXT_ROADMAP_STATUS[item.status] })}
                            disabled={advanceMutation.isPending}
                          >
                            {ADVANCE_LABEL[item.status]}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
