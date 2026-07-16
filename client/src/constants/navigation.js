import DashboardIcon from '@mui/icons-material/SpaceDashboard';
import FlagIcon from '@mui/icons-material/Flag';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PaymentsIcon from '@mui/icons-material/Payments';
import BuildIcon from '@mui/icons-material/Build';
import InsightsIcon from '@mui/icons-material/Insights';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PeopleIcon from '@mui/icons-material/People';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import TuneIcon from '@mui/icons-material/Tune';
import HistoryIcon from '@mui/icons-material/History';

/**
 * Sidebar navigation. `module`/`action` map to RBAC permissions — items the
 * user can't access are hidden. `ready:false` marks modules not yet built
 * (shown as "coming soon"). `null` module = always visible.
 */
export const NAV_SECTIONS = [
  {
    heading: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: DashboardIcon, module: 'dashboard', action: 'read', ready: true }],
  },
  {
    heading: 'Work',
    items: [
      { label: 'Goals', to: '/goals', icon: FlagIcon, module: 'goals', action: 'read', ready: true },
      { label: 'Tasks', to: '/tasks', icon: TaskAltIcon, module: 'tasks', action: 'read', ready: true },
      { label: 'Evening Reporting', to: '/reporting', icon: NightsStayIcon, module: 'evening_reporting', action: 'read', ready: true },
    ],
  },
  {
    heading: 'Business',
    items: [
      { label: 'Projects (PEPSI)', to: '/projects', icon: WorkOutlineIcon, module: 'rrrmas', action: 'read', ready: true },
      { label: 'RRRMAS', to: '/rrrmas', icon: GroupsIcon, module: 'rrrmas', action: 'read', ready: true },
      { label: 'Products', to: '/products', icon: Inventory2Icon, module: 'products', action: 'read', ready: true },
      { label: 'Finance', to: '/finance', icon: PaymentsIcon, module: 'finance', action: 'read', ready: true },
      { label: 'Maintenance', to: '/maintenance', icon: BuildIcon, module: 'maintenance', action: 'read', ready: true },
      { label: 'Employee Analytics', to: '/employees', icon: InsightsIcon, module: 'employee_analytics', action: 'read', ready: true },
    ],
  },
  {
    heading: 'Intelligence',
    items: [{ label: 'AI Intelligence', to: '/ai', icon: SmartToyIcon, module: 'ai', action: 'read', ready: true }],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Users', to: '/admin/users', icon: PeopleIcon, module: 'users', action: 'read', ready: true },
      { label: 'Roles & Permissions', to: '/admin/roles', icon: AdminPanelSettingsIcon, module: 'roles', action: 'read', ready: true },
      { label: 'Custom Fields', to: '/admin/custom-fields', icon: TuneIcon, module: 'custom_fields', action: 'read', ready: true },
      { label: 'Audit Log', to: '/admin/audit', icon: HistoryIcon, module: 'audit', action: 'read', ready: true },
    ],
  },
];
