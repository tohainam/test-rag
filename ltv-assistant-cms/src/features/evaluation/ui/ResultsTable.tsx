/**
 * ResultsTable Component
 * Displays paginated evaluation results with filters and sorting
 */

import { useState } from 'react';
import { IconEye, IconFilter, IconFilterOff, IconSearch } from '@tabler/icons-react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import type { ResultFilterParams, ResultListItem } from '../types/evaluation.types';

interface ResultsTableProps {
  results: ResultListItem[];
  total: number;
  page: number;
  pages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onFilterChange: (filters: ResultFilterParams) => void;
  onViewDetail: (resultId: string) => void;
}

export const ResultsTable = ({
  results,
  total,
  page,
  pages,
  loading: _loading = false,
  onPageChange,
  onFilterChange,
  onViewDetail,
}: ResultsTableProps) => {
  const [search, setSearch] = useState('');
  const [minPrecision, setMinPrecision] = useState<number | undefined>();
  const [minRecall, setMinRecall] = useState<number | undefined>();
  const [minRelevancy, setMinRelevancy] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const handleApplyFilters = () => {
    onFilterChange({
      page: 1, // Reset to first page
      limit: 20,
      search: search || undefined,
      min_precision: minPrecision,
      min_recall: minRecall,
      min_relevancy: minRelevancy,
      sort_by: sortBy as any,
      sort_order: sortOrder as any,
    });
  };

  const handleClearFilters = () => {
    setSearch('');
    setMinPrecision(undefined);
    setMinRecall(undefined);
    setMinRelevancy(undefined);
    setSortBy('created_at');
    setSortOrder('asc');
    onFilterChange({
      page: 1,
      limit: 20,
    });
  };

  const getScoreBadge = (score: number | undefined | null) => {
    if (score === undefined || score === null) {
      return <Badge color="gray">N/A</Badge>;
    }

    const value = score.toFixed(3);
    let color = 'red';
    if (score > 0.8) {
      color = 'green';
    } else if (score > 0.6) {
      color = 'yellow';
    } else if (score > 0.4) {
      color = 'orange';
    }

    return <Badge color={color}>{value}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const color = status === 'completed' ? 'green' : 'red';
    return <Badge color={color}>{status}</Badge>;
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Text size="lg" fw={600}>
            Detailed Results
          </Text>
          <Group>
            <Button
              variant="light"
              size="sm"
              leftSection={showFilters ? <IconFilterOff size={16} /> : <IconFilter size={16} />}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </Group>
        </Group>

        {/* Filters */}
        {showFilters && (
          <Card bg="gray.0" p="md">
            <Stack gap="sm">
              <TextInput
                placeholder="Search in questions..."
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <Group grow>
                <NumberInput
                  label="Min Precision"
                  placeholder="0.0 - 1.0"
                  min={0}
                  max={1}
                  step={0.1}
                  value={minPrecision}
                  onChange={(val) => setMinPrecision(val as number | undefined)}
                />
                <NumberInput
                  label="Min Recall"
                  placeholder="0.0 - 1.0"
                  min={0}
                  max={1}
                  step={0.1}
                  value={minRecall}
                  onChange={(val) => setMinRecall(val as number | undefined)}
                />
                <NumberInput
                  label="Min Relevancy"
                  placeholder="0.0 - 1.0"
                  min={0}
                  max={1}
                  step={0.1}
                  value={minRelevancy}
                  onChange={(val) => setMinRelevancy(val as number | undefined)}
                />
              </Group>

              <Group grow>
                <Select
                  label="Sort By"
                  value={sortBy}
                  onChange={(val) => setSortBy(val || 'created_at')}
                  data={[
                    { value: 'context_precision', label: 'Precision' },
                    { value: 'context_recall', label: 'Recall' },
                    { value: 'context_relevancy', label: 'Relevancy' },
                    { value: 'created_at', label: 'Created Date' },
                  ]}
                />
                <Select
                  label="Sort Order"
                  value={sortOrder}
                  onChange={(val) => setSortOrder(val || 'asc')}
                  data={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                />
              </Group>

              <Group>
                <Button onClick={handleApplyFilters} leftSection={<IconFilter size={16} />}>
                  Apply Filters
                </Button>
                <Button variant="light" onClick={handleClearFilters}>
                  Clear All
                </Button>
              </Group>
            </Stack>
          </Card>
        )}

        {/* Results Info */}
        <Text size="sm" c="dimmed">
          Showing {results.length} of {total} results
        </Text>

        {/* Table */}
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Question</Table.Th>
                <Table.Th>Precision</Table.Th>
                <Table.Th>Recall</Table.Th>
                <Table.Th>Relevancy</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {results.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="xl">
                      No results found
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                results.map((result) => (
                  <Table.Tr key={result.result_id}>
                    <Table.Td>
                      <Text size="sm" lineClamp={2} maw={400}>
                        {result.question_text}
                      </Text>
                    </Table.Td>
                    <Table.Td>{getScoreBadge(result.context_precision)}</Table.Td>
                    <Table.Td>{getScoreBadge(result.context_recall)}</Table.Td>
                    <Table.Td>{getScoreBadge(result.context_relevancy)}</Table.Td>
                    <Table.Td>{getStatusBadge(result.status)}</Table.Td>
                    <Table.Td>
                      <Tooltip label="View Details">
                        <ActionIcon variant="light" onClick={() => onViewDetail(result.result_id)}>
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {/* Pagination */}
        {pages > 1 && (
          <Group justify="center">
            <Pagination total={pages} value={page} onChange={onPageChange} />
          </Group>
        )}
      </Stack>
    </Card>
  );
};
