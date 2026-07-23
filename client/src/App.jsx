import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Box } from "@mui/material";
import { PageSkeleton } from "./components/ui/SkeletonLoader.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import LoginPage from "./pages/LoginPage.jsx";

// Route-level code-splitting: each module page loads on demand.
const DashboardOverviewPage = lazy(
  () => import("./pages/dashboard/DashboardOverviewPage.jsx"),
);
const OrgChartPage = lazy(() => import("./pages/org/OrgChartPage.jsx"));
const TasksBoardPage = lazy(() => import("./pages/tasks/TasksBoardPage.jsx"));
const GoalsPage = lazy(() => import("./pages/goals/GoalsPage.jsx"));
const RrrmasPage = lazy(() => import("./pages/rrrmas/RrrmasPage.jsx"));
const ProjectsOverviewPage = lazy(
  () => import("./pages/projects/ProjectsOverviewPage.jsx"),
);
const ProductsPage = lazy(() => import("./pages/products/ProductsPage.jsx"));
const FinancePage = lazy(() => import("./pages/finance/FinancePage.jsx"));
const MaintenancePage = lazy(
  () => import("./pages/maintenance/MaintenancePage.jsx"),
);
const ErpPage = lazy(() => import("./pages/erp/ErpPage.jsx"));
const EmployeeAnalyticsPage = lazy(
  () => import("./pages/employees/EmployeeAnalyticsPage.jsx"),
);
const LeavePage = lazy(() => import("./pages/leave/LeavePage.jsx"));
const RecruitmentPage = lazy(
  () => import("./pages/recruitment/RecruitmentPage.jsx"),
);
const PayrollPage = lazy(() => import("./pages/payroll/PayrollPage.jsx"));
const EveningReportPage = lazy(
  () => import("./pages/reporting/EveningReportPage.jsx"),
);
const AiHubPage = lazy(() => import("./pages/ai/AiHubPage.jsx"));
const UsersPage = lazy(() => import("./pages/UsersPage.jsx"));
const AuditPage = lazy(() => import("./pages/AuditPage.jsx"));
const CustomFieldsPage = lazy(() => import("./pages/CustomFieldsPage.jsx"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage.jsx"));

function PageLoader() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
      <PageSkeleton />
    </Box>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated app */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardOverviewPage />} />
            {/* Org directory — visible to every signed-in employee. */}
            <Route path="organization" element={<OrgChartPage />} />
            <Route path="tasks" element={<TasksBoardPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="rrrmas" element={<RrrmasPage />} />
            <Route path="projects" element={<ProjectsOverviewPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="erp" element={<ErpPage />} />
            <Route path="employees" element={<EmployeeAnalyticsPage />} />
            <Route path="leave" element={<LeavePage />} />
            <Route path="recruitment" element={<RecruitmentPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="reporting" element={<EveningReportPage />} />
            <Route path="ai" element={<AiHubPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/audit" element={<AuditPage />} />
            <Route
              path="admin/custom-fields"
              element={<CustomFieldsPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
