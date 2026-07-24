import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  TextField,
  Tooltip,
  Typography,
  Card,
  CardContent,
  CardHeader,
} from "@mui/material";
import { motion } from "framer-motion";
import ReportProblemIcon from "@mui/icons-material/ReportProblemOutlined";
import Masonry from "@mui/lab/Masonry";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { financeApi } from "../../api/finance.api.js";
import {
  StatGridSkeleton,
  ContentCardSkeleton,
  ListSkeleton,
  PageSkeleton,
} from "../../components/ui/SkeletonLoader.jsx";
import { dashboardApi } from "../../api/dashboard.api.js";
import { assetsApi } from "../../api/maintenance.api.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { getErrorMessage } from "../../lib/axios.js";
import { getSocket, connectSocket } from "../../lib/socket.js";

const MotionCard = motion(Card);
const MotionPaper = motion(Paper);

// Emoji per component type for the "My IT setup" cards.
const CAT_EMOJI = {
  cpu: "🖥️",
  desktop: "🖥️",
  monitor: "🖥️",
  mouse: "🖱️",
  keyboard: "⌨️",
  headset: "🎧",
  ups: "🔋",
  laptop: "💻",
  printer: "🖨️",
};
const catEmoji = (c) => CAT_EMOJI[c] || "📦";

const PRIORITY_SOFT = {
  low: { bgcolor: "#F3F4F6", color: "#4B5563" },
  medium: { bgcolor: "#F0F9FF", color: "#0369A1" },
  high: { bgcolor: "#FFFBEB", color: "#B45309" },
  urgent: { bgcolor: "#FEF2F2", color: "#B91C1C" },
};

function initialsOf(name = "") {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatINR(n) {
  return inr.format(n || 0);
}

function compactINR(n) {
  return `₹${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0)}`;
}

function formatDate(d) {
  return d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}

/** '2026-07' → 'Jul' for chart ticks. */
function shortMonth(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short" });
}

// Validated data-viz palette (dataviz skill — passes CVD + all-pairs in light
// mode with direct value labels for contrast relief). Categorical hues are
// assigned in fixed order; income/expense use semantic green/red.
const VIZ = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  violet: "#4a3aa7",
  magenta: "#e87ba4",
  income: "#1baf7a",
  expense: "#e34948",
  grid: "#EEF0F2",
  axis: "#94A3B8",
};

const MotionSurface = motion(Paper);

/** Shared surface styling for the chart cards. */
const chartSurfaceSx = {
  p: 3,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 3,
  height: "100%",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(249,250,251,0.9) 100%)",
  backdropFilter: "blur(8px)",
  transition: "all 0.2s ease",
  "&:hover": {
    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    borderColor: "primary.light",
  },
};

/** Donut tooltip — value + share, in ink tokens (never the series color). */
function DonutTooltip({ active, payload, total, money }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        px: 1.5,
        py: 0.75,
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {p.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {money ? formatINR(p.value) : p.value} · {pct}%
      </Typography>
    </Box>
  );
}

/**
 * Donut chart card. `data` = [{ name, value, color }]. `money` formats values
 * as INR. `centerLabel`/`centerValue`/`centerColor` fill the hole. Legend below
 * carries direct value labels (identity is never color-alone).
 */
function DonutCard({ label, data, money = false, centerLabel, centerValue, centerColor }) {
  const shown = (data || []).filter((d) => (d.value || 0) > 0);
  const total = shown.reduce((s, d) => s + (d.value || 0), 0);

  return (
    <MotionSurface
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      sx={chartSurfaceSx}
    >
      <Typography variant="overline" sx={{ color: "text.secondary", fontSize: 11, display: "block", mb: 1 }}>
        {label}
      </Typography>

      {total === 0 ? (
        <Box sx={{ display: "grid", placeItems: "center", height: 200 }}>
          <Typography variant="body2" color="text.secondary">
            No data yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ position: "relative", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={shown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="88%"
                  paddingAngle={2}
                  cornerRadius={4}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {shown.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<DonutTooltip total={total} money={money} />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center hole label */}
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {centerLabel}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1, color: centerColor || "text.primary" }}>
                {centerValue}
              </Typography>
            </Box>
          </Box>

          {/* Legend with direct value labels */}
          <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
            {shown.map((d) => (
              <Box key={d.name} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: d.color, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                  {d.name}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {money ? formatINR(d.value) : d.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </MotionSurface>
  );
}

/** Finance 12-month income-vs-expense bar chart (fetches the finance summary). */
function FinanceTrendCard({ enabled }) {
  const { data } = useQuery({
    queryKey: ["finance", "summary"],
    queryFn: () => financeApi.summary(),
    enabled,
    staleTime: 60_000,
  });

  const monthly = (data?.monthly || []).map((m) => ({ ...m, label: shortMonth(m.month) }));

  return (
    <MotionSurface
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      sx={chartSurfaceSx}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="overline" sx={{ color: "text.secondary", fontSize: 11 }}>
          Income vs expense — last 12 months
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5 }}>
          {[
            { k: "Income", c: VIZ.income },
            { k: "Expense", c: VIZ.expense },
          ].map((x) => (
            <Box key={x.k} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: x.c }} />
              <Typography variant="caption" color="text.secondary">
                {x.k}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {monthly.length === 0 ? (
        <Box sx={{ display: "grid", placeItems: "center", height: 260 }}>
          <Typography variant="body2" color="text.secondary">
            No transactions yet.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} barGap={2} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: VIZ.axis }} />
              <YAxis width={54} tickLine={false} axisLine={false} tickFormatter={compactINR} tick={{ fontSize: 12, fill: VIZ.axis }} />
              <ChartTooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(v, n) => [formatINR(v), n]}
                contentStyle={{ borderRadius: 8, border: `1px solid ${VIZ.grid}`, fontSize: 13 }}
              />
              <Bar dataKey="income" name="Income" fill={VIZ.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expense" name="Expense" fill={VIZ.expense} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}
    </MotionSurface>
  );
}

/** Assembles the donut + trend charts from whatever sections the user can see. */
function DashboardCharts({ o }) {
  const donuts = [];

  if (o.finance) {
    donuts.push(
      <DonutCard
        key="finance"
        label="This month — income vs expense"
        money
        centerLabel="Net"
        centerValue={compactINR(o.finance.monthNet)}
        centerColor={o.finance.monthNet >= 0 ? VIZ.income : VIZ.expense}
        data={[
          { name: "Income", value: o.finance.monthIncome, color: VIZ.income },
          { name: "Expense", value: o.finance.monthExpense, color: VIZ.expense },
        ]}
      />,
    );
  }

  if (o.employees) {
    const present = o.employees.presentToday || 0;
    const onLeave = o.employees.onLeaveToday ?? o.leave?.onLeaveToday ?? 0;
    const head = o.employees.headcount ?? present + onLeave;
    const away = Math.max(0, head - present - onLeave);
    donuts.push(
      <DonutCard
        key="workforce"
        label="Workforce today"
        centerLabel="Headcount"
        centerValue={head}
        data={[
          { name: "Present", value: present, color: VIZ.aqua },
          { name: "On leave", value: onLeave, color: VIZ.orange },
          { name: "Away", value: away, color: VIZ.blue },
        ]}
      />,
    );
  }

  if (o.erp) {
    donuts.push(
      <DonutCard
        key="erp"
        label="ERP stock & pipeline"
        centerLabel="In stock"
        centerValue={(o.erp.rawMaterialsInStock || 0) + (o.erp.finishedGoodsInStock || 0)}
        data={[
          { name: "Raw materials", value: o.erp.rawMaterialsInStock, color: VIZ.blue },
          { name: "Finished goods", value: o.erp.finishedGoodsInStock, color: VIZ.aqua },
          { name: "Pending QC", value: o.erp.pendingQC, color: VIZ.yellow },
        ]}
      />,
    );
  } else if (o.recruitment) {
    // Fallback third donut when ERP isn't in scope — hiring pipeline.
    donuts.push(
      <DonutCard
        key="recruitment"
        label="Hiring pipeline"
        centerLabel="Openings"
        centerValue={o.recruitment.totalOpenings || 0}
        data={[
          { name: "Open positions", value: o.recruitment.openPositions, color: VIZ.violet },
          { name: "Offers out", value: o.recruitment.offersPending, color: VIZ.magenta },
        ]}
      />,
    );
  }

  if (donuts.length === 0 && !o.finance) return null;

  return (
    <Grid container spacing={2.5} sx={{ mb: 4 }}>
      {donuts.map((d, i) => (
        <Grid item xs={12} sm={6} md={o.finance ? 4 : 6} key={i}>
          {d}
        </Grid>
      ))}
      {o.finance && (
        <Grid item xs={12} md={donuts.length >= 2 ? 12 : 8}>
          <FinanceTrendCard enabled={Boolean(o.finance)} />
        </Grid>
      )}
    </Grid>
  );
}

function StatCard({ label, value, hint, color = "text.primary", badge }) {
  return (
    <MotionCard
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      sx={{
        p: 2.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        height: "100%",
        background: "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(249,250,251,0.9) 100%)",
        backdropFilter: "blur(8px)",
        transition: "all 0.2s ease",
        "&:hover": {
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          borderColor: "primary.light",
          transform: "translateY(-2px)",
        },
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", fontWeight: 600, display: "block" }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          mt: 0.75,
        }}
      >
        <Typography
          component="div"
          sx={{
            fontWeight: 800,
            fontSize: 28,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            color,
          }}
        >
          {value}
        </Typography>
        {badge}
      </Box>
      {hint && (
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
        >
          {hint}
        </Typography>
      )}
    </MotionCard>
  );
}

/** Flatten the permission-aware overview into stat-card definitions. */
function buildCards(o) {
  const cards = [];

  if (o.tasks) {
    if (o.tasks.team) {
      cards.push({
        label: "Team open tasks",
        value: o.tasks.team.open,
        hint: `${o.tasks.team.size} people report to you`,
        color: "primary.main",
      });
    }
    cards.push(
      {
        label: "My open tasks",
        value: o.tasks.myOpen,
        hint: "assigned to you",
      },
      {
        label: "Overdue tasks",
        value: o.tasks.overdue,
        hint: "past their due date",
        color: o.tasks.overdue > 0 ? "error.main" : "text.primary",
      },
      {
        label: "Due today",
        value: o.tasks.dueToday,
        hint: "across the team",
        color: o.tasks.dueToday > 0 ? "warning.main" : "text.primary",
      },
    );
  }

  if (o.goals) {
    cards.push(
      {
        label: "Active goals",
        value: o.goals.active,
        hint: `${o.goals.achievedThisMonth} achieved this month`,
      },
      {
        label: "At-risk goals",
        value: o.goals.atRisk,
        hint: "need attention",
        color: o.goals.atRisk > 0 ? "warning.main" : "text.primary",
      },
    );
  }

  if (o.projects) {
    cards.push({
      label: "Active projects",
      value: o.projects.active,
      hint: "in delivery",
    });
  }

  if (o.renewals) {
    cards.push({
      label: "Renewals due 30d",
      value: o.renewals.dueIn30,
      hint: `${formatINR(o.renewals.amountDueIn30)} to collect`,
    });
  }

  if (o.support) {
    cards.push({
      label: "Open tickets",
      value: o.support.open,
      hint: "in the support queue",
      badge:
        o.support.breached > 0 ? (
          <Chip
            size="small"
            label={`${o.support.breached} SLA breached`}
            sx={{ bgcolor: "#FEF2F2", color: "#B91C1C" }}
          />
        ) : null,
    });
  }

  if (o.finance) {
    cards.push(
      {
        label: "Month income",
        value: compactINR(o.finance.monthIncome),
        hint: formatINR(o.finance.monthIncome),
        color: "success.main",
      },
      {
        label: "Month expense",
        value: compactINR(o.finance.monthExpense),
        hint: formatINR(o.finance.monthExpense),
        color: "error.main",
      },
      {
        label: "Month net",
        value: compactINR(o.finance.monthNet),
        hint: formatINR(o.finance.monthNet),
        color: o.finance.monthNet >= 0 ? "success.main" : "error.main",
      },
    );
  }

  if (o.maintenance) {
    cards.push(
      {
        label: "Upcoming maintenance",
        value: o.maintenance.upcomingIn30,
        hint: "next 30 days",
      },
      {
        label: "Breakdown assets",
        value: o.maintenance.breakdownAssets,
        hint: "need repair",
        color:
          o.maintenance.breakdownAssets > 0 ? "error.main" : "text.primary",
      },
    );
  }

  if (o.employees) {
    const e = o.employees;
    cards.push({
      label: "Present today",
      value: e.presentToday,
      hint:
        e.onLeaveToday != null
          ? `${e.onLeaveToday} on leave`
          : "incl. work from home",
    });
    if (e.headcount != null) {
      const net = (e.joinersThisMonth || 0) - (e.exitsThisMonth || 0);
      cards.push({
        label: "Headcount",
        value: e.headcount,
        hint: `${e.joinersThisMonth || 0} joined · ${e.exitsThisMonth || 0} exited this month`,
        color: net < 0 ? "error.main" : "text.primary",
      });
    }
    if (e.docsExpiringSoon > 0 || e.probationsDue > 0) {
      cards.push({
        label: "Compliance",
        value: (e.docsExpiringSoon || 0) + (e.probationsDue || 0),
        hint: `${e.docsExpiringSoon || 0} docs expiring · ${e.probationsDue || 0} probations due`,
        color: "warning.main",
      });
    }
  }

  if (o.leave) {
    cards.push({
      label: "On leave today",
      value: o.leave.onLeaveToday,
      hint: `${o.leave.upcomingThisWeek} upcoming this week`,
      badge:
        o.leave.pendingApprovals > 0 ? (
          <Chip
            size="small"
            label={`${o.leave.pendingApprovals} pending`}
            sx={{ bgcolor: "#FEF3C7", color: "#92400E" }}
          />
        ) : null,
    });
  }

  if (o.recruitment) {
    cards.push({
      label: "Open positions",
      value: o.recruitment.openPositions,
      hint: `${o.recruitment.totalOpenings} openings · ${o.recruitment.offersPending} offers out`,
    });
  }

  if (o.payroll && o.payroll.month) {
    cards.push({
      label: "Payroll (latest)",
      value: compactINR(o.payroll.totalCost),
      hint: `${o.payroll.headcount} paid · ${formatINR(o.payroll.totalCost)}`,
      color: "text.primary",
    });
  }

  if (o.reporting && typeof o.reporting.submittedToday === "number") {
    cards.push({
      label: "Reports today",
      value: o.reporting.submittedToday,
      hint: "evening reports submitted",
    });
  }

  return cards;
}

function SectionCard({ label, children }) {
  return (
    <MotionPaper
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      sx={{
        p: 3,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        background: "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(249,250,251,0.8) 100%)",
        backdropFilter: "blur(8px)",
        transition: "all 0.2s ease",
        "&:hover": {
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          borderColor: "primary.light",
        },
      }}
    >
      <Typography
        variant="overline"
        sx={{
          color: "text.secondary",
          display: "block",
          mb: 1.5,
          fontSize: 11,
        }}
      >
        {label}
      </Typography>
      {children}
    </MotionPaper>
  );
}

/** One task row with full delegation context: priority, due, who assigned it, to whom. */
function TaskRow({ task, onClick, showAssignees = false }) {
  const overdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    task.status !== "done";
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 1.1,
        cursor: "pointer",
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-of-type": { borderBottom: "none" },
        "&:hover": {
          bgcolor: "action.hover",
          mx: -1,
          px: 1,
          borderRadius: 1.5,
        },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {task.title}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block" }}
        >
          {task.assignedBy?.name
            ? `from ${task.assignedBy.name}`
            : task.createdBy?.name
              ? `by ${task.createdBy.name}`
              : ""}
          {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ""}
        </Typography>
      </Box>
      {showAssignees && task.assignees?.length > 0 && (
        <AvatarGroup
          max={3}
          sx={{ "& .MuiAvatar-root": { width: 22, height: 22, fontSize: 10 } }}
        >
          {task.assignees.map((a) => (
            <Tooltip key={a._id} title={a.name}>
              <Avatar sx={{ bgcolor: "#EEF2FF", color: "#4338CA" }}>
                {initialsOf(a.name)}
              </Avatar>
            </Tooltip>
          ))}
        </AvatarGroup>
      )}
      <Chip
        label={overdue ? "overdue" : task.priority}
        size="small"
        sx={{
          height: 20,
          fontSize: 10,
          textTransform: "capitalize",
          flexShrink: 0,
          ...(overdue
            ? { bgcolor: "#FEF2F2", color: "#B91C1C" }
            : PRIORITY_SOFT[task.priority] || PRIORITY_SOFT.low),
        }}
      />
    </Box>
  );
}

/**
 * "My IT setup" — the current user's assigned assets, with self-service
 * maintenance reporting. Hidden entirely when nothing is assigned to them.
 */
function MyAssetsSection() {
  const qc = useQueryClient();
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["maintenance", "my-assets"],
    queryFn: () => assetsApi.mine(),
  });
  const [reportAsset, setReportAsset] = useState(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState("");

  const reportMutation = useMutation({
    mutationFn: ({ id, reason: r }) => assetsApi.report(id, { reason: r }),
    onSuccess: () => {
      setReportAsset(null);
      setReason("");
      setDone("Reported — the maintenance team has been notified.");
      qc.invalidateQueries({ queryKey: ["maintenance", "my-assets"] });
    },
  });

  if (isLoading || assets.length === 0) return null;

  const setupNo = assets.find((a) => a.setupNumber)?.setupNumber;

  return (
   <MotionPaper
     initial={{ opacity: 0, y: 8 }}
     animate={{ opacity: 1, y: 0 }}
     transition={{ duration: 0.4 }}
     sx={{
       p: 3,
       mb: 4,
       border: "1px solid",
       borderColor: "divider",
       borderRadius: 3,
       background: "linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(249,250,251,0.8) 100%)",
       backdropFilter: "blur(8px)",
       transition: "all 0.2s ease",
       "&:hover": {
         boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
         borderColor: "primary.light",
       },
     }}
   >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: "text.secondary", fontSize: 11 }}
        >
          My IT setup — assigned to me
        </Typography>
        {setupNo && (
          <Chip
            size="small"
            label={`Setup #${setupNo}`}
            color="primary"
            variant="outlined"
          />
        )}
        <Chip
          size="small"
          label={`${assets.length} item${assets.length === 1 ? "" : "s"}`}
        />
      </Box>

      {done && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone("")}>
          {done}
        </Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
          gap: 1.5,
        }}
      >
        {assets.map((a) => (
          <Box
            key={a._id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              p: 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              transition: "border-color .15s, box-shadow .15s",
              "&:hover": { borderColor: "primary.main", boxShadow: 1 },
            }}
          >
            <Box sx={{ fontSize: 24, lineHeight: 1 }}>
              {catEmoji(a.category)}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {a.name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: "block" }}
              >
                {a.code || "—"}
                {a.room ? ` · room ${a.room}` : ""}
              </Typography>
            </Box>
            <Tooltip title="Report an issue with this item">
              <IconButton
                size="small"
                color="warning"
                onClick={() => {
                  setReportAsset(a);
                  setReason("");
                }}
              >
                <ReportProblemIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>

      <Dialog
        open={Boolean(reportAsset)}
        onClose={() => setReportAsset(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Report maintenance — {reportAsset?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {reportAsset?.code}
            {reportAsset?.setupNumber
              ? ` · setup #${reportAsset.setupNumber}`
              : ""}
          </Typography>
          <TextField
            label="What's the problem?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            autoFocus
            placeholder="e.g. Monitor flickering, mouse not working, CPU keeps restarting…"
          />
          {reportMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {getErrorMessage(reportMutation.error, "Failed to report")}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportAsset(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!reason.trim() || reportMutation.isPending}
            onClick={() =>
              reportMutation.mutate({
                id: reportAsset._id,
                reason: reason.trim(),
              })
            }
          >
            {reportMutation.isPending ? "Reporting…" : "Report issue"}
          </Button>
        </DialogActions>
      </Dialog>
    </MotionPaper>
  );
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => dashboardApi.overview(),
  });

  // Live refresh: any task change (assignment, delegation, completion)
  // re-renders the dashboard in real time.
  useEffect(() => {
    const socket = getSocket() || connectSocket();
    if (!socket) return undefined;
    const handler = () =>
      qc.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    socket.on("tasks:changed", handler);
    return () => socket.off("tasks:changed", handler);
  }, [qc]);

  const openTask = (t) => navigate(`/tasks?task=${t._id}`);

  const header = (
    <PageHeader
      title={`Welcome back, ${user?.name?.split(" ")[0] || "there"} 👋`}
      subtitle="Your business at a glance."
    />
  );

  if (isLoading) {
    return (
      <Box>
        {header}
        <Box sx={{ mt: 4 }}>
          <PageSkeleton />
        </Box>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box>
        {header}
        <Alert severity="error">
          {getErrorMessage(error, "Could not load the dashboard")}
        </Alert>
      </Box>
    );
  }

  const o = data || {};
  const cards = buildCards(o);
  const renewalsNext = o.renewals?.next || [];
  const topProjects = o.projects?.topActive || [];

  const lowerCards = [];

  // My work queue — full details of tasks assigned to me (who assigned, due, priority).
  if (o.tasks?.assignedToMe?.length > 0) {
    lowerCards.push(
      <SectionCard
        key="my-tasks"
        label={`My tasks — assigned to me (${o.tasks.myOpen})`}
      >
        {o.tasks.assignedToMe.map((t) => (
          <TaskRow key={t._id} task={t} onClick={() => openTask(t)} />
        ))}
      </SectionCard>,
    );
  }

  // Manager view — my team's open tasks and everything I've delegated onward.
  if (o.tasks?.team) {
    const team = o.tasks.team;
    lowerCards.push(
      <SectionCard
        key="team-tasks"
        label={`My team (${team.size}) — open tasks (${team.open})`}
      >
        {team.tasks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Your team has no open tasks.
          </Typography>
        ) : (
          team.tasks.map((t) => (
            <TaskRow
              key={t._id}
              task={t}
              onClick={() => openTask(t)}
              showAssignees
            />
          ))
        )}
      </SectionCard>,
    );
    if (team.delegatedByMe.length > 0) {
      lowerCards.push(
        <SectionCard
          key="delegated"
          label={`Delegated by me (${team.delegatedByMe.length})`}
        >
          {team.delegatedByMe.map((t) => (
            <TaskRow
              key={t._id}
              task={t}
              onClick={() => openTask(t)}
              showAssignees
            />
          ))}
        </SectionCard>,
      );
    }
  }

  if (o.renewals) {
    lowerCards.push(
      <SectionCard key="renewals" label="Next renewals">
        {renewalsNext.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No upcoming renewals.
          </Typography>
        ) : (
          renewalsNext.map((r) => (
            <Box
              key={r._id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                py: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:last-of-type": { borderBottom: "none" },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {r.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(r.dueDate)}
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {formatINR(r.amount)}
              </Typography>
            </Box>
          ))
        )}
      </SectionCard>,
    );
  }

  if (o.projects) {
    lowerCards.push(
      <SectionCard key="projects" label="Top active projects">
        {topProjects.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No active projects.
          </Typography>
        ) : (
          topProjects.map((p) => (
            <Box key={p._id} sx={{ py: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: 0.75,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {p.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {Math.round(p.progress || 0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, p.progress || 0))}
                sx={{ height: 6, borderRadius: 99 }}
              />
            </Box>
          ))
        )}
      </SectionCard>,
    );
  }

  return (
    <Box>
      {header}

      {o.reporting && o.reporting.myReportSubmittedToday === false && (
        <Alert
          severity="info"
          sx={{
            mb: 3,
            bgcolor: "#EFF6FF",
            color: "#1E40AF",
            border: "1px solid #DBEAFE",
            "& .MuiAlert-icon": { color: "#2563EB" },
          }}
        >
          {"You haven't submitted today's evening report yet."}
        </Alert>
      )}

      {cards.length === 0 ? (
        <Alert severity="info">
          {
            "You don't have access to any dashboard sections yet. Ask an admin to grant you module permissions."
          }
        </Alert>
      ) : (
        <>
          {/* Charts lead the dashboard — donuts + trend, then the KPI grid. */}
          <DashboardCharts o={o} />

          <Grid container spacing={2.5} sx={{ mb: 4 }}>
            {cards.map((card) => (
              <Grid item xs={6} sm={4} md={3} key={card.label}>
                <StatCard {...card} />
              </Grid>
            ))}
          </Grid>
        </>
      )}

      <MyAssetsSection />

      {lowerCards.length > 0 && (
        <Masonry
          columns={{ xs: 1, md: 2 }}
          spacing={2.5}
          sx={{ width: "auto" }}
        >
          {lowerCards}
        </Masonry>
      )}
    </Box>
  );
}
