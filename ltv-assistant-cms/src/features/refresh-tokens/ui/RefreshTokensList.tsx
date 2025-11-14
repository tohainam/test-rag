import { useMemo } from 'react';
import { IconClock, IconDevices, IconTrash } from '@tabler/icons-react';
import { format } from 'date-fns';
import { DataTable, DataTableColumn } from 'mantine-datatable';
import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core';
import { RefreshToken } from '../types';

interface RefreshTokensListProps {
  tokens: RefreshToken[];
  loading: boolean;
  onRevoke: (id: number) => void;
}

// Helper function to parse user agent
const parseUserAgent = (userAgent: string | null): string => {
  if (!userAgent) {
    return 'Unknown Device';
  }

  // Simple user agent parsing
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    return 'Chrome';
  } else if (userAgent.includes('Edg')) {
    return 'Edge';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  } else if (userAgent.includes('Firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('OPR') || userAgent.includes('Opera')) {
    return 'Opera';
  }

  // Check for mobile
  if (userAgent.includes('Mobile')) {
    return 'Mobile Browser';
  }

  return 'Unknown Browser';
};

// Helper function to get device type
const getDeviceType = (userAgent: string | null): string => {
  if (!userAgent) {
    return 'Unknown';
  }

  if (userAgent.includes('Windows')) {
    return 'Windows';
  } else if (userAgent.includes('Mac')) {
    return 'macOS';
  } else if (userAgent.includes('Linux')) {
    return 'Linux';
  } else if (userAgent.includes('Android')) {
    return 'Android';
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    return 'iOS';
  }

  return 'Unknown OS';
};

export function RefreshTokensList({ tokens, loading, onRevoke }: RefreshTokensListProps) {
  const columns = useMemo<DataTableColumn<RefreshToken>[]>(
    () => [
      {
        accessor: 'device',
        title: 'Device / Browser',
        width: 220,
        render: (token) => {
          const browser = parseUserAgent(token.userAgent);
          const device = getDeviceType(token.userAgent);

          return (
            <Group gap="xs">
              <IconDevices size={16} />
              <div>
                <Text size="sm" fw={500}>
                  {browser}
                </Text>
                <Text size="xs" c="dimmed">
                  {device}
                </Text>
              </div>
            </Group>
          );
        },
      },
      {
        accessor: 'ipAddress',
        title: 'IP Address',
        width: 150,
        render: (token) => (
          <Text size="sm" ff="monospace">
            {token.ipAddress || 'N/A'}
          </Text>
        ),
      },
      {
        accessor: 'lastUsedAt',
        title: 'Last Used',
        width: 180,
        render: (token) =>
          token.lastUsedAt ? (
            <Group gap="xs">
              <IconClock size={14} />
              <Text size="sm">{format(new Date(token.lastUsedAt), 'MMM dd, yyyy HH:mm')}</Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Never
            </Text>
          ),
      },
      {
        accessor: 'expiresAt',
        title: 'Expires',
        width: 180,
        render: (token) => {
          const isExpired = new Date(token.expiresAt) < new Date();
          return (
            <Group gap="xs">
              {isExpired && (
                <Badge color="red" size="sm">
                  Expired
                </Badge>
              )}
              <Text size="sm" c={isExpired ? 'red' : undefined}>
                {format(new Date(token.expiresAt), 'MMM dd, yyyy HH:mm')}
              </Text>
            </Group>
          );
        },
      },
      {
        accessor: 'createdAt',
        title: 'Created',
        width: 180,
        render: (token) => (
          <Text size="sm">{format(new Date(token.createdAt), 'MMM dd, yyyy HH:mm')}</Text>
        ),
      },
      {
        accessor: 'actions',
        title: 'Actions',
        width: 80,
        textAlign: 'center',
        render: (token) => (
          <Group gap="xs" justify="center">
            <Tooltip label="Revoke session">
              <ActionIcon color="red" variant="subtle" onClick={() => onRevoke(token.id)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
      },
    ],
    [onRevoke]
  );

  return (
    <DataTable
      columns={columns}
      records={tokens}
      fetching={loading}
      minHeight={180}
      noRecordsText="No active sessions found"
      striped
      highlightOnHover
    />
  );
}
