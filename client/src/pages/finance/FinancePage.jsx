import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Tabs,
  Tab,
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
  LinearProgress,
  Alert,
  TextField,
  MenuItem,
  InputAdornment,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  financeApi,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  BUDGET_PERIODS,
  BUDGET_PERIOD_LABELS,
} from '../../api/finance.api.js';
import { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatINR(n) {
  return inr.format(n || 0);
}

function compactINR(n) {
  return `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)}`;
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** '2026-07' → 'Jul 26' for chart ticks. */
function formatMonth(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export default function FinancePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState(0);

  // Live updates: refetch finance data whenever any client mutates it.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['finance'] });
    socket.on('finance:changed', handler);
    return () => socket.off('finance:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <PageHeader
        title="Finance"
        subtitle="Income & expense tracking, budgets and financial insights."
      />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Overview" />
        <Tab label="Transactions" />
        <Tab label="Budgets" />
      </Tabs>

      {tab === 0 && <OverviewTab />}
      {tab === 1 && <TransactionsTab />}
      {tab === 2 && <BudgetsTab />}
    </Box>
  );
}

/* ------------------------------- Overview ------------------------------- */

function StatCard({ label, value, color }) {
  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ mt: 0.5, color }}>
        {formatINR(value)}
      </Typography>
    </Paper>
  );
}

function OverviewTab() {
  const theme = useTheme();

  const summaryQuery = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => financeApi.summary(),
  });

  const insights = useMutation({ mutationFn: () => financeApi.aiInsights({}) });

  const summary = summaryQuery.data;
  const chartData = useMemo(
    () => (summary?.monthly || []).map((m) => ({ ...m, label: formatMonth(m.month) })),
    [summary]
  );

  if (summaryQuery.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (summaryQuery.error) {
    return <Alert severity="error">{getErrorMessage(summaryQuery.error, 'Failed to load finance summary')}</Alert>;
  }

  const totals = summary?.totals || { income: 0, expense: 0, net: 0 };
  const byCategory = summary?.byCategory || [];
  const budgetUsage = summary?.budgetUsage || [];

  // Income/expense wear the theme's success/error tokens (validated pair) so the
  // chart matches the type chips; legend + tooltip carry identity beyond color.
  const incomeColor = theme.palette.success.main;
  const expenseColor = theme.palette.error.main;

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 2 }}>
        <StatCard label="Income" value={totals.income} color="success.main" />
        <StatCard label="Expense" value={totals.expense} color="error.main" />
        <StatCard label="Net" value={totals.net} color={totals.net >= 0 ? 'success.main' : 'error.main'} />
      </Box>

      <Paper elevation={0} sx={{ p: 2.5, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Monthly income vs expense (last 12 months)
        </Typography>
        {chartData.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No transactions in this period yet.
          </Typography>
        ) : (
          <Box sx={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={theme.palette.divider} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                />
                <YAxis
                  width={64}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={compactINR}
                  tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
                />
                <ChartTooltip
                  cursor={{ fill: theme.palette.action.hover }}
                  formatter={(value) => formatINR(value)}
                  contentStyle={{ borderRadius: 8, border: `1px solid ${theme.palette.divider}`, fontSize: 13 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={9}
                  formatter={(value) => (
                    <span style={{ color: theme.palette.text.secondary, fontSize: 13 }}>{value}</span>
                  )}
                />
                <Bar dataKey="income" name="Income" fill={incomeColor} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expense" name="Expense" fill={expenseColor} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, p: 2, pb: 1 }}>
            By category
          </Typography>
          {byCategory.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 3, textAlign: 'center' }}>
              Nothing to show yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {byCategory.slice(0, 10).map((c) => (
                  <TableRow key={`${c.category}-${c.type}`} hover>
                    <TableCell>{c.category}</TableCell>
                    <TableCell>
                      <Chip
                        label={TRANSACTION_TYPE_LABELS[c.type] || c.type}
                        size="small"
                        color={c.type === 'income' ? 'success' : 'error'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatINR(c.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Budget usage
          </Typography>
          {budgetUsage.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No budgets overlap this period.
            </Typography>
          ) : (
            <Stack spacing={1.75}>
              {budgetUsage.map((b) => (
                <Box key={b.budgetId}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {b.name}{' '}
                      <Typography component="span" variant="caption" color="text.secondary">
                        ({b.category} · {BUDGET_PERIOD_LABELS[b.period] || b.period})
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {formatINR(b.spent)} / {formatINR(b.amount)} · {b.pct}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(b.pct, 100)}
                    color={b.pct >= 100 ? 'error' : b.pct >= 80 ? 'warning' : 'primary'}
                    sx={{ height: 8, borderRadius: 5 }}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            AI insights
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {insights.data && (
              <Chip icon={<SmartToyIcon />} size="small" label={`provider: ${insights.data.provider}`} />
            )}
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => insights.mutate()}
              disabled={insights.isPending}
            >
              {insights.isPending ? <CircularProgress size={18} color="inherit" /> : 'Generate insights'}
            </Button>
          </Box>
        </Box>

        {insights.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {getErrorMessage(insights.error, 'AI insights failed')}
          </Alert>
        )}

        {insights.data && (
          <Alert severity="info" icon={<SmartToyIcon />} sx={{ mt: 2, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {insights.data.insights}
          </Alert>
        )}
      </Paper>
    </Box>
  );
}

/* ----------------------------- Transactions ----------------------------- */

// Sentinel value for the "＋ Add custom method…" row in the payment-method dropdown.
const CUSTOM_METHOD = '__custom__';
// Dropdown items for previously-saved custom methods carry this prefix on their
// value, e.g. "custom:Razorpay link".
const CUSTOM_PREFIX = 'custom:';

// Contextual label + placeholder for the Payment ID field, which is shown for
// every method except cash (cash has no reference id).
const PAYMENT_REF_LABELS = {
  bank: 'Payment ID — Bank / UTR ref',
  upi: 'Payment ID — UPI ID',
  card: 'Payment ID — Card / auth ref',
  cheque: 'Payment ID — Cheque no.',
  invoice: 'Payment ID — Invoice no.',
  other: 'Payment ID',
};
const PAYMENT_REF_PLACEHOLDERS = {
  bank: 'e.g. UTR / IMPS / NEFT reference no.',
  upi: 'e.g. name@okhdfcbank or 12-digit UPI ref',
  card: 'e.g. auth code / last 4 digits',
  cheque: 'e.g. cheque no. 000123',
  invoice: 'e.g. INV-2026-0042',
  other: 'Payment reference / ID',
};

// Display label for a transaction's method — the custom text wins for 'other'.
function methodLabel(t) {
  if (t.paymentMethod === 'other' && t.paymentMethodOther) return t.paymentMethodOther;
  return PAYMENT_METHOD_LABELS[t.paymentMethod] || t.paymentMethod;
}

const EMPTY_TRANSACTION_FORM = {
  type: 'expense',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  category: '',
  description: '',
  paymentMethod: 'bank',
  paymentRef: '',
  paymentMethodOther: '',
  partyName: '',
  tags: '',
};

function TransactionsTab() {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canCreate = perms.create;
  const canUpdate = perms.update;
  const canDelete = perms.delete;

  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const params = { limit: 50 };
  if (type) params.type = type;
  if (search) params.search = search;

  const listQuery = useQuery({
    queryKey: ['finance', 'transactions', { type, search }],
    queryFn: () => financeApi.listTransactions(params),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['finance'] });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing ? financeApi.updateTransaction(editing._id, payload) : financeApi.createTransaction(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save transaction')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => financeApi.removeTransaction(id),
    onSuccess: invalidate,
  });

  const transactions = listQuery.data?.data || [];
  const total = listQuery.data?.meta?.total ?? transactions.length;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (t) => { setEditing(t); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (t) => {
    if (window.confirm(`Delete this ${t.type} of ${formatINR(t.amount)}? This cannot be undone.`)) {
      deleteMutation.mutate(t._id);
    }
  };

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{ p: 2.5, mb: 2.5, border: '1px solid', borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <TextField
          size="small"
          placeholder="Search description or party…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 260 }}
        />
        <TextField
          select
          size="small"
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All types</MenuItem>
          {TRANSACTION_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</MenuItem>
          ))}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Chip label={`${total} total`} />
        {canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New transaction
          </Button>
        )}
      </Paper>

      {listQuery.error && (
        <Alert severity="error">{getErrorMessage(listQuery.error, 'Failed to load transactions')}</Alert>
      )}

      {listQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description / Party</TableCell>
                <TableCell>Method</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No transactions found.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {transactions.map((t) => (
                <TableRow key={t._id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</TableCell>
                  <TableCell>
                    <Chip
                      label={TRANSACTION_TYPE_LABELS[t.type] || t.type}
                      size="small"
                      color={t.type === 'income' ? 'success' : 'error'}
                    />
                  </TableCell>
                  <TableCell>{t.category || '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
                      {t.description || '—'}
                    </Typography>
                    {(t.party?.name || t.party?.contact?.name) && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 320 }}>
                        {t.party?.name || t.party?.contact?.name}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {methodLabel(t)}
                    {t.paymentRef && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontFamily: 'ui-monospace, monospace', maxWidth: 180 }}>
                        {t.paymentRef}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        color: t.type === 'income' ? 'success.main' : 'error.main',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.type === 'income' ? '+' : '−'}{formatINR(t.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {canUpdate && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(t)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <TransactionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        transaction={editing}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}

/** Create / edit form for a transaction's core fields. */
function TransactionDialog({ open, onClose, onSave, transaction, saving, error }) {
  const [form, setForm] = useState(EMPTY_TRANSACTION_FORM);

  // Previously-saved custom methods, so a method typed once is re-pickable.
  const customMethodsQuery = useQuery({
    queryKey: ['finance', 'customMethods'],
    queryFn: () => financeApi.listCustomMethods(),
    enabled: open,
  });
  const savedCustomMethods = customMethodsQuery.data || [];

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setForm({
        type: transaction.type || 'expense',
        amount: String(transaction.amount ?? ''),
        date: transaction.date ? new Date(transaction.date).toISOString().slice(0, 10) : '',
        category: transaction.category || '',
        description: transaction.description || '',
        paymentMethod: transaction.paymentMethod || 'bank',
        paymentRef: transaction.paymentRef || '',
        paymentMethodOther: transaction.paymentMethodOther || '',
        partyName: transaction.party?.name || '',
        tags: (transaction.tags || []).join(', '),
      });
    } else {
      setForm({ ...EMPTY_TRANSACTION_FORM, date: new Date().toISOString().slice(0, 10) });
    }
  }, [open, transaction]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    const payload = {
      type: form.type,
      amount: Number(form.amount),
      category: form.category.trim() || undefined,
      description: form.description,
      paymentMethod: form.paymentMethod,
      // Cash carries no reference; otherwise persist the entered Payment ID.
      paymentRef: form.paymentMethod === 'cash' ? '' : form.paymentRef.trim(),
      // Custom method label only applies to 'other'.
      paymentMethodOther: form.paymentMethod === 'other' ? form.paymentMethodOther.trim() : '',
      party: { name: form.partyName.trim() },
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (form.date) payload.date = form.date;
    onSave(payload);
  };

  const canSubmit = Number(form.amount) > 0 && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{transaction ? 'Edit transaction' : 'New transaction'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField select label="Type" value={form.type} onChange={set('type')} sx={{ flex: 1, minWidth: 160 }}>
              {TRANSACTION_TYPES.map((t) => (
                <MenuItem key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Amount"
              type="number"
              value={form.amount}
              onChange={set('amount')}
              required
              autoFocus
              inputProps={{ min: 0.01, step: 0.01 }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Date"
              type="date"
              value={form.date}
              onChange={set('date')}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              select
              label="Payment method"
              value={form.paymentMethod}
              onChange={(e) => {
                const v = e.target.value;
                // "＋ Add custom method…" starts a fresh custom entry.
                if (v === CUSTOM_METHOD) { setForm((f) => ({ ...f, paymentMethod: 'other', paymentMethodOther: '' })); return; }
                // A previously-saved custom method — reuse its label, no re-typing.
                if (String(v).startsWith(CUSTOM_PREFIX)) {
                  setForm((f) => ({ ...f, paymentMethod: 'other', paymentMethodOther: String(v).slice(CUSTOM_PREFIX.length) }));
                  return;
                }
                // A built-in method (clear any stale custom label unless it's 'other').
                setForm((f) => ({ ...f, paymentMethod: v, paymentMethodOther: v === 'other' ? f.paymentMethodOther : '' }));
              }}
              sx={{ flex: 1, minWidth: 160 }}
            >
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</MenuItem>
              ))}
              {savedCustomMethods.length > 0 && <Divider />}
              {savedCustomMethods.length > 0 && (
                <MenuItem disabled sx={{ fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.7 }}>
                  Saved custom
                </MenuItem>
              )}
              {savedCustomMethods.map((label) => (
                <MenuItem key={`${CUSTOM_PREFIX}${label}`} value={`${CUSTOM_PREFIX}${label}`}>{label}</MenuItem>
              ))}
              <Divider />
              <MenuItem value={CUSTOM_METHOD} sx={{ color: 'primary.main', fontWeight: 600 }}>
                <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add custom method…
              </MenuItem>
            </TextField>
          </Box>
          {/* Custom method label — shown only for the 'other' method. */}
          {form.paymentMethod === 'other' && (
            <TextField
              label="Custom method — how was it paid?"
              value={form.paymentMethodOther}
              onChange={set('paymentMethodOther')}
              fullWidth
              placeholder="e.g. Razorpay link, barter, adjustment, advance"
              InputProps={{ startAdornment: <InputAdornment position="start"><AddIcon fontSize="small" color="disabled" /></InputAdornment> }}
            />
          )}
          {/* Payment ID — shown for every method except cash. */}
          {form.paymentMethod !== 'cash' && (
            <TextField
              label={PAYMENT_REF_LABELS[form.paymentMethod] || 'Payment ID'}
              value={form.paymentRef}
              onChange={set('paymentRef')}
              fullWidth
              placeholder={PAYMENT_REF_PLACEHOLDERS[form.paymentMethod] || 'Payment reference / ID'}
              helperText={`Reference / ID for this ${(PAYMENT_METHOD_LABELS[form.paymentMethod] || '').toLowerCase()} payment`}
              InputProps={{ startAdornment: <InputAdornment position="start"><ReceiptLongIcon fontSize="small" color="disabled" /></InputAdornment> }}
            />
          )}
          <TextField
            label="Category"
            value={form.category}
            onChange={set('category')}
            fullWidth
            placeholder="e.g. salary, rent, software, gst, vendor_payment"
          />
          <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={2} />
          <TextField label="Party name" value={form.partyName} onChange={set('partyName')} fullWidth placeholder="Who was paid / who paid" />
          <TextField label="Tags" value={form.tags} onChange={set('tags')} fullWidth placeholder="Comma separated, e.g. q2, office" />
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

/* -------------------------------- Budgets -------------------------------- */

const EMPTY_BUDGET_FORM = {
  name: '',
  category: '',
  period: 'monthly',
  amount: '',
  startDate: '',
  endDate: '',
  notes: '',
};

function BudgetsTab() {
  const qc = useQueryClient();
  // Owner-only console: RBAC removed — full access for every signed-in user.
  const perms = { create: true, read: true, update: true, delete: true };
  const canCreate = perms.create;
  const canUpdate = perms.update;
  const canDelete = perms.delete;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState('');

  const listQuery = useQuery({
    queryKey: ['finance', 'budgets'],
    queryFn: () => financeApi.listBudgets({ limit: 50 }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['finance'] });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing ? financeApi.updateBudget(editing._id, payload) : financeApi.createBudget(payload),
    onSuccess: () => {
      setDialogOpen(false);
      setSaveError('');
      invalidate();
    },
    onError: (err) => setSaveError(getErrorMessage(err, 'Failed to save budget')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => financeApi.removeBudget(id),
    onSuccess: invalidate,
  });

  const budgets = listQuery.data?.data || [];
  const total = listQuery.data?.meta?.total ?? budgets.length;

  const openCreate = () => { setEditing(null); setSaveError(''); setDialogOpen(true); };
  const openEdit = (b) => { setEditing(b); setSaveError(''); setDialogOpen(true); };
  const handleDelete = (b) => {
    if (window.confirm(`Delete budget "${b.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(b._id);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 2 }}>
        <Chip label={`${total} total`} />
        {canCreate && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            New budget
          </Button>
        )}
      </Box>

      {listQuery.error && (
        <Alert severity="error">{getErrorMessage(listQuery.error, 'Failed to load budgets')}</Alert>
      )}

      {listQuery.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Period</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {budgets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No budgets yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {budgets.map((b) => (
                <TableRow key={b._id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{b.name}</Typography>
                    {b.notes && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 280 }}>
                        {b.notes}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{b.category}</TableCell>
                  <TableCell>
                    <Chip label={BUDGET_PERIOD_LABELS[b.period] || b.period} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatINR(b.amount)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(b.startDate)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(b.endDate)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {canUpdate && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(b)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(b)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <BudgetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={(payload) => saveMutation.mutate(payload)}
        budget={editing}
        saving={saveMutation.isPending}
        error={saveError}
      />
    </Box>
  );
}

/** Create / edit form for a budget. */
function BudgetDialog({ open, onClose, onSave, budget, saving, error }) {
  const [form, setForm] = useState(EMPTY_BUDGET_FORM);

  useEffect(() => {
    if (!open) return;
    if (budget) {
      setForm({
        name: budget.name || '',
        category: budget.category || '',
        period: budget.period || 'monthly',
        amount: String(budget.amount ?? ''),
        startDate: budget.startDate ? new Date(budget.startDate).toISOString().slice(0, 10) : '',
        endDate: budget.endDate ? new Date(budget.endDate).toISOString().slice(0, 10) : '',
        notes: budget.notes || '',
      });
    } else {
      setForm(EMPTY_BUDGET_FORM);
    }
  }, [open, budget]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      period: form.period,
      amount: Number(form.amount),
      notes: form.notes,
    };
    if (form.startDate) payload.startDate = form.startDate;
    if (form.endDate) payload.endDate = form.endDate;
    onSave(payload);
  };

  const canSubmit = form.name.trim().length > 0 && form.category.trim().length > 0 && Number(form.amount) >= 0 && form.amount !== '' && !saving;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{budget ? 'Edit budget' : 'New budget'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={form.name} onChange={set('name')} required fullWidth autoFocus />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Category"
              value={form.category}
              onChange={set('category')}
              required
              placeholder="Matches transaction category"
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField select label="Period" value={form.period} onChange={set('period')} sx={{ flex: 1, minWidth: 160 }}>
              {BUDGET_PERIODS.map((p) => (
                <MenuItem key={p} value={p}>{BUDGET_PERIOD_LABELS[p]}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label="Amount"
            type="number"
            value={form.amount}
            onChange={set('amount')}
            required
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={set('startDate')}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              label="End date"
              type="date"
              value={form.endDate}
              onChange={set('endDate')}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>
          <TextField label="Notes" value={form.notes} onChange={set('notes')} fullWidth multiline minRows={2} />
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
