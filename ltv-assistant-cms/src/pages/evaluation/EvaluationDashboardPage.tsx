/**
 * Evaluation Dashboard Page
 * Auto-loads latest evaluation run and displays comprehensive metrics and results
 */

import { useEffect, useState } from 'react';
import { IconAlertCircle, IconDownload, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Center,
  Container,
  Grid,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { ROUTES } from '@/shared/config';
import {
  useExportResults,
  useLatestRun,
  useResultDetail,
  useRunOverview,
  useRunResults,
} from '../../features/evaluation/hooks/useDashboard';
import { MetricsCard } from '../../features/evaluation/ui/MetricsCard';
import { QuestionDetailModal } from '../../features/evaluation/ui/QuestionDetailModal';
import { ResultsTable } from '../../features/evaluation/ui/ResultsTable';

export const EvaluationDashboardPage = () => {
  const navigate = useNavigate();
  const {
    latestRun,
    loading: loadingLatest,
    error: errorLatest,
    refetch: refetchLatest,
  } = useLatestRun(true);
  const [currentRunId, setCurrentRunId] = useState<string | undefined>();
  const [selectedResultId, setSelectedResultId] = useState<string | undefined>();
  const [modalOpened, setModalOpened] = useState(false);

  const { overview, loading: loadingOverview } = useRunOverview(currentRunId);
  const {
    results,
    loading: loadingResults,
    params,
    updateParams,
  } = useRunResults(currentRunId, { page: 1, limit: 20 });
  const { exportResults, exporting } = useExportResults();
  const { result: selectedResult, loading: loadingResult } = useResultDetail(selectedResultId);

  // Set current run when latest run loads
  useEffect(() => {
    if (latestRun?.run_id) {
      setCurrentRunId(latestRun.run_id);
    }
  }, [latestRun]);

  const handleExportCSV = () => {
    if (currentRunId) {
      exportResults(currentRunId, { format: 'csv', type: 'detailed' });
    }
  };

  const handleExportJSON = () => {
    if (currentRunId) {
      exportResults(currentRunId, { format: 'json', type: 'summary' });
    }
  };

  // Loading state
  if (loadingLatest) {
    return (
      <Center h={400}>
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading latest evaluation...</Text>
        </Stack>
      </Center>
    );
  }

  // Error state
  if (errorLatest) {
    return (
      <Container size="lg" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="md">
          {errorLatest.message || 'Failed to load latest evaluation'}
        </Alert>
        <Button onClick={() => refetchLatest()} leftSection={<IconRefresh size={16} />}>
          Try Again
        </Button>
      </Container>
    );
  }

  // Empty state - no runs yet
  if (!latestRun) {
    return (
      <Container size="lg" py="xl">
        <Card shadow="sm" padding="xl" radius="md" withBorder>
          <Stack align="center" gap="md">
            <Title order={3}>No Evaluations Yet</Title>
            <Text c="dimmed" ta="center">
              No evaluation runs found. Create a dataset and run an evaluation to see results here.
            </Text>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => navigate(ROUTES.EVALUATION_RUN)}
              variant="filled"
            >
              Run Evaluation
            </Button>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Title order={1}>Evaluation Dashboard</Title>
            <Text c="dimmed" size="sm">
              Dataset: {latestRun.dataset_name || 'N/A'} • Run ID:{' '}
              {latestRun.run_id ? `${latestRun.run_id.slice(0, 8)}...` : 'N/A'}
            </Text>
            <Text c="dimmed" size="xs">
              Completed: {new Date(latestRun.completed_at || latestRun.created_at).toLocaleString()}
            </Text>
          </Stack>

          <Group>
            <Button
              variant="filled"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => navigate(ROUTES.EVALUATION_RUN)}
            >
              New Evaluation
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleExportCSV}
              loading={exporting}
            >
              Export CSV
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleExportJSON}
              loading={exporting}
            >
              Export JSON
            </Button>
            <Button
              variant="outline"
              leftSection={<IconRefresh size={16} />}
              onClick={() => refetchLatest()}
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {/* Metrics Overview */}
        {loadingOverview ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : overview ? (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <MetricsCard
              title="Context Precision"
              value={overview.avg_context_precision}
              showProgress
              progressValue={overview.avg_context_precision}
              color="blue"
              badge={
                overview.avg_context_precision > 0.8
                  ? 'Excellent'
                  : overview.avg_context_precision > 0.6
                    ? 'Good'
                    : 'Needs Improvement'
              }
              badgeColor={
                overview.avg_context_precision > 0.8
                  ? 'green'
                  : overview.avg_context_precision > 0.6
                    ? 'yellow'
                    : 'red'
              }
            />

            <MetricsCard
              title="Context Recall"
              value={overview.avg_context_recall}
              showProgress
              progressValue={overview.avg_context_recall}
              color="teal"
              badge={
                overview.avg_context_recall > 0.8
                  ? 'Excellent'
                  : overview.avg_context_recall > 0.6
                    ? 'Good'
                    : 'Needs Improvement'
              }
              badgeColor={
                overview.avg_context_recall > 0.8
                  ? 'green'
                  : overview.avg_context_recall > 0.6
                    ? 'yellow'
                    : 'red'
              }
            />

            <MetricsCard
              title="Context Relevancy"
              value={overview.avg_context_relevancy}
              showProgress
              progressValue={overview.avg_context_relevancy}
              color="violet"
              badge={
                overview.avg_context_relevancy > 0.8
                  ? 'Excellent'
                  : overview.avg_context_relevancy > 0.6
                    ? 'Good'
                    : 'Needs Improvement'
              }
              badgeColor={
                overview.avg_context_relevancy > 0.8
                  ? 'green'
                  : overview.avg_context_relevancy > 0.6
                    ? 'yellow'
                    : 'red'
              }
            />

            <MetricsCard
              title="Overall Score"
              value={overview.overall_score}
              subtitle={`${overview.success_rate.toFixed(1)}% success rate`}
              color="indigo"
              badge={
                overview.overall_score > 0.8
                  ? 'Excellent'
                  : overview.overall_score > 0.6
                    ? 'Good'
                    : 'Fair'
              }
              badgeColor={
                overview.overall_score > 0.8
                  ? 'green'
                  : overview.overall_score > 0.6
                    ? 'yellow'
                    : 'orange'
              }
            />
          </SimpleGrid>
        ) : null}

        {/* Statistics Summary */}
        {overview && (
          <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="sm" c="dimmed" fw={500}>
                    Questions
                  </Text>
                  <Text size="xl" fw={700}>
                    {overview.total_questions}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {overview.completed_questions} completed • {overview.failed_questions} failed
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="sm" c="dimmed" fw={500}>
                    Processing Time
                  </Text>
                  <Text size="xl" fw={700}>
                    {overview.processing_time_ms
                      ? `${(overview.processing_time_ms / 1000 / 60).toFixed(1)}m`
                      : 'N/A'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {overview.avg_time_per_question_ms
                      ? `${(overview.avg_time_per_question_ms / 1000).toFixed(1)}s per question`
                      : ''}
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="xs">
                  <Text size="sm" c="dimmed" fw={500}>
                    Success Rate
                  </Text>
                  <Text
                    size="xl"
                    fw={700}
                    c={
                      overview.success_rate > 90
                        ? 'green'
                        : overview.success_rate > 70
                          ? 'yellow'
                          : 'red'
                    }
                  >
                    {overview.success_rate.toFixed(1)}%
                  </Text>
                  <Text size="xs" c="dimmed">
                    {overview.completed_questions} / {overview.total_questions} questions
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        )}

        {/* Results Table */}
        {results && (
          <ResultsTable
            results={results.items}
            total={results.total}
            page={params?.page || 1}
            pages={results.pages}
            loading={loadingResults}
            onPageChange={(newPage) => updateParams({ ...params, page: newPage })}
            onFilterChange={(filters) => updateParams(filters)}
            onViewDetail={(resultId) => {
              setSelectedResultId(resultId);
              setModalOpened(true);
            }}
          />
        )}

        {/* Question Detail Modal */}
        <QuestionDetailModal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedResultId(undefined);
          }}
          result={selectedResult}
          loading={loadingResult}
        />
      </Stack>
    </Container>
  );
};
