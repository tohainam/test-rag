import { IconFiles, IconKey, IconUsers } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { UserRole } from '@/entities/user/model';
import { useAuth } from '@/features/auth/model';
import { ROUTES } from '@/shared/config';

interface QuickAction {
  title: string;
  description: string;
  icon: typeof IconFiles;
  color: string;
  route: string;
  allowedRoles?: UserRole[];
}

const quickActions: QuickAction[] = [
  {
    title: 'Documents',
    description: 'Manage your documents, upload files, and control access',
    icon: IconFiles,
    color: 'blue',
    route: '/documents',
    allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
  },
  {
    title: 'API Tokens',
    description: 'Create and manage your personal API access tokens',
    icon: IconKey,
    color: 'teal',
    route: ROUTES.PERSONAL_TOKENS,
  },
  {
    title: 'User Management',
    description: 'Manage users, roles, and permissions',
    icon: IconUsers,
    color: 'violet',
    route: ROUTES.USER_MANAGEMENT,
    allowedRoles: [UserRole.SUPER_ADMIN],
  },
];

export function DashboardContent() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const availableActions = quickActions.filter((action) => {
    if (!action.allowedRoles) {
      return true;
    }
    return user?.role && action.allowedRoles.includes(user.role);
  });

  return (
    <Container fluid>
      <Stack gap="xl">
        <div>
          <Title order={1}>Welcome back{user?.name ? `, ${user.name}` : ''}!</Title>
          <Text c="dimmed" size="sm" mt="xs">
            Here are your quick actions to get started
          </Text>
        </div>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {availableActions.map((action) => (
            <Paper
              key={action.title}
              withBorder
              shadow="0"
              p="xl"
              radius="md"
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
              onClick={() => navigate(action.route)}
            >
              <Stack gap="md">
                <ThemeIcon size="xl" radius="md" variant="light" color={action.color}>
                  <action.icon size={28} />
                </ThemeIcon>

                <div>
                  <Text fw={600} size="lg" mb="xs">
                    {action.title}
                  </Text>
                  <Text size="sm" c="dimmed" lineClamp={2}>
                    {action.description}
                  </Text>
                </div>

                <Group justify="flex-end" mt="auto">
                  <Button
                    variant="subtle"
                    color={action.color}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(action.route);
                    }}
                  >
                    Go to {action.title}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
