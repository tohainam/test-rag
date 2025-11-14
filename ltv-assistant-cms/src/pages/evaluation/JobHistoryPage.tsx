/**
 * Job History Page
 * View evaluation job history and status
 */

import { useState } from 'react';
import { IconEye, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { ROUTES } from '@/shared/config';
import { useJobsList } from '../../features/evaluation/hooks/useEvaluation';

export const JobHistoryPage = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const { jobs, loading, params, updateParams, refetch } = useJobsList({
    page: 1,
    limit: 20,
    status: statusFilter || undefined,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'processing':
        return 'blue';
      case 'pending':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const formatDuration = (startDate?: string, endDate?: string) => {
    if (!startDate || !endDate) {
      return 'N/A';
    }
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 1000 / 60);
    const seconds = Math.floor((durationMs / 1000) % 60);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Job History</Title>
            <Text c="dimmed" size="sm" mt="xs">
              View all evaluation jobs and their status
            </Text>
          </div>

          <Button leftSection={<IconRefresh size={16} />} onClick={() => refetch()}>
            Refresh
          </Button>
        </Group>

        {/* Filters */}
        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Group>
            <Select
              label="Filter by Status"
              placeholder="All statuses"
              data={[
                { value: 'pending', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'completed', label: 'Completed' },
                { value: 'failed', label: 'Failed' },
              ]}
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                updateParams({ ...params, status: value || undefined });
              }}
              clearable
            />
          </Group>
        </Card>

        {/* Jobs Table */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="lg" fw={600}>
                Evaluation Jobs
              </Text>
              <Text size="sm" c="dimmed">
                {jobs?.total || 0} jobs total
              </Text>
            </Group>

            <Table.ScrollContainer minWidth={1000}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Job ID</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Phase</Table.Th>
                    <Table.Th>Progress</Table.Th>
                    <Table.Th>Duration</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="xl">
                          Loading jobs...
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : jobs?.items.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="xl">
                          No jobs found
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    jobs?.items.map((job) => (
                      <Table.Tr key={job.job_id}>
                        <Table.Td>
                          <Text size="xs" ff="monospace">
                            {job.job_id.slice(0, 8)}...
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getStatusColor(job.status)}>
                            {job.status.toUpperCase()}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {job.phase || 'N/A'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Text size="sm">
                              {job.progress_percent !== null && job.progress_percent !== undefined
                                ? `${job.progress_percent.toFixed(0)}%`
                                : 'N/A'}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatDuration(job.started_at, job.completed_at)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(job.created_at).toLocaleString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {job.status === 'completed' && (
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconEye size={14} />}
                              onClick={() => navigate(ROUTES.EVALUATION_DASHBOARD)}
                            >
                              View Results
                            </Button>
                          )}
                          {job.status === 'failed' && job.error_message && (
                            <Tooltip label={job.error_message}>
                              <Badge color="red" variant="light" style={{ cursor: 'help' }}>
                                Error
                              </Badge>
                            </Tooltip>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {/* Pagination */}
            {jobs && jobs.pages > 1 && (
              <Group justify="center">
                <Button
                  variant="light"
                  onClick={() => updateParams({ ...params, page: (params?.page || 1) - 1 })}
                  disabled={params?.page === 1}
                >
                  Previous
                </Button>
                <Text size="sm">
                  Page {params?.page || 1} of {jobs.pages}
                </Text>
                <Button
                  variant="light"
                  onClick={() => updateParams({ ...params, page: (params?.page || 1) + 1 })}
                  disabled={params?.page === jobs.pages}
                >
                  Next
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
