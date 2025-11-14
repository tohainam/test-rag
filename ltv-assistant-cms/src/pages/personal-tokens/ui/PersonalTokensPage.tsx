import { useEffect, useState } from 'react';
import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { personalTokensApi } from '@/features/personal-tokens/api';
import { CreateTokenDto, PersonalToken } from '@/features/personal-tokens/types';
import {
  CreateTokenModal,
  PersonalTokensList,
  RevokeTokenModal,
  TokenCreatedModal,
} from '@/features/personal-tokens/ui';
import { getErrorMessage } from '@/shared/types';

export function PersonalTokensPage() {
  const [tokens, setTokens] = useState<PersonalToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [tokenCreatedModalOpened, setTokenCreatedModalOpened] = useState(false);
  const [revokeModalOpened, setRevokeModalOpened] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<PersonalToken | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const data = await personalTokensApi.listTokens();
      setTokens(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load personal access tokens',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleCreateToken = async (dto: CreateTokenDto) => {
    setActionLoading(true);
    try {
      const response = await personalTokensApi.createToken(dto);
      setCreatedToken(response.token);
      setCreateModalOpened(false);
      setTokenCreatedModalOpened(true);
      await loadTokens();
      notifications.show({
        title: 'Success',
        message: 'Personal access token created successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to create token',
        color: 'red',
      });
    } finally {
      setActionLoading(false);
    }
  };

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
      await personalTokensApi.revokeToken(tokenToRevoke.id);
      setRevokeModalOpened(false);
      setTokenToRevoke(null);
      await loadTokens();
      notifications.show({
        title: 'Success',
        message: 'Token revoked successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to revoke token',
        color: 'red',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const activeTokenCount = tokens.filter((t) => !t.isExpired).length;
  const maxTokensReached = activeTokenCount >= 10;

  return (
    <Container fluid>
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} mb="xs">
              Personal Access Tokens
            </Title>
            <Text size="sm" c="dimmed">
              Manage your API tokens for accessing the platform programmatically
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateModalOpened(true)}
            disabled={maxTokensReached}
          >
            Create Token
          </Button>
        </Group>

        {maxTokensReached && (
          <Alert icon={<IconAlertCircle size={16} />} title="Token Limit Reached" color="yellow">
            You have reached the maximum limit of 10 active tokens. Please revoke an existing token
            before creating a new one.
          </Alert>
        )}

        <Paper p="lg" withBorder radius="md">
          <PersonalTokensList tokens={tokens} loading={loading} onRevoke={handleRevokeClick} />
        </Paper>
      </Stack>

      <CreateTokenModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        onSubmit={handleCreateToken}
        loading={actionLoading}
      />

      <TokenCreatedModal
        opened={tokenCreatedModalOpened}
        onClose={() => {
          setTokenCreatedModalOpened(false);
          setCreatedToken(null);
        }}
        token={createdToken}
      />

      <RevokeTokenModal
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
