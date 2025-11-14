import {
  IconChartBar,
  IconDatabase,
  IconFiles,
  IconHistory,
  IconHome,
  IconKey,
  IconPlayerPlay,
  IconSearch,
  IconUsers,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavLink, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { UserRole } from '@/entities/user/model';
import { useAuth } from '@/features/auth/model';
import { ROUTES } from '@/shared/config';

interface SidebarProps {
  onMobileClose: () => void;
}

export function Sidebar({ onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 48em)');

  const navItems = [
    {
      label: 'Dashboard',
      icon: IconHome,
      path: ROUTES.DASHBOARD,
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER],
    },
    {
      label: 'Tìm kiếm',
      icon: IconSearch,
      path: ROUTES.RETRIEVAL,
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER],
    },
    {
      label: 'Documents',
      icon: IconFiles,
      path: '/documents',
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    },
    {
      label: 'Evaluation',
      icon: IconChartBar,
      path: ROUTES.EVALUATION_DASHBOARD,
      roles: [UserRole.SUPER_ADMIN],
      children: [
        {
          label: 'Dashboard',
          icon: IconChartBar,
          path: ROUTES.EVALUATION_DASHBOARD,
        },
        {
          label: 'Run Evaluation',
          icon: IconPlayerPlay,
          path: ROUTES.EVALUATION_RUN,
        },
        {
          label: 'Datasets',
          icon: IconDatabase,
          path: ROUTES.EVALUATION_DATASETS,
        },
        {
          label: 'Files',
          icon: IconFiles,
          path: ROUTES.EVALUATION_FILES,
        },
        {
          label: 'Job History',
          icon: IconHistory,
          path: ROUTES.EVALUATION_JOBS,
        },
      ],
    },
    {
      label: 'Users',
      icon: IconUsers,
      path: ROUTES.USER_MANAGEMENT,
      roles: [UserRole.SUPER_ADMIN],
    },
    {
      label: 'API Tokens',
      icon: IconKey,
      path: ROUTES.PERSONAL_TOKENS,
      roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.USER],
    },
  ];

  const visibleItems = navItems.filter((item) => (user ? item.roles.includes(user.role) : false));

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      onMobileClose();
    }
  };

  return (
    <Stack gap="xs">
      {visibleItems.map((item) => (
        <NavLink
          key={item.path}
          label={item.label}
          leftSection={<item.icon size={20} stroke={1.5} />}
          active={location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)}
          onClick={() => handleNavClick(item.path)}
          variant="filled"
          childrenOffset={28}
        >
          {item.children?.map((child) => (
            <NavLink
              key={child.path}
              label={child.label}
              leftSection={<child.icon size={18} stroke={1.5} />}
              active={location.pathname === child.path}
              onClick={() => handleNavClick(child.path)}
            />
          ))}
        </NavLink>
      ))}
    </Stack>
  );
}
