import { Container, Paper, Stack, Text, Title } from '@mantine/core';
import { UserManagementTable } from '@/features/user-management/ui';

export function UserManagementPage() {
  return (
    <Container fluid>
      <Stack gap="xl">
        <div>
          <Title order={2} mb="xs">
            User Management
          </Title>
          <Text size="sm" c="dimmed">
            Manage users, roles, and permissions
          </Text>
        </div>
        <Paper withBorder p="lg" radius="md">
          <UserManagementTable />
        </Paper>
      </Stack>
    </Container>
  );
}
