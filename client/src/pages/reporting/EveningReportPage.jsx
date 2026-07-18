import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import Masonry from "@mui/lab/Masonry";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SendIcon from "@mui/icons-material/Send";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline";
import CancelIcon from "@mui/icons-material/CancelOutlined";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import CloseIcon from "@mui/icons-material/Close";
import PageHeader from "../../components/ui/PageHeader.jsx";
import {
  reportingApi,
  REPORT_MOODS,
  REPORT_MOOD_LABELS,
  REPORT_MOOD_COLOR,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_COLOR,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUS_COLOR,
} from "../../api/reporting.api.js";
import { usersApi } from "../../api/users.api.js";
import api, { getErrorMessage } from "../../lib/axios.js";
import { getSocket, connectSocket } from "../../lib/socket.js";
import { useAuth } from "../../auth/AuthContext.jsx";

// Absolute URL for a stored attachment (backend serves /uploads same-origin).
const API_ORIGIN = (api.defaults.baseURL || "").replace(/\/api\/v1\/?$/, "");
const mediaUrl = (u) => (u && u.startsWith("/") ? `${API_ORIGIN}${u}` : u);

const formatDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

const isToday = (iso) =>
  iso && new Date(iso).toDateString() === new Date().toDateString();

// yyyy-mm-dd (from a date input) -> ISO at local noon, so the server lands on the same day.
const toApiDate = (yyyyMmDd) => new Date(`${yyyyMmDd}T12:00:00`).toISOString();

export default function EveningReportPage() {
  const qc = useQueryClient();
  const { user, isSuperAdmin } = useAuth();

  // "Admin" (super admin or the admin role) oversees reporting rather than
  // filing a daily report: they get report history + team reports, and no
  // personal "My Report" form. Every other role files their own report and
  // sees their own history (no team view).
  const isAdmin =
    isSuperAdmin || (user?.roles || []).some((r) => (r?.slug || r) === "admin");

  // A manager is anyone with direct reports (org chart) who isn't an admin.
  // Managers file their own report AND review their team's; admins only review.
  // Key is scoped to the user id so a previous account's team can never leak in.
  const { data: myTeam = [] } = useQuery({
    queryKey: ["my-team", user?._id],
    queryFn: usersApi.myTeam,
    enabled: !isAdmin && Boolean(user?._id),
  });
  const isManager = !isAdmin && myTeam.length > 0;
  const canReview = isAdmin || isManager; // whoever sees the review tab

  // String tab keys so conditionally-rendered tabs never shift indices.
  const [tab, setTab] = useState(isAdmin ? "team" : "myReport");

  // Keep the active tab valid for the current role (resolves after my-team loads).
  useEffect(() => {
    setTab((t) => {
      if (isAdmin && t === "myReport") return "team";
      if (!canReview && t === "team") return "myReport";
      return t;
    });
  }, [isAdmin, canReview]);

  // Live updates: refetch whenever any client changes a report.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () => qc.invalidateQueries({ queryKey: ["reports"] });
    socket.on("reports:changed", handler);
    return () => socket.off("reports:changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box>
      <PageHeader
        title="Evening Reporting"
        subtitle={
          isAdmin
            ? "Review report history and give final acceptance on team reports."
            : isManager
              ? "Submit your report, and review & accept your team's reports."
              : "Submit your end-of-day report and keep the team in the loop."
        }
      />

      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {!isAdmin && <Tab label="My Report" value="myReport" />}
        <Tab label={isAdmin ? "History Reports" : "My History"} value="history" />
        {canReview && (
          <Tab label={isAdmin ? "Teams Reports" : "Team Reports"} value="team" />
        )}
      </Tabs>

      {tab === "myReport" && !isAdmin && <MyReportTab />}
      {tab === "history" && <MyHistoryTab isAdmin={isAdmin} />}
      {tab === "team" && canReview && <ReviewTab isAdmin={isAdmin} />}
    </Box>
  );
}

/* ------------------------------- My Report ------------------------------- */

const emptyForm = {
  workDone: "",
  tomorrowPlan: "",
  blockers: "",
  hoursWorked: 8,
  mood: "good",
  remarks: "",
};

function MyReportTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [meetings, setMeetings] = useState([]);
  const [gitCommits, setGitCommits] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);
  const [prefilled, setPrefilled] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Prefill from today's report if it already exists (latest report, date desc).
  const latestQuery = useQuery({
    queryKey: ["reports", "mine", "latest"],
    queryFn: () => reportingApi.mine({ limit: 1 }),
  });

  useEffect(() => {
    if (prefilled) return;
    const latest = latestQuery.data?.data?.[0];
    if (!latest || !isToday(latest.date)) return;
    setForm({
      workDone: latest.workDone || "",
      tomorrowPlan: latest.tomorrowPlan || "",
      blockers: latest.blockers || "",
      hoursWorked: latest.hoursWorked ?? 8,
      mood: latest.mood || "good",
      remarks: latest.remarks || "",
    });
    setMeetings(
      (latest.meetings || []).map((m) => ({
        title: m.title || "",
        durationMinutes: m.durationMinutes ?? 30,
      })),
    );
    setGitCommits(
      (latest.gitCommits || []).map((c) => ({
        repo: c.repo || "",
        message: c.message || "",
        hash: c.hash || "",
      })),
    );
    setAttachments(latest.attachments || []);
    setPrefilled(true);
  }, [latestQuery.data, prefilled]);

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same file
    if (!files.length) return;
    setUploadError("");
    setUploading(true);
    setSubmitted(false);
    try {
      const uploaded = await reportingApi.upload(files);
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setUploadError(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (idx) => {
    setSubmitted(false);
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitM = useMutation({
    mutationFn: (payload) => reportingApi.submit(payload),
    onSuccess: () => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });

  const set = (k, v) => {
    setSubmitted(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  const setRow = (setter) => (index, key, value) => {
    setSubmitted(false);
    setter((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
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
      hoursWorked: form.hoursWorked === "" ? 0 : Number(form.hoursWorked),
      mood: form.mood,
      remarks: form.remarks,
      meetings: meetings
        .filter((m) => m.title.trim())
        .map((m) => ({
          title: m.title.trim(),
          durationMinutes:
            m.durationMinutes === "" ? 30 : Number(m.durationMinutes),
        })),
      gitCommits: gitCommits
        .filter((c) => c.message.trim())
        .map((c) => ({
          repo: c.repo.trim(),
          message: c.message.trim(),
          hash: c.hash.trim(),
        })),
      attachments: attachments.map((a) => ({
        url: a.url,
        key: a.key,
        type: a.type,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
      })),
    });
  };

  return (
    <Paper
      elevation={0}
      component="form"
      onSubmit={onSubmit}
      sx={{ p: 3, border: "1px solid", borderColor: "divider" }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Report for {formatDate(new Date().toISOString())}
        </Typography>
        {(() => {
          const latest = latestQuery.data?.data?.[0];
          const today = latest && isToday(latest.date) ? latest : null;
          if (!today) return null;
          return (
            <Chip
              size="small"
              label={EMPLOYEE_STATUS_LABELS[today.status] || today.status}
              color={EMPLOYEE_STATUS_COLOR[today.status] || "default"}
            />
          );
        })()}
      </Box>

      {(() => {
        const latest = latestQuery.data?.data?.[0];
        const today = latest && isToday(latest.date) ? latest : null;
        if (!today) return null;
        const rej =
          today.status === "admin_rejected"
            ? today.adminReview
            : today.status === "manager_rejected"
              ? today.managerReview
              : null;
        if (!rej) return null;
        return (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            <b>
              {today.status === "admin_rejected" ? "Admin" : "Your manager"}{" "}
              returned this report
            </b>
            {rej.reason ? `: ${rej.reason}` : "."} Fix it and re-submit.
          </Alert>
        );
      })()}
      {prefilled && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          You already submitted a report today — submitting again will update
          it.
        </Alert>
      )}
      {submitted && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          Report {prefilled ? "updated" : "submitted"} for today. Great work —
          see you tomorrow!
        </Alert>
      )}
      {submitM.isError && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {getErrorMessage(submitM.error, "Failed to submit report")}
        </Alert>
      )}

      <TextField
        label="What did you work on today?"
        value={form.workDone}
        onChange={(e) => set("workDone", e.target.value)}
        fullWidth
        required
        multiline
        minRows={3}
        sx={{ mt: 2 }}
      />
      <TextField
        label="Plan for tomorrow"
        value={form.tomorrowPlan}
        onChange={(e) => set("tomorrowPlan", e.target.value)}
        fullWidth
        multiline
        minRows={2}
        sx={{ mt: 2 }}
      />
      <TextField
        label="Blockers (if any)"
        value={form.blockers}
        onChange={(e) => set("blockers", e.target.value)}
        fullWidth
        multiline
        minRows={2}
        sx={{ mt: 2 }}
      />

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 2 }}>
        <TextField
          label="Hours worked"
          type="number"
          value={form.hoursWorked}
          onChange={(e) => set("hoursWorked", e.target.value)}
          inputProps={{ min: 0, max: 24, step: 0.5 }}
          sx={{ flex: "1 1 150px" }}
        />
        <TextField
          select
          label="Mood"
          value={form.mood}
          onChange={(e) => set("mood", e.target.value)}
          sx={{ flex: "1 1 150px" }}
        >
          {REPORT_MOODS.map((m) => (
            <MenuItem key={m} value={m}>
              {REPORT_MOOD_LABELS[m]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Remarks"
          value={form.remarks}
          onChange={(e) => set("remarks", e.target.value)}
          sx={{ flex: "2 1 240px" }}
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Meetings */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Meetings
      </Typography>
      {meetings.map((m, i) => (
        <Box
          key={i}
          sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}
        >
          <TextField
            size="small"
            label="Meeting title"
            value={m.title}
            onChange={(e) => setMeeting(i, "title", e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            label="Minutes"
            type="number"
            value={m.durationMinutes}
            onChange={(e) => setMeeting(i, "durationMinutes", e.target.value)}
            inputProps={{ min: 0 }}
            sx={{ width: 110 }}
          />
          <IconButton
            size="small"
            color="error"
            onClick={() => removeRow(setMeetings)(i)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => {
          setSubmitted(false);
          setMeetings((rows) => [...rows, { title: "", durationMinutes: 30 }]);
        }}
      >
        Add meeting
      </Button>

      <Divider sx={{ my: 3 }} />

      {/* Git commits */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Git commits
      </Typography>
      {gitCommits.map((c, i) => (
        <Box
          key={i}
          sx={{
            display: "flex",
            gap: 1,
            mb: 1,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            label="Repo"
            value={c.repo}
            onChange={(e) => setCommit(i, "repo", e.target.value)}
            sx={{ flex: "1 1 140px" }}
          />
          <TextField
            size="small"
            label="Commit message"
            value={c.message}
            onChange={(e) => setCommit(i, "message", e.target.value)}
            sx={{ flex: "2 1 220px" }}
          />
          <TextField
            size="small"
            label="Hash"
            value={c.hash}
            onChange={(e) => setCommit(i, "hash", e.target.value)}
            sx={{ width: 120 }}
          />
          <IconButton
            size="small"
            color="error"
            onClick={() => removeRow(setGitCommits)(i)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        size="small"
        startIcon={<AddIcon />}
        onClick={() => {
          setSubmitted(false);
          setGitCommits((rows) => [
            ...rows,
            { repo: "", message: "", hash: "" },
          ]);
        }}
      >
        Add commit
      </Button>

      <Divider sx={{ my: 3 }} />

      {/* Attachments: photos & videos */}
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Photos & videos
      </Typography>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={onPickFiles}
      />
      {uploadError && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {uploadError}
        </Alert>
      )}
      {attachments.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 1.5,
            mb: 1.5,
          }}
        >
          {attachments.map((a, i) => (
            <AttachmentThumb key={a.url || i} att={a} onRemove={() => removeAttachment(i)} />
          ))}
        </Box>
      )}
      <Button
        size="small"
        startIcon={
          uploading ? <CircularProgress size={14} /> : <PhotoLibraryIcon />
        }
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? "Uploading…" : "Add photo / video"}
      </Button>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.5 }}
      >
        Images and videos up to 25 MB each.
      </Typography>

      <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="submit"
          variant="contained"
          startIcon={
            submitM.isPending ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SendIcon />
            )
          }
          disabled={submitM.isPending || uploading || !form.workDone.trim()}
        >
          {prefilled ? "Update report" : "Submit report"}
        </Button>
      </Box>
    </Paper>
  );
}

/** Image/video thumbnail with an optional remove button. */
function AttachmentThumb({ att, onRemove, readOnly = false }) {
  const src = mediaUrl(att.url);
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        aspectRatio: "1 / 1",
        bgcolor: "#0b0b0b",
      }}
    >
      {att.type === "video" ? (
        <video
          src={src}
          controls
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          <img
            src={src}
            alt={att.name || "attachment"}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </a>
      )}
      {!readOnly && onRemove && (
        <IconButton
          size="small"
          onClick={onRemove}
          sx={{
            position: "absolute",
            top: 2,
            right: 2,
            bgcolor: "rgba(0,0,0,0.55)",
            color: "#fff",
            "&:hover": { bgcolor: "rgba(0,0,0,0.78)" },
          }}
        >
          <CloseIcon sx={{ fontSize: 15 }} />
        </IconButton>
      )}
    </Box>
  );
}

/* ------------------------------- My History ------------------------------ */

function MyHistoryTab({ isAdmin = false }) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const limit = 10;

  const query = useQuery({
    queryKey: ["reports", "mine", { page, limit }],
    queryFn: () => reportingApi.mine({ page, limit }),
  });

  const items = query.data?.data || [];
  const meta = query.data?.meta || {};

  if (query.isLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (query.error) {
    return (
      <Alert severity="error">
        {getErrorMessage(query.error, "Failed to load reports")}
      </Alert>
    );
  }

  return (
    <Box>
      {items.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <Typography>
            {isAdmin
              ? "No report history yet — reports appear here once your team starts submitting."
              : "No reports yet — submit your first one from the My Report tab."}
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: "1px solid", borderColor: "divider" }}
          >
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
                  <TableRow
                    key={r._id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setDetailId(r._id)}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {formatDate(r.date)}
                    </TableCell>
                    <TableCell align="center">{r.hoursWorked}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={REPORT_MOOD_LABELS[r.mood] || r.mood}
                        color={REPORT_MOOD_COLOR[r.mood] || "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={EMPLOYEE_STATUS_LABELS[r.status] || r.status}
                        color={EMPLOYEE_STATUS_COLOR[r.status] || "default"}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 340 }}>
                      <Typography variant="body2" noWrap>
                        {r.workDone}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailId(r._id);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {(meta.totalPages || 0) > 1 && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
              <Pagination
                count={meta.totalPages}
                page={page}
                onChange={(e, v) => setPage(v)}
                size="small"
              />
            </Box>
          )}
        </>
      )}

      <ReportDetailDialog
        open={Boolean(detailId)}
        reportId={detailId}
        onClose={() => setDetailId(null)}
      />
    </Box>
  );
}

function ReportDetailDialog({ open, reportId, onClose }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ["reports", "detail", reportId],
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
      qc.invalidateQueries({ queryKey: ["reports", "detail", reportId] });
    },
  });

  const aiText = summary?.summary || report?.aiSummary;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Daily report{report ? ` — ${formatDate(report.date)}` : ""}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading || !report ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ mb: 2, flexWrap: "wrap", rowGap: 1 }}
            >
              <Chip
                size="small"
                label={`${report.hoursWorked}h worked`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={REPORT_MOOD_LABELS[report.mood] || report.mood}
                color={REPORT_MOOD_COLOR[report.mood] || "default"}
                variant="outlined"
              />
              <Chip
                size="small"
                label={EMPLOYEE_STATUS_LABELS[report.status] || report.status}
                color={EMPLOYEE_STATUS_COLOR[report.status] || "default"}
              />
            </Stack>

            <DetailSection title="Work done" text={report.workDone} />
            <DetailSection
              title="Plan for tomorrow"
              text={report.tomorrowPlan}
            />
            {report.blockers && (
              <Alert severity="error" icon={false} sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, display: "block" }}
                >
                  Blockers
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {report.blockers}
                </Typography>
              </Alert>
            )}

            {(report.meetings || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Meetings
                </Typography>
                {report.meetings.map((m) => (
                  <Typography
                    key={m._id || m.title}
                    variant="body2"
                    color="text.secondary"
                  >
                    • {m.title} ({m.durationMinutes} min)
                  </Typography>
                ))}
              </Box>
            )}

            {(report.gitCommits || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Git commits
                </Typography>
                {report.gitCommits.map((c, i) => (
                  <Typography
                    key={c._id || i}
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontFamily: "monospace", fontSize: 13 }}
                  >
                    {c.repo ? `[${c.repo}] ` : ""}
                    {c.message}
                    {c.hash ? ` (${c.hash.slice(0, 7)})` : ""}
                  </Typography>
                ))}
              </Box>
            )}

            {(report.tasksWorked || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Tasks worked
                </Typography>
                <Stack
                  direction="row"
                  spacing={0.5}
                  sx={{ flexWrap: "wrap", rowGap: 0.5 }}
                >
                  {report.tasksWorked.map((t) => (
                    <Chip
                      key={t._id || t}
                      size="small"
                      variant="outlined"
                      label={t.title ? `${t.title} (${t.status})` : String(t)}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            <DetailSection title="Remarks" text={report.remarks} />

            {(report.attachments || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Photos & videos
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                    gap: 1,
                  }}
                >
                  {report.attachments.map((a, i) => (
                    <AttachmentThumb key={a.url || i} att={a} readOnly />
                  ))}
                </Box>
              </Box>
            )}

            {(report.managerReview || report.adminReview) && (
              <Box sx={{ mb: 2 }}>
                <ReviewLine label="Manager" review={report.managerReview} />
                <ReviewLine label="Admin" review={report.adminReview} />
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Button
              size="small"
              variant="outlined"
              startIcon={
                summarizeM.isPending ? (
                  <CircularProgress size={14} />
                ) : (
                  <SmartToyIcon />
                )
              }
              onClick={() => summarizeM.mutate()}
              disabled={summarizeM.isPending}
            >
              Summarize with AI
            </Button>
            {summarizeM.isError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {getErrorMessage(summarizeM.error, "AI summary failed")}
              </Alert>
            )}
            {aiText && (
              <Alert
                icon={false}
                severity="info"
                sx={{ mt: 1, whiteSpace: "pre-wrap", fontSize: 13 }}
              >
                {aiText}
                {summary?.provider && (
                  <Typography
                    variant="caption"
                    display="block"
                    sx={{ mt: 0.5, opacity: 0.7 }}
                  >
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
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ whiteSpace: "pre-wrap" }}
      >
        {text}
      </Typography>
    </Box>
  );
}

/* ---------------------------------- Team --------------------------------- */

// Soft chip palettes — minimalist light system (tinted bg, saturated text).
const SOFT = {
  indigo: { bgcolor: "#EEF2FF", color: "#4338CA" },
  success: { bgcolor: "#ECFDF5", color: "#047857" },
  warning: { bgcolor: "#FFFBEB", color: "#B45309" },
  error: { bgcolor: "#FEF2F2", color: "#B91C1C" },
  neutral: { bgcolor: "#F3F4F6", color: "#4B5563" },
};
const MOOD_SOFT = {
  great: SOFT.success,
  good: SOFT.indigo,
  okay: SOFT.neutral,
  stressed: SOFT.warning,
  blocked: SOFT.error,
};
const STATUS_SOFT = {
  submitted: SOFT.warning,
  manager_approved: SOFT.indigo,
  manager_rejected: SOFT.error,
  admin_approved: SOFT.success,
  admin_rejected: SOFT.error,
};

const initialsOf = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

const formatTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso)
      .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      .toLowerCase();
  } catch {
    return "";
  }
};

/** Can the current reviewer (by scope) act on a report in this status? */
function isActionable(status, scope) {
  if (scope === "admin") return status === "submitted" || status === "manager_approved";
  // A manager reviews new submissions, and relays admin bounce-backs to the employee.
  if (scope === "manager") return status === "submitted" || status === "admin_rejected";
  return false;
}

function ReviewTab({ isAdmin }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?._id;

  const [date, setDate] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [companyFilter, setCompanyFilter] = useState("");
  const [digestResult, setDigestResult] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  const query = useQuery({
    queryKey: ["reports", "team", uid, date],
    queryFn: () => reportingApi.team({ date: toApiDate(date) }),
    enabled: Boolean(date && uid),
  });
  const scope = query.data?.scope || (isAdmin ? "admin" : "manager");

  // The owner's companies — filter chips + card accents. Fails soft.
  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      try {
        const res = await api.get("/companies");
        return res.data.data.companies;
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });

  // Who to expect: admins see everyone, managers see their direct reports.
  const usersQuery = useQuery({
    queryKey: ["reports", "expected", uid, isAdmin],
    queryFn: async () => {
      try {
        if (isAdmin) {
          const res = await api.get("/users", { params: { limit: 100 } });
          return res.data.data || [];
        }
        return await usersApi.myTeam();
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reports"] });
  const approveM = useMutation({
    mutationFn: (id) => reportingApi.approve(id),
    onSuccess: invalidate,
  });
  const rejectM = useMutation({
    mutationFn: ({ id, reason }) => reportingApi.reject(id, reason),
    onSuccess: () => {
      setRejectTarget(null);
      invalidate();
    },
  });

  const digestM = useMutation({
    mutationFn: () => reportingApi.digest({ date: toApiDate(date) }),
    onSuccess: (res) => setDigestResult(res),
  });

  const reports = query.data?.reports || [];
  const filteredReports = companyFilter
    ? reports.filter((r) => r.user?.company?._id === companyFilter)
    : reports;
  const pendingCount = reports.filter((r) => isActionable(r.status, scope)).length;

  // Who hasn't submitted: expected people with no report for the day.
  const allUsers = usersQuery.data || [];
  const reportedIds = new Set(reports.map((r) => r.user?._id).filter(Boolean));
  const notSubmitted = allUsers.filter((u) => {
    if (u.isActive === false) return false;
    if ((u.roles || []).some((role) => role?.isSuperAdmin === true)) return false;
    if (reportedIds.has(u._id)) return false;
    if (companyFilter && u.company?._id !== companyFilter) return false;
    return true;
  });

  const totalHours =
    Math.round(
      filteredReports.reduce(
        (sum, r) => sum + (Number(r.hoursWorked) || 0),
        0,
      ) * 10,
    ) / 10;
  const blockedCount = filteredReports.filter((r) =>
    (r.blockers || "").trim(),
  ).length;

  return (
    <Box>
      {/* Controls: date, company filter, AI digest */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          alignItems: "center",
          flexWrap: "wrap",
          mb: 3,
        }}
      >
        <TextField
          size="small"
          type="date"
          label="Date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDigestResult(null);
          }}
          InputLabelProps={{ shrink: true }}
        />
        {companies.length > 0 && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: "wrap", rowGap: 1 }}
          >
            <Chip
              label="All companies"
              size="small"
              onClick={() => setCompanyFilter("")}
              sx={
                !companyFilter
                  ? {
                      bgcolor: "primary.main",
                      color: "#fff",
                      "&:hover": { bgcolor: "primary.dark" },
                    }
                  : {
                      bgcolor: "#FFFFFF",
                      border: "1px solid",
                      borderColor: "divider",
                      color: "text.secondary",
                    }
              }
            />
            {companies.map((c) => (
              <Chip
                key={c._id}
                size="small"
                label={c.name}
                onClick={() =>
                  setCompanyFilter(companyFilter === c._id ? "" : c._id)
                }
                icon={
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: companyFilter === c._id ? "#fff" : c.color,
                      ml: 0.75,
                    }}
                  />
                }
                sx={
                  companyFilter === c._id
                    ? { bgcolor: c.color, color: "#fff" }
                    : {
                        bgcolor: "#FFFFFF",
                        border: "1px solid",
                        borderColor: "divider",
                        color: "text.primary",
                      }
                }
              />
            ))}
          </Stack>
        )}
        <Button
          variant="outlined"
          startIcon={
            digestM.isPending ? (
              <CircularProgress size={16} />
            ) : (
              <SmartToyIcon />
            )
          }
          onClick={() => digestM.mutate()}
          disabled={digestM.isPending || !date}
        >
          Generate AI digest
        </Button>
      </Box>

      {digestM.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(digestM.error, "Failed to generate digest")}
        </Alert>
      )}
      {digestResult && (
        <Alert
          icon={<SmartToyIcon fontSize="inherit" />}
          severity="info"
          sx={{ mb: 2, whiteSpace: "pre-wrap" }}
        >
          {digestResult.digest}
          <Typography
            variant="caption"
            display="block"
            sx={{ mt: 0.5, opacity: 0.7 }}
          >
            via {digestResult.provider} · {digestResult.reportCount} report
            {digestResult.reportCount === 1 ? "" : "s"}
          </Typography>
        </Alert>
      )}

      {query.isLoading && (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {query.error && (
        <Alert severity="error">
          {getErrorMessage(query.error, "Failed to load team reports")}
        </Alert>
      )}

      {!query.isLoading && !query.error && (
        <>
          {/* Summary strip */}
          <Box
            sx={{ display: "flex", gap: 1, alignItems: "center", mb: 2.5, flexWrap: "wrap" }}
          >
            <Typography variant="caption" color="text.secondary">
              {filteredReports.length} reported · {totalHours}h logged ·{" "}
              {blockedCount} blocked
            </Typography>
            {pendingCount > 0 && (
              <Chip
                size="small"
                label={`${pendingCount} pending your review`}
                sx={{ ...SOFT.warning, fontWeight: 700, height: 22 }}
              />
            )}
          </Box>

          {(approveM.isError || rejectM.isError) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(approveM.error || rejectM.error, "Action failed")}
            </Alert>
          )}

          {filteredReports.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
              <Typography>No reports submitted for this date yet.</Typography>
              <Typography variant="caption">
                Reports show up here the moment your team submits them.
              </Typography>
            </Box>
          ) : (
            <Masonry columns={{ xs: 1, md: 2 }} spacing={2.5} sx={{ m: 0 }}>
              {filteredReports.map((r) => (
                <ReviewReportCard
                  key={r._id}
                  report={r}
                  scope={scope}
                  onApprove={() => approveM.mutate(r._id)}
                  onReject={() => setRejectTarget(r)}
                  busy={approveM.isPending || rejectM.isPending}
                />
              ))}
            </Masonry>
          )}

          {/* Not submitted yet */}
          {allUsers.length > 0 && (
            <Box sx={{ mt: 4, mb: 3 }}>
              {notSubmitted.length > 0 ? (
                <>
                  <Typography
                    variant="overline"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1 }}
                  >
                    Not submitted ({notSubmitted.length})
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ flexWrap: "wrap", rowGap: 1 }}
                  >
                    {notSubmitted.map((u) => (
                      <Chip
                        key={u._id}
                        size="small"
                        label={u.name}
                        avatar={
                          <Avatar
                            sx={{
                              bgcolor: `${u.company?.color || "#6B7280"}1A`,
                              color: u.company?.color || "#6B7280",
                              fontWeight: 700,
                            }}
                          >
                            {initialsOf(u.name)}
                          </Avatar>
                        }
                        sx={{
                          bgcolor: "#FFFFFF",
                          border: "1px solid",
                          borderColor: "divider",
                          color: "text.primary",
                        }}
                      />
                    ))}
                  </Stack>
                </>
              ) : (
                <Typography
                  variant="caption"
                  sx={{ color: SOFT.success.color, fontWeight: 600 }}
                >
                  ✓ Everyone has reported.
                </Typography>
              )}
            </Box>
          )}
        </>
      )}

      <RejectDialog
        report={rejectTarget}
        open={Boolean(rejectTarget)}
        submitting={rejectM.isPending}
        onClose={() => setRejectTarget(null)}
        onSubmit={(reason) => rejectM.mutate({ id: rejectTarget._id, reason })}
      />
    </Box>
  );
}

/** Reason-required rejection dialog. */
function RejectDialog({ report, open, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState("");
  // Relaying an admin bounce-back? Pre-fill the admin's reason so the manager
  // can pass it on (and add what the employee should fix).
  const relaying =
    report?.status === "admin_rejected" && report?.adminReview?.reason;
  useEffect(() => {
    if (open) setReason(relaying ? report.adminReview.reason : "");
  }, [open, relaying, report]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Return report to {report?.user?.name || "employee"}</DialogTitle>
      <DialogContent>
        {relaying && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Admin returned this report. Tell {report?.user?.name || "the employee"} what
            to fix — the admin's reason is pre-filled below.
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Explain what needs fixing — this goes to them as a notification.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label="Reason"
          placeholder="e.g. Please add the client name and hours for the QA task."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <CancelIcon />}
          disabled={submitting || reason.trim().length < 3}
          onClick={() => onSubmit(reason.trim())}
        >
          Return report
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReviewReportCard({ report: r, scope, onApprove, onReject, busy }) {
  const company = r.user?.company;
  const subtitle = [r.user?.designation, r.user?.department]
    .filter(Boolean)
    .join(" · ");
  const meetingCount = (r.meetings || []).length;
  const commitCount = (r.gitCommits || []).length;
  const attachments = r.attachments || [];
  const actionable = isActionable(r.status, scope);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      {/* Header: who */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <Avatar
          sx={{
            bgcolor: company?.color || "primary.main",
            width: 38,
            height: 38,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {initialsOf(r.user?.name)}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
            {r.user?.name || "Unknown"}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block" }}
          >
            {subtitle || r.user?.email || "—"}
          </Typography>
        </Box>
        {company && (
          <Chip
            size="small"
            label={company.code || company.name}
            sx={{
              bgcolor: `${company.color || "#4F46E5"}1A`,
              color: company.color || "#4F46E5",
            }}
          />
        )}
      </Box>

      {/* Meta: when + vitals */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 0.75, alignItems: "center" }}
      >
        <Typography variant="caption" color="text.secondary">
          {formatDate(r.date)}
        </Typography>
        {r.updatedAt && (
          <Typography variant="caption" color="text.secondary">
            submitted {formatTime(r.updatedAt)}
          </Typography>
        )}
        <Chip size="small" label={`${r.hoursWorked}h`} sx={SOFT.indigo} />
        <Chip
          size="small"
          label={REPORT_MOOD_LABELS[r.mood] || r.mood}
          sx={MOOD_SOFT[r.mood] || SOFT.neutral}
        />
        <Chip
          size="small"
          label={REPORT_STATUS_LABELS[r.status] || r.status}
          sx={STATUS_SOFT[r.status] || SOFT.neutral}
        />
      </Stack>

      {/* Body */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.8 }}
        >
          Today
        </Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {r.workDone}
        </Typography>
      </Box>

      {r.tomorrowPlan && (
        <Box sx={{ mt: 1.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", lineHeight: 1.8 }}
          >
            Tomorrow
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: "pre-wrap" }}
          >
            {r.tomorrowPlan}
          </Typography>
        </Box>
      )}

      {r.blockers && (
        <Alert
          severity="error"
          icon={false}
          sx={{
            mt: 1.5,
            py: 0.5,
            bgcolor: SOFT.error.bgcolor,
            color: SOFT.error.color,
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, display: "block" }}
          >
            Blocked
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {r.blockers}
          </Typography>
        </Alert>
      )}

      {(meetingCount > 0 || commitCount > 0) && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1.5 }}
        >
          {[
            meetingCount > 0
              ? `${meetingCount} meeting${meetingCount === 1 ? "" : "s"}`
              : null,
            commitCount > 0
              ? `${commitCount} commit${commitCount === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
      )}

      {r.aiSummary && (
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 2,
            bgcolor: SOFT.indigo.bgcolor,
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: SOFT.indigo.color, display: "block" }}
          >
            AI summary
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: SOFT.indigo.color, whiteSpace: "pre-wrap" }}
          >
            {r.aiSummary}
          </Typography>
        </Box>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <Box
          sx={{
            mt: 1.5,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 1,
          }}
        >
          {attachments.map((a, i) => (
            <AttachmentThumb key={a.url || i} att={a} readOnly />
          ))}
        </Box>
      )}

      {/* Review trail: manager decision then admin decision */}
      {(r.managerReview || r.adminReview) && (
        <Box sx={{ mt: 1.5 }}>
          <ReviewLine label="Manager" review={r.managerReview} />
          <ReviewLine label="Admin" review={r.adminReview} />
        </Box>
      )}

      {/* Footer: approve / reject */}
      <Box
        sx={{
          mt: 1.5,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 1,
        }}
      >
        {actionable ? (
          <>
            <Button
              size="small"
              color="error"
              startIcon={<CancelIcon />}
              onClick={onReject}
              disabled={busy}
            >
              {scope === "manager" && r.status === "admin_rejected"
                ? "Return to employee"
                : "Reject"}
            </Button>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              onClick={onApprove}
              disabled={busy}
            >
              {scope === "admin" && r.status === "manager_approved"
                ? "Final accept"
                : scope === "manager" && r.status === "admin_rejected"
                  ? "Re-accept"
                  : "Accept"}
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {r.status === "admin_approved"
              ? "✓ Accepted"
              : r.status === "manager_approved"
                ? "Awaiting admin review"
                : r.status === "manager_rejected"
                  ? "Returned to employee"
                  : r.status === "admin_rejected"
                    ? "Returned to manager"
                    : ""}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

/** One line of the review trail — "Manager approved" or "Admin returned: …". */
function ReviewLine({ label, review }) {
  if (!review) return null;
  const rejected = review.decision === "rejected";
  return (
    <Box
      sx={{
        display: "flex",
        gap: 0.75,
        alignItems: "flex-start",
        mt: 0.5,
        color: rejected ? SOFT.error.color : SOFT.success.color,
      }}
    >
      {rejected ? (
        <CancelIcon sx={{ fontSize: 16, mt: 0.1 }} />
      ) : (
        <CheckCircleIcon sx={{ fontSize: 16, mt: 0.1 }} />
      )}
      <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
        <b>
          {label} {rejected ? "returned" : "accepted"}
        </b>
        {review.reviewer?.name ? ` · ${review.reviewer.name}` : ""}
        {rejected && review.reason ? ` — “${review.reason}”` : ""}
      </Typography>
    </Box>
  );
}
