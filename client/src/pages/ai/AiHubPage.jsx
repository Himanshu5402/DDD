import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Tabs,
  Tab,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  InputAdornment,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { getErrorMessage } from '../../lib/axios.js';
import { aiInsightsApi, askAi } from '../../api/aiInsights.api.js';

// --- Small helpers ----------------------------------------------------------
function humanize(v) {
  return String(v ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const CHIP_COLORS = {
  done: 'success', achieved: 'success', active: 'success', operational: 'success',
  income: 'success', resolved: 'success', renewed: 'success', customer: 'success', completed: 'success',
  open: 'info', in_progress: 'info', upcoming: 'info', lead: 'info', new: 'info', planning: 'info',
  at_risk: 'warning', due: 'warning', waiting: 'warning', on_hold: 'warning', under_maintenance: 'warning',
  stressed: 'warning', high: 'warning',
  blocked: 'error', breakdown: 'error', urgent: 'error', expense: 'error', expired: 'error',
};
const chipColor = (v) => CHIP_COLORS[v] || 'default';

// Display config per search result group (order = display order).
const SEARCH_GROUPS = [
  { key: 'tasks', label: 'Tasks', primary: (i) => i.title, chip: (i) => i.status },
  { key: 'goals', label: 'Goals', primary: (i) => i.title, chip: (i) => i.status },
  {
    key: 'contacts',
    label: 'Contacts',
    primary: (i) => (i.company ? `${i.name} — ${i.company}` : i.name),
    chip: (i) => i.type,
  },
  { key: 'projects', label: 'Projects', primary: (i) => i.name, chip: (i) => i.status },
  {
    key: 'renewals',
    label: 'Renewals',
    primary: (i) => `${i.title} — due ${formatDate(i.dueDate)}`,
    chip: (i) => i.status,
  },
  { key: 'tickets', label: 'Tickets', primary: (i) => i.subject, chip: (i) => i.status },
  {
    key: 'products',
    label: 'Products',
    primary: (i) => (i.sku ? `${i.name} (${i.sku})` : i.name),
    chip: (i) => i.category,
  },
  {
    key: 'assets',
    label: 'Assets',
    primary: (i) => (i.code ? `${i.name} [${i.code}]` : i.name),
    chip: (i) => i.status,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    primary: (i) => `${i.description || 'Transaction'} — ${i.amount} (${formatDate(i.date)})`,
    chip: (i) => i.type,
  },
  {
    key: 'reports',
    label: 'Reports',
    primary: (i) => `${i.user?.name || 'Report'} — ${formatDate(i.date)}`,
    chip: () => null,
  },
];

function ProviderChip({ provider }) {
  if (!provider) return null;
  return <Chip size="small" icon={<SmartToyIcon />} label={`provider: ${provider}`} />;
}

const panelSx = { p: 3, border: '1px solid', borderColor: 'divider' };

export default function AiHubPage() {
  const [tab, setTab] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [searchText, setSearchText] = useState('');

  const ask = useMutation({ mutationFn: (text) => askAi(text) });
  const brief = useMutation({ mutationFn: () => aiInsightsApi.dailyBrief() });
  const search = useMutation({ mutationFn: (q) => aiInsightsApi.search(q) });

  const onAsk = (e) => {
    e.preventDefault();
    if (prompt.trim()) ask.mutate(prompt.trim());
  };

  const onSearch = (e) => {
    e.preventDefault();
    const q = searchText.trim();
    if (q.length >= 2) search.mutate(q);
  };

  const activeProvider =
    (tab === 0 && ask.data?.provider) ||
    (tab === 1 && brief.data?.provider) ||
    (tab === 2 && search.data?.provider) ||
    null;

  return (
    <Box>
      <PageHeader
        title="AI Intelligence"
        subtitle="Copilot, cross-module daily brief and intelligent search — permission-aware."
        action={<ProviderChip provider={activeProvider} />}
      />

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Copilot" />
        <Tab label="Daily Brief" />
        <Tab label="Smart Search" />
      </Tabs>

      {/* --- Copilot ---------------------------------------------------------- */}
      {tab === 0 && (
        <Box>
          <Paper elevation={0} component="form" onSubmit={onAsk} sx={panelSx}>
            <TextField
              fullWidth
              multiline
              minRows={3}
              placeholder="Ask anything… e.g. 'Summarize what my team should focus on today.'"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" disabled={ask.isPending || !prompt.trim()}>
                {ask.isPending ? <CircularProgress size={20} color="inherit" /> : 'Ask copilot'}
              </Button>
            </Box>
          </Paper>

          {ask.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(ask.error, 'AI request failed')}
            </Alert>
          )}

          {ask.data && (
            <Paper elevation={0} sx={{ ...panelSx, mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Response
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{ask.data.text}</Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* --- Daily Brief ------------------------------------------------------ */}
      {tab === 1 && (
        <Box>
          <Paper elevation={0} sx={{ ...panelSx, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Pulls overdue tasks, at-risk goals, renewals, tickets, finance, maintenance and today's
              reports from every module you can read — then asks the AI what matters most.
            </Typography>
            <Button
              size="large"
              variant="contained"
              startIcon={brief.isPending ? null : <AutoAwesomeIcon />}
              onClick={() => brief.mutate()}
              disabled={brief.isPending}
            >
              {brief.isPending ? <CircularProgress size={24} color="inherit" /> : "Generate today's brief"}
            </Button>
          </Paper>

          {brief.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(brief.error, 'Could not generate the daily brief')}
            </Alert>
          )}

          {brief.data && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="info" icon={<SmartToyIcon />} sx={{ whiteSpace: 'pre-wrap' }}>
                {brief.data.brief}
              </Alert>

              <Accordion
                elevation={0}
                disableGutters
                sx={{ mt: 2, border: '1px solid', borderColor: 'divider', '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">Data snapshot</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography
                    component="pre"
                    sx={{ m: 0, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}
                  >
                    {brief.data.snapshot}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            </Box>
          )}
        </Box>
      )}

      {/* --- Smart Search ----------------------------------------------------- */}
      {tab === 2 && (
        <Box>
          <Paper elevation={0} component="form" onSubmit={onSearch} sx={{ ...panelSx, display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search tasks, goals, contacts, projects, renewals, tickets, products, assets, transactions, reports…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Button type="submit" variant="contained" disabled={search.isPending || searchText.trim().length < 2}>
              Search
            </Button>
          </Paper>

          {search.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(search.error, 'Search failed')}
            </Alert>
          )}

          {search.isPending && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )}

          {!search.isPending && search.data && (
            <Box sx={{ mt: 2 }}>
              {search.data.synthesis && (
                <Alert severity="info" icon={<SmartToyIcon />} sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                  {search.data.synthesis}
                </Alert>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {search.data.totalHits} result{search.data.totalHits === 1 ? '' : 's'} for “{search.data.query}”
              </Typography>

              {search.data.totalHits === 0 ? (
                <Alert severity="warning">No matches in the modules you can read. Try another term.</Alert>
              ) : (
                <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <List dense disablePadding>
                    {SEARCH_GROUPS.filter((g) => search.data.results[g.key]?.items?.length).map((g) => {
                      const group = search.data.results[g.key];
                      return (
                        <Box key={g.key}>
                          <ListSubheader
                            sx={{ bgcolor: 'transparent', lineHeight: '32px' }}
                            disableSticky
                          >
                            {g.label} ({group.count})
                          </ListSubheader>
                          {group.items.map((item, idx) => {
                            const chipValue = g.chip(item);
                            return (
                              <ListItem key={item._id || idx} divider>
                                <ListItemText
                                  primary={g.primary(item)}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                                {chipValue && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={humanize(chipValue)}
                                    color={chipColor(chipValue)}
                                  />
                                )}
                              </ListItem>
                            );
                          })}
                        </Box>
                      );
                    })}
                  </List>
                </Paper>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
