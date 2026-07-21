import { Skeleton, Box, Paper, Grid } from "@mui/material";
import { motion } from "framer-motion";

const MotionPaper = motion(Paper);

/**
 * Animated skeleton loader for stat cards
 */
export function StatCardSkeleton() {
  return (
    <MotionPaper
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      sx={{
        p: 2.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        height: "100%",
      }}
    >
      <Skeleton variant="text" width="60%" height={16} />
      <Skeleton variant="text" width="80%" height={32} sx={{ my: 1 }} />
      <Skeleton variant="text" width="70%" height={12} />
    </MotionPaper>
  );
}

/**
 * Skeleton for dashboard stat grid
 */
export function StatGridSkeleton({ count = 4 }) {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Grid item xs={6} md={3} key={i}>
          <StatCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}

/**
 * Skeleton for large content cards
 */
export function ContentCardSkeleton({ height = 300 }) {
  return (
    <MotionPaper
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      sx={{
        p: 3,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        height,
      }}
    >
      <Skeleton variant="text" width="40%" height={24} />
      <Skeleton
        variant="rectangular"
        height={height - 100}
        sx={{ mt: 2, borderRadius: 2 }}
      />
    </MotionPaper>
  );
}

/**
 * Skeleton for table rows
 */
export function TableRowSkeleton({ columns = 5 }) {
  return (
    <Box sx={{ display: "flex", gap: 2, py: 1.5 }}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={`${100 / columns - 2}%`}
          height={32}
        />
      ))}
    </Box>
  );
}

/**
 * Skeleton for table with multiple rows
 */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </Box>
  );
}

/**
 * Skeleton for a list item
 */
export function ListItemSkeleton() {
  return (
    <MotionPaper
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      sx={{
        p: 2,
        mb: 1.5,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="40%" height={14} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
    </MotionPaper>
  );
}

/**
 * Skeleton for a list with multiple items
 */
export function ListSkeleton({ count = 5 }) {
  return (
    <Box>
      {Array.from({ length: count }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </Box>
  );
}

/**
 * Skeleton for chart/graph area
 */
export function ChartSkeleton() {
  return (
    <MotionPaper
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
      sx={{
        p: 3,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        minHeight: 400,
      }}
    >
      <Skeleton variant="text" width="30%" height={24} />
      <Skeleton
        variant="rectangular"
        height={320}
        sx={{ mt: 2, borderRadius: 2 }}
      />
    </MotionPaper>
  );
}

/**
 * Skeleton for grid layout dashboard
 */
export function DashboardGridSkeleton() {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={7}>
        <ContentCardSkeleton height={350} />
      </Grid>
      <Grid item xs={12} md={5}>
        <ContentCardSkeleton height={350} />
      </Grid>
    </Grid>
  );
}

/**
 * Full page skeleton loader
 */
export function PageSkeleton() {
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="text" width="60%" height={16} sx={{ mt: 1 }} />
      </Box>
      <StatGridSkeleton count={4} />
      <DashboardGridSkeleton />
    </Box>
  );
}
