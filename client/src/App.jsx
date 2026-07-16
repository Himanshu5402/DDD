import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import AppLayout from './components/layout/AppLayout.jsx';
import ProtectedRoute from './auth/ProtectedRoute.jsx';
import RequirePermission from './auth/RequirePermission.jsx';
import LoginPage from './pages/LoginPage.jsx';

// Route-level code-splitting: each module page loads on demand.
const DashboardOverviewPage = lazy(() => import('./pages/dashboard/DashboardOverviewPage.jsx'));
const TasksBoardPage = lazy(() => import('./pages/tasks/TasksBoardPage.jsx'));
const GoalsPage = lazy(() => import('./pages/goals/GoalsPage.jsx'));
const RrrmasPage = lazy(() => import('./pages/rrrmas/RrrmasPage.jsx'));
const ProjectsOverviewPage = lazy(() => import('./pages/projects/ProjectsOverviewPage.jsx'));
const ProductsPage = lazy(() => import('./pages/products/ProductsPage.jsx'));
const FinancePage = lazy(() => import('./pages/finance/FinancePage.jsx'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage.jsx'));
const EmployeeAnalyticsPage = lazy(() => import('./pages/employees/EmployeeAnalyticsPage.jsx'));
const EveningReportPage = lazy(() => import('./pages/reporting/EveningReportPage.jsx'));
const AiHubPage = lazy(() => import('./pages/ai/AiHubPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const CustomFieldsPage = lazy(() => import('./pages/CustomFieldsPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

function PageLoader() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <CircularProgress />
    </Box>
  );
}

/** Shorthand: permission-gated, lazy-loaded module route. */
function guarded(module, Element) {
  return (
    <RequirePermission module={module} action="read">
      <Element />
    </RequirePermission>
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
            <Route path="tasks" element={guarded('tasks', TasksBoardPage)} />
            <Route path="goals" element={guarded('goals', GoalsPage)} />
            <Route path="rrrmas" element={guarded('rrrmas', RrrmasPage)} />
            <Route path="projects" element={guarded('rrrmas', ProjectsOverviewPage)} />
            <Route path="products" element={guarded('products', ProductsPage)} />
            <Route path="finance" element={guarded('finance', FinancePage)} />
            <Route path="maintenance" element={guarded('maintenance', MaintenancePage)} />
            <Route path="employees" element={guarded('employee_analytics', EmployeeAnalyticsPage)} />
            <Route path="reporting" element={guarded('evening_reporting', EveningReportPage)} />
            <Route path="ai" element={guarded('ai', AiHubPage)} />
            <Route path="admin/users" element={guarded('users', UsersPage)} />
            <Route path="admin/roles" element={guarded('roles', RolesPage)} />
            <Route path="admin/audit" element={guarded('audit', AuditPage)} />
            <Route path="admin/custom-fields" element={guarded('custom_fields', CustomFieldsPage)} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
