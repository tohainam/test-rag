import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Container, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { refreshTokensApi } from '@/features/refresh-tokens/api';
import { RefreshToken } from '@/features/refresh-tokens/types';
import { RefreshTokensList, RevokeSessionModal } from '@/features/refresh-tokens/ui';
import { getErrorMessage } from '@/shared/types';
import { PageBreadcrumbs } from '@/shared/ui';

export function UserSessionsAdminPage() {
  const { userId } = useParams<{ userId: string }>();
  const [tokens, setTokens] = useState<RefreshToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokeModalOpened, setRevokeModalOpened] = useState(false);
  const [tokenToRevoke, setTokenToRevoke] = useState<RefreshToken | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadTokens = async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    try {
      const data = await refreshTokensApi.listUserRefreshTokens(parseInt(userId, 10));
      setTokens(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load user sessions',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, [userId]);

  const handleRevokeClick = (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId);
    if (token) {
      setTokenToRevoke(token);
      setRevokeModalOpened(true);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!tokenToRevoke) {
      return;
    }

    setActionLoading(true);
    try {
      await refreshTokensApi.revokeRefreshToken(tokenToRevoke.id);
      setRevokeModalOpened(false);
      setTokenToRevoke(null);
      await loadTokens();
      notifications.show({
        title: 'Success',
        message: 'Session revoked successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to revoke session',
        color: 'red',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const activeSessionCount = tokens.filter((t) => new Date(t.expiresAt) > new Date()).length;

  return (
    <Container fluid>
      <PageBreadcrumbs
        items={[{ label: 'User Management', href: '/users' }, { label: 'User Sessions' }]}
      />

      <Stack gap="xl">
        <div>
          <Title order={2} mb="xs">
            Manage User Sessions
          </Title>
          <Text size="sm" c="dimmed">
            Active sessions for user ID: {userId} ({activeSessionCount} active)
          </Text>
        </div>

        <Paper p="lg" withBorder radius="md">
          <RefreshTokensList tokens={tokens} loading={loading} onRevoke={handleRevokeClick} />
        </Paper>
      </Stack>

      <RevokeSessionModal
        opened={revokeModalOpened}
        onClose={() => {
          setRevokeModalOpened(false);
          setTokenToRevoke(null);
        }}
        onConfirm={handleRevokeConfirm}
        token={tokenToRevoke}
        loading={actionLoading}
      />
    </Container>
  );
}
