import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Tabs, Tab, TextField, MenuItem, Button, IconButton, Typography,
  CircularProgress, Alert, Chip, Avatar, Divider, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Pagination,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import Masonry from '@mui/lab/Masonry';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutline';
import PageHeader from '../../components/ui/PageHeader.jsx';
import {
  reportingApi, REPORT_MOODS, REPORT_MOOD_LABELS, REPORT_MOOD_COLOR,
  REPORT_STATUS_LABELS, REPORT_STATUS_COLOR,
} from '../../api/reporting.api.js';
import api, { getErrorMessage } from '../../lib/axios.js';
import { getSocket, connectSocket } from '../../lib/socket.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
};

const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();

// yyyy-mm-dd (from a date input) -> ISO at local noon, so the server lands on the same day.
const toApiDate = (yyyyMmDd) => new Date(`${yyyyMmDd}T12:00:00`).toISOString();

export default function EveningReportPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canSeeTeam = hasPermission('employee_analytics', 'read');

  const [tab, setTab] = useState(0);

  // Live updates: refetch whenever any client changes a report.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ['reports'] });
    socket.on('reports:changed', handler);
    return () => socket.off('reports:changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <PageHeader
        title="Evening Reporting"
        subtitle="Submit your end-of-day report and keep the team in the loop."
      />

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="My Report" />
        <Tab label="My History" />
        {canSeeTeam && <Tab label="Team" />}
      </Tabs>

      {tab === 0 && <MyReportTab />}
      {tab === 1 && <MyHistoryTab />}
      {tab === 2 && canSeeTeam && <TeamTab />}
    </Box>
  );
}

/* ------------------------------- My Report ------------------------------- */

const emptyForm = { workDone: '', tomorrowPlan: '', blockers: '', hoursWorked: 8, mood: 'good', remarks: '' };

function MyReportTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [meetings, setMeetings] = useState([]);
  const [gitCommits, setGitCommits] = useState([]);
  const [prefilled, setPrefilled] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Prefill from today's report if it already exists (latest report, date desc).
  const latestQuery = useQuery({
    queryKey: ['reports', 'mine', 'latest'],
    queryFn: () => reportingApi.mine({ limit: 1 }),
  });

  useEffect(() => {
    if (prefilled) return;
    const latest = latestQuery.data?.data?.[0];
    if (!latest || !isToday(latest.date)) return;
    setForm({
      workDone: latest.workDone || '',
      tomorrowPlan: latest.tomorrowPlan || '',
      blockers: latest.blockers || '',
      hoursWorked: latest.hoursWorked ?? 8,
      mood: latest.mood || 'good',
      remarks: latest.remarks || '',
    });
    setMeetings((latest.meetings || []).map((m) => ({ title: m.title || '', durationMinutes: m.durationMinutes ?? 30 })));
    setGitCommits((latest.gitCommits || []).map((c) => ({ repo: c.repo || '', message: c.message || '', hash: c.hash || '' })));
    setPrefilled(true);
  }, [latestQuery.data, prefilled]);

  const submitM = useMutation({
    mutationFn: (payload) => reportingApi.submit(payload),
    onSuccess: () => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const set = (k, v) => {
    setSubmitted(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const setRow = (setter) => (index, key, value) => {
    setSubmitted(false);
    setter((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };
  const removeRow = (setter) => (index) => {
    setSubmitted(false);
    setter((rows) => rows.filter((_, i) => i !== index));
  };
  const setMeeting = setRow(setMeetings);
  const setCommit = setRow(setGitCommits);

  const onSubmit = (e) => {
    e.preventDefault();
    if (!form.workDone.trim()) return;
    submitM.mutate({
      workDone: form.workDone.trim(),
      tomorrowPlan: form.tomorrowPlan,
      blockers: form.blockers,
      hoursWorked: form.hoursWorked === '' ? 0 : Number(form.hoursWorked),
      mood: form.mood,
      remarks: form.remarks,
      meetings: meetings
        .filter((m) => m.title.trim())
        .map((m) => ({ title: m.title.trim(), durationMinutes: m.durationMinutes === '' ? 30 : Number(m.durationMinutes) })),
      gitCommits: gitCommits
        .filter((c) => c.message.trim())
        .map((c) => ({ repo: c.repo.trim(), message: c.message.trim(), hash: c.hash.trim() })),
    });
  };

  return (
    <Paper elevation={0} component="form" onSubmit={onSubmit} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Report for {formatDate(new Date().toISOString())}
      </Typography>

      {prefilled && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          You already submitted a report today — submitting again will update it.
        </Alert>
      )}
      {submitted && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          Report {prefilled ? 'updated' : 'submitted'} for today. Great work — see you tomorrow!
        </Alert>
      )}
      {submitM.isError && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {getErrorMessage(submitM.error, 'Failed to submit report')}
        </Alert>
      )}

      <TextField
        label="What did you work on today?"
        value={form.workDone}
        onChange={(e) => set('workDone', e.target.value)}
        fullWidth
        required
        multiline
        minRows={3}
        sx={{ mt: 2 }}
      />
      <TextField
        label="Plan for tomorrow"
        value={form.tomorrowPlan}
        onChange={(e) => set('tomorrowPlan', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        sx={{ mt: 2 }}
      />
      <TextField
        label="Blockers (if any)"
        value={form.blockers}
        onChange={(e) => set('blockers', e.target.value)}
        fullWidth
        multiline
        minRows={2}
        sx={{ mt: 2 }}
      />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
        <TextField
          label="Hours worked"
          type="number"
          value={form.hoursWorked}
          onChange={(e) => set('hoursWorked', e.target.value)}
          inputProps={{ min: 0, max: 24, step: 0.5 }}
          sx={{ flex: '1 1 150px' }}
        />
        <TextField select label="Mood" value={form.mood} onChange={(e) => set('mood', e.target.value)} sx={{ flex: '1 1 150px' }}>
          {REPORT_MOODS.map((m) => (
            <MenuItem key={m} value={m}>{REPORT_MOOD_LABELS[m]}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Remarks"
          value={form.remarks}
          onChange={(e) => set('remarks', e.target.value)}
          sx={{ flex: '2 1 240px' }}
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Meetings */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Meetings</Typography>
      {meetings.map((m, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Meeting title"
            value={m.title}
            onChange={(e) => setMeeting(i, 'title', e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Minutes"
            type="number"
            value={m.durationMinutes}
            onChange={(e) => setMeeting(i, 'durationMinutes', e.target.value)}
            inputProps={{ min: 0 }}
            sx={{ width: 110 }}
          />
          <IconButton size="small" color="error" onClick={() => removeRow(setMeetings)(i)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => { setSubmitted(false); setMeetings((rows) => [...rows, { title: '', durationMinutes: 30 }]); }}
      >
        Add meeting
      </Button>

      <Divider sx={{ my: 3 }} />

      {/* Git commits */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Git commits</Typography>
      {gitCommits.map((c, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Repo"
            value={c.repo}
            onChange={(e) => setCommit(i, 'repo', e.target.value)}
            sx={{ flex: '1 1 140px' }}
          />
          <TextField
            size="small"
            label="Commit message"
            value={c.message}
            onChange={(e) => setCommit(i, 'message', e.target.value)}
            sx={{ flex: '2 1 220px' }}
          />
          <TextField
            size="small"
            label="Hash"
            value={c.hash}
            onChange={(e) => setCommit(i, 'hash', e.target.value)}
            sx={{ width: 120 }}
          />
          <IconButton size="small" color="error" onClick={() => removeRow(setGitCommits)(i)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => { setSubmitted(false); setGitCommits((rows) => [...rows, { repo: '', message: '', hash: '' }]); }}
      >
        Add commit
      </Button>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="submit"
          variant="contained"
          startIcon={submitM.isPending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          disabled={submitM.isPending || !form.workDone.trim()}
        >
          {prefilled ? 'Update report' : 'Submit report'}
        </Button>
      </Box>
    </Paper>
  );
}

/* ------------------------------- My History ------------------------------ */

function MyHistoryTab() {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const limit = 10;

  const query = useQuery({
    queryKey: ['reports', 'mine', { page, limit }],
    queryFn: () => reportingApi.mine({ page, limit }),
  });

  const items = query.data?.data || [];
  const meta = query.data?.meta || {};

  if (query.isLoading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (query.error) {
    return <Alert severity="error">{getErrorMessage(query.error, 'Failed to load reports')}</Alert>;
  }

  return (
    <Box>
      {items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography>No reports yet — submit your first one from the My Report tab.</Typography>
        </Box>
      ) : (
        <>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell align="center">Hours</TableCell>
                  <TableCell>Mood</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Work done</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r._id} hover sx={{ cursor: 'pointer' }} onClick={() => setDetailId(r._id)}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</TableCell>
                    <TableCell align="center">{r.hoursWorked}</TableCell>
                    <TableCell>
                      <Chip size="small" label={REPORT_MOOD_LABELS[r.mood] || r.mood} color={REPORT_MOOD_COLOR[r.mood] || 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={REPORT_STATUS_LABELS[r.status] || r.status} color={REPORT_STATUS_COLOR[r.status] || 'default'} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 340 }}>
                      <Typography variant="body2" noWrap>{r.workDone}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={(e) => { e.stopPropagation(); setDetailId(r._id); }}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {(meta.totalPages || 0) > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination count={meta.totalPages} page={page} onChange={(e, v) => setPage(v)} size="small" />
            </Box>
          )}
        </>
      )}

      <ReportDetailDialog open={Boolean(detailId)} reportId={detailId} onClose={() => setDetailId(null)} />
    </Box>
  );
}

function ReportDetailDialog({ open, reportId, onClose }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ['reports', 'detail', reportId],
    queryFn: () => reportingApi.get(reportId),
    enabled: open && Boolean(reportId),
  });

  useEffect(() => {
    if (!open) setSummary(null);
  }, [open]);

  const summarizeM = useMutation({
    mutationFn: () => reportingApi.aiSummary(reportId),
    onSuccess: (res) => {
      setSummary(res);
      qc.invalidateQueries({ queryKey: ['reports', 'detail', reportId] });
    },
  });

  const aiText = summary?.summary || report?.aiSummary;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Daily report{report ? ` — ${formatDate(report.date)}` : ''}</DialogTitle>
      <DialogContent dividers>
        {isLoading || !report ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <Box>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={`${report.hoursWorked}h worked`} variant="outlined" />
              <Chip size="small" label={REPORT_MOOD_LABELS[report.mood] || report.mood} color={REPORT_MOOD_COLOR[report.mood] || 'default'} variant="outlined" />
              <Chip size="small" label={REPORT_STATUS_LABELS[report.status] || report.status} color={REPORT_STATUS_COLOR[report.status] || 'default'} />
            </Stack>

            <DetailSection title="Work done" text={report.workDone} />
            <DetailSection title="Plan for tomorrow" text={report.tomorrowPlan} />
            {report.blockers && (
              <Alert severity="error" icon={false} sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Blockers</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{report.blockers}</Typography>
              </Alert>
            )}

            {(report.meetings || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Meetings</Typography>
                {report.meetings.map((m) => (
                  <Typography key={m._id || m.title} variant="body2" color="text.secondary">
                    • {m.title} ({m.durationMinutes} min)
                  </Typography>
                ))}
              </Box>
            )}

            {(report.gitCommits || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Git commits</Typography>
                {report.gitCommits.map((c, i) => (
                  <Typography key={c._id || i} variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {c.repo ? `[${c.repo}] ` : ''}{c.message}{c.hash ? ` (${c.hash.slice(0, 7)})` : ''}
                  </Typography>
                ))}
              </Box>
            )}

            {(report.tasksWorked || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Tasks worked</Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  {report.tasksWorked.map((t) => (
                    <Chip key={t._id || t} size="small" variant="outlined" label={t.title ? `${t.title} (${t.status})` : String(t)} />
                  ))}
                </Stack>
              </Box>
            )}

            <DetailSection title="Remarks" text={report.remarks} />

            {report.reviewedBy && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                Reviewed by {report.reviewedBy?.name || 'manager'}{report.reviewedAt ? ` on ${formatDate(report.reviewedAt)}` : ''}
              </Typography>
            )}

            <Divider sx={{ my: 2 }} />

            <Button
              size="small"
              variant="outlined"
              startIcon={summarizeM.isPending ? <CircularProgress size={14} /> : <SmartToyIcon />}
              onClick={() => summarizeM.mutate()}
              disabled={summarizeM.isPending}
            >
              Summarize with AI
            </Button>
            {summarizeM.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {getErrorMessage(summarizeM.error, 'AI summary failed')}
              </Alert>
            )}
            {aiText && (
              <Alert icon={false} severity="info" sx={{ mt: 1, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {aiText}
                {summary?.provider && (
                  <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.7 }}>
                    via {summary.provider}
                  </Typography>
                )}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function DetailSection({ title, text }) {
  if (!text) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{text}</Typography>
    </Box>
  );
}

/* ---------------------------------- Team --------------------------------- */

// Soft chip palettes — minimalist light system (tinted bg, saturated text).
const SOFT = {
  indigo: { bgcolor: '#EEF2FF', color: '#4338CA' },
  success: { bgcolor: '#ECFDF5', color: '#047857' },
  warning: { bgcolor: '#FFFBEB', color: '#B45309' },
  error: { bgcolor: '#FEF2F2', color: '#B91C1C' },
  neutral: { bgcolor: '#F3F4F6', color: '#4B5563' },
};
const MOOD_SOFT = {
  great: SOFT.success,
  good: SOFT.indigo,
  okay: SOFT.neutral,
  stressed: SOFT.warning,
  blocked: SOFT.error,
};
const STATUS_SOFT = { submitted: SOFT.neutral, reviewed: SOFT.success };

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  } catch {
    return '';
  }
};

function TeamTab() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canReview = hasPermission('evening_reporting', 'update');

  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [companyFilter, setCompanyFilter] = useState('');
  const [digestResult, setDigestResult] = useState(null);

  const query = useQuery({
    queryKey: ['reports', 'team', date],
    queryFn: () => reportingApi.team({ date: toApiDate(date) }),
    enabled: Boolean(date),
  });

  // The owner's companies — used as filter chips and for card accents.
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data.companies;
    },
    staleTime: 5 * 60_000,
  });

  // Directory of users — powers the "not submitted yet" list. Fails soft.
  const usersQuery = useQuery({
    queryKey: ['users', 'directory'],
    queryFn: async () => {
      try {
        const res = await api.get('/users', { params: { limit: 100 } });
        return res.data.data || [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });

  const reviewM = useMutation({
    mutationFn: (id) => reportingApi.review(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports', 'team'] }),
  });

  const digestM = useMutation({
    mutationFn: () => reportingApi.digest({ date: toApiDate(date) }),
    onSuccess: (res) => setDigestResult(res),
  });

  const reports = query.data?.reports || [];
  const filteredReports = companyFilter
    ? reports.filter((r) => r.user?.company?._id === companyFilter)
    : reports;

  // Who hasn't submitted: active, non-super-admin users with no report for the day.
  const allUsers = usersQuery.data || [];
  const reportedIds = new Set(reports.map((r) => r.user?._id).filter(Boolean));
  const notSubmitted = allUsers.filter((u) => {
    if (u.isActive === false) return false;
    if ((u.roles || []).some((role) => role?.isSuperAdmin === true)) return false;
    if (reportedIds.has(u._id)) return false;
    if (companyFilter && u.company?._id !== companyFilter) return false;
    return true;
  });

  const totalHours = Math.round(filteredReports.reduce((sum, r) => sum + (Number(r.hoursWorked) || 0), 0) * 10) / 10;
  const blockedCount = filteredReports.filter((r) => (r.blockers || '').trim()).length;
  const expectedCount = filteredReports.length + (allUsers.length > 0 ? notSubmitted.length : 0);

  return (
    <Box>
      {/* Controls: date, company filter, AI digest */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
        <TextField
          size="small"
          type="date"
          label="Date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setDigestResult(null); }}
          InputLabelProps={{ shrink: true }}
        />
        {companies.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
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
        <Button
          variant="outlined"
          startIcon={digestM.isPending ? <CircularProgress size={16} /> : <SmartToyIcon />}
          onClick={() => digestM.mutate()}
          disabled={digestM.isPending || !date}
        >
          Generate AI digest
        </Button>
      </Box>

      {digestM.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(digestM.error, 'Failed to generate digest')}
        </Alert>
      )}
      {digestResult && (
        <Alert icon={<SmartToyIcon fontSize="inherit" />} severity="info" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
          {digestResult.digest}
          <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.7 }}>
            via {digestResult.provider} · {digestResult.reportCount} report{digestResult.reportCount === 1 ? '' : 's'}
          </Typography>
        </Alert>
      )}

      {query.isLoading && (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
      )}
      {query.error && <Alert severity="error">{getErrorMessage(query.error, 'Failed to load team reports')}</Alert>}

      {!query.isLoading && !query.error && (
        <>
          {/* Summary strip */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
            {filteredReports.length} of {expectedCount} reported · {totalHours}h logged · {blockedCount} blocked
          </Typography>

          {filteredReports.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <Typography>No reports submitted for this date yet.</Typography>
              <Typography variant="caption">Reports show up here the moment your team submits them.</Typography>
            </Box>
          ) : (
            <Masonry columns={{ xs: 1, md: 2 }} spacing={2.5} sx={{ m: 0 }}>
              {filteredReports.map((r) => (
                <TeamReportCard key={r._id} report={r} canReview={canReview} reviewM={reviewM} />
              ))}
            </Masonry>
          )}

          {/* Not submitted yet */}
          {allUsers.length > 0 && (
            <Box sx={{ mt: 4, mb: 3 }}>
              {notSubmitted.length > 0 ? (
                <>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Not submitted ({notSubmitted.length})
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    {notSubmitted.map((u) => (
                      <Chip
                        key={u._id}
                        size="small"
                        label={u.name}
                        avatar={
                          <Avatar
                            sx={{
                              bgcolor: `${u.company?.color || '#6B7280'}1A`,
                              color: u.company?.color || '#6B7280',
                              fontWeight: 700,
                            }}
                          >
                            {initialsOf(u.name)}
                          </Avatar>
                        }
                        sx={{ bgcolor: '#FFFFFF', border: '1px solid', borderColor: 'divider', color: 'text.primary' }}
                      />
                    ))}
                  </Stack>
                </>
              ) : (
                <Typography variant="caption" sx={{ color: SOFT.success.color, fontWeight: 600 }}>
                  ✓ Everyone has reported.
                </Typography>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function TeamReportCard({ report: r, canReview, reviewM }) {
  const company = r.user?.company;
  const subtitle = [r.user?.designation, r.user?.department].filter(Boolean).join(' · ');
  const meetingCount = (r.meetings || []).length;
  const commitCount = (r.gitCommits || []).length;

  return (
    <Paper elevation={0} sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      {/* Header: who */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: company?.color || 'primary.main', width: 38, height: 38, fontSize: 14, fontWeight: 700 }}>
          {initialsOf(r.user?.name)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>{r.user?.name || 'Unknown'}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {subtitle || r.user?.email || '—'}
          </Typography>
        </Box>
        {company && (
          <Chip
            size="small"
            label={company.code || company.name}
            sx={{ bgcolor: `${company.color || '#4F46E5'}1A`, color: company.color || '#4F46E5' }}
          />
        )}
      </Box>

      {/* Meta: when + vitals */}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.75, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">{formatDate(r.date)}</Typography>
        {r.updatedAt && (
          <Typography variant="caption" color="text.secondary">submitted {formatTime(r.updatedAt)}</Typography>
        )}
        <Chip size="small" label={`${r.hoursWorked}h`} sx={SOFT.indigo} />
        <Chip size="small" label={REPORT_MOOD_LABELS[r.mood] || r.mood} sx={MOOD_SOFT[r.mood] || SOFT.neutral} />
        <Chip size="small" label={REPORT_STATUS_LABELS[r.status] || r.status} sx={STATUS_SOFT[r.status] || SOFT.neutral} />
      </Stack>

      {/* Body */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.8 }}>Today</Typography>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.workDone}</Typography>
      </Box>

      {r.tomorrowPlan && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.8 }}>Tomorrow</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{r.tomorrowPlan}</Typography>
        </Box>
      )}

      {r.blockers && (
        <Alert severity="error" icon={false} sx={{ mt: 1.5, py: 0.5, bgcolor: SOFT.error.bgcolor, color: SOFT.error.color }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>Blocked</Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.blockers}</Typography>
        </Alert>
      )}

      {(meetingCount > 0 || commitCount > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          {[
            meetingCount > 0 ? `${meetingCount} meeting${meetingCount === 1 ? '' : 's'}` : null,
            commitCount > 0 ? `${commitCount} commit${commitCount === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join(' · ')}
        </Typography>
      )}

      {r.aiSummary && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: SOFT.indigo.bgcolor }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: SOFT.indigo.color, display: 'block' }}>
            AI summary
          </Typography>
          <Typography variant="body2" sx={{ color: SOFT.indigo.color, whiteSpace: 'pre-wrap' }}>
            {r.aiSummary}
          </Typography>
        </Box>
      )}

      {/* Footer: review */}
      <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
        {r.status === 'reviewed' ? (
          <Typography variant="caption" color="text.secondary">
            Reviewed{r.reviewedBy?.name ? ` by ${r.reviewedBy.name}` : ''}
          </Typography>
        ) : (
          canReview && (
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={() => reviewM.mutate(r._id)}
              disabled={reviewM.isPending}
            >
              Mark reviewed
            </Button>
          )
        )}
      </Box>
    </Paper>
  );
}
