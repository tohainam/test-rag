import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Loader, Stack, Text } from '@mantine/core';
import { useAuth } from '@/features/auth/model';
import { authApi } from '@/shared/api';
import { ROUTES } from '@/shared/config';
import { setAccessToken } from '@/shared/lib';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent infinite loop - only run once
    if (hasProcessed.current) {
      return;
    }
    hasProcessed.current = true;

    const handleCallback = async () => {
      const accessToken = searchParams.get('accessToken');

      if (!accessToken) {
        navigate(ROUTES.LOGIN);
        return;
      }

      try {
        // IMPORTANT: Store token in localStorage FIRST before making API calls
        // This ensures the axios interceptor can add Authorization header
        setAccessToken(accessToken);

        // Get user info with the access token (now interceptor will add Authorization header)
        const { user } = await authApi.getCurrentUser();

        // Set user data in auth context
        setAuthUser(
          {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
            avatar: user.avatar || undefined,
            role: user.role,
          },
          accessToken
        );

        // Redirect to dashboard
        navigate(ROUTES.DASHBOARD, { replace: true });
      } catch {
        navigate(ROUTES.LOGIN);
      }
    };

    void handleCallback();
  }, []); // Empty deps - only run once on mount

  return (
    <Container
      size="xs"
      style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text size="lg">Completing authentication...</Text>
      </Stack>
    </Container>
  );
}
