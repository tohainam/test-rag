import { useMemo } from 'react';
import { IconClock, IconTrash } from '@tabler/icons-react';
import { format } from 'date-fns';
import { DataTable, DataTableColumn } from 'mantine-datatable';
import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core';
import { PersonalToken } from '../types';

interface PersonalTokensListProps {
  tokens: PersonalToken[];
  loading: boolean;
  onRevoke: (id: number) => void;
}

export function PersonalTokensList({ tokens, loading, onRevoke }: PersonalTokensListProps) {
  const columns = useMemo<DataTableColumn<PersonalToken>[]>(
    () => [
      {
        accessor: 'name',
        title: 'Name',
        width: 200,
        render: (token) => (
          <Group gap="xs">
            <Text fw={500}>{token.name}</Text>
            {token.isExpired && (
              <Badge color="red" size="sm">
                Expired
              </Badge>
            )}
          </Group>
        ),
      },
      {
        accessor: 'prefix',
        title: 'Token Prefix',
        width: 150,
        render: (token) => (
          <Text size="sm" c="dimmed" ff="monospace">
            {token.prefix}...
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
        render: (token) =>
          token.expiresAt ? (
            <Text size="sm" c={token.isExpired ? 'red' : undefined}>
              {format(new Date(token.expiresAt), 'MMM dd, yyyy HH:mm')}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Never
            </Text>
          ),
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
            <Tooltip label="Revoke token">
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
      noRecordsText="No personal access tokens found"
      striped
      highlightOnHover
      withTableBorder
    />
  );
}
