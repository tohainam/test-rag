import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Container, Loader, Stack, Text } from '@mantine/core';
import { UserRole } from '@/entities/user/model';
import { useAuth } from '@/features/auth/model';
import { ROUTES } from '@/shared/config';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <Container
        size="xs"
        style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Stack align="center" gap="md">
          <Loader size="lg" />
        </Stack>
      </Container>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <Container
        size="xs"
        style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Stack align="center" gap="md">
          <Text size="xl" fw={700}>
            Access Denied
          </Text>
          <Text c="dimmed">You don't have permission to access this page.</Text>
        </Stack>
      </Container>
    );
  }

  return <>{children}</>;
}
