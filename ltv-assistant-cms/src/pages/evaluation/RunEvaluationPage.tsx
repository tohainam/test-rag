/**
 * Run Evaluation Page
 * Allows users to start evaluations and track progress in real-time
 */

import { useEffect, useState } from 'react';
import { IconAlertCircle, IconCheck, IconClock, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  NumberInput,
  Paper,
  Progress,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { ROUTES } from '@/shared/config';
import { useDatasetsList } from '../../features/evaluation/hooks/useDatasets';
import { useJobStatus, useStartEvaluation } from '../../features/evaluation/hooks/useEvaluation';

export const RunEvaluationPage = () => {
  const navigate = useNavigate();
  const { datasets, loading: loadingDatasets } = useDatasetsList();
  const { startEvaluation, loading: starting } = useStartEvaluation();

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [topK, setTopK] = useState<number>(5);
  const [jobId, setJobId] = useState<string | undefined>();
  const [runId, setRunId] = useState<string | undefined>();

  const { status } = useJobStatus(jobId, {
    pollInterval: 5000,
    enabled: !!jobId,
    stopOnComplete: true,
  });

  // Auto-navigate to dashboard when evaluation completes
  useEffect(() => {
    if (status?.status === 'completed' && runId) {
      setTimeout(() => {
        navigate(ROUTES.EVALUATION_DASHBOARD);
      }, 2000);
    }
  }, [status?.status, runId, navigate]);

  const handleStartEvaluation = async () => {
    if (!selectedDatasetId) {
      return;
    }

    try {
      const result = await startEvaluation({
        dataset_id: selectedDatasetId,
        top_k: topK,
        metadata: {
          source: 'manual',
          started_from: 'run_evaluation_page',
        },
      });

      setJobId(result.job_id);
      setRunId(result.run_id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to start evaluation:', error);
    }
  };

  const selectedDataset = datasets?.items.find((d) => d.dataset_id === selectedDatasetId);

  const getStatusColor = (statusValue: string) => {
    switch (statusValue) {
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'processing':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = (statusValue: string) => {
    switch (statusValue) {
      case 'completed':
        return <IconCheck size={16} />;
      case 'failed':
        return <IconX size={16} />;
      case 'processing':
        return <IconClock size={16} />;
      default:
        return <IconClock size={16} />;
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Title order={1}>Run Evaluation</Title>
          <Text c="dimmed" size="sm" mt="xs">
            Start a new evaluation run to test your retrieval system quality
          </Text>
        </div>

        {/* Configuration Form */}
        {!jobId && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Title order={3} size="h4">
                Evaluation Configuration
              </Title>

              <Select
                label="Dataset"
                description="Select the dataset with questions to evaluate"
                placeholder="Choose a dataset"
                data={
                  datasets?.items.map((dataset) => ({
                    value: dataset.dataset_id,
                    label: `${dataset.name} (${dataset.total_questions || 0} questions, ${dataset.file_count || 0} files)`,
                  })) || []
                }
                value={selectedDatasetId}
                onChange={setSelectedDatasetId}
                searchable
                disabled={loadingDatasets || !!jobId}
                required
              />

              {selectedDataset && (
                <Paper p="sm" bg="blue.0" radius="sm">
                  <Stack gap="xs">
                    <Text size="sm" fw={500}>
                      {selectedDataset.name}
                    </Text>
                    {selectedDataset.description && (
                      <Text size="xs" c="dimmed">
                        {selectedDataset.description}
                      </Text>
                    )}
                    <Group gap="md">
                      <Text size="xs" c="dimmed">
                        Questions: {selectedDataset.total_questions || 0}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Files: {selectedDataset.file_count || 0}
                      </Text>
                      <Badge size="xs" color="blue">
                        {selectedDataset.source.toUpperCase()}
                      </Badge>
                    </Group>
                  </Stack>
                </Paper>
              )}

              <NumberInput
                label="Top K"
                description="Number of context chunks to retrieve per question"
                placeholder="Enter a number"
                value={topK}
                onChange={(val) => setTopK(val as number)}
                min={1}
                max={20}
                disabled={!!jobId}
                required
              />

              <Divider />

              <Button
                size="md"
                leftSection={<IconPlayerPlay size={18} />}
                onClick={handleStartEvaluation}
                loading={starting}
                disabled={!selectedDatasetId || !!jobId}
                fullWidth
              >
                Start Evaluation
              </Button>
            </Stack>
          </Card>
        )}

        {/* Progress Tracking */}
        {jobId && status && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Title order={3} size="h4">
                    Evaluation Progress
                  </Title>
                  <Text size="sm" c="dimmed" mt="xs">
                    Job ID: {jobId.slice(0, 8)}...
                  </Text>
                </div>

                <Badge
                  size="lg"
                  color={getStatusColor(status.status)}
                  leftSection={getStatusIcon(status.status)}
                >
                  {status.status.toUpperCase()}
                </Badge>
              </Group>

              {status.status === 'processing' && (
                <>
                  <div>
                    <Group justify="space-between" mb="xs">
                      <Text size="sm" fw={500}>
                        {status.current_step || 'Processing...'}
                      </Text>
                      <Text size="sm" fw={500}>
                        {status.progress_percent?.toFixed(1)}%
                      </Text>
                    </Group>
                    <Progress
                      value={status.progress_percent || 0}
                      color="blue"
                      size="lg"
                      radius="xl"
                      animated
                    />
                  </div>

                  <Group grow>
                    <Paper p="sm" bg="blue.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Completed
                        </Text>
                        <Text size="lg" fw={700} c="blue">
                          {status.completed_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>

                    <Paper p="sm" bg="gray.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Total
                        </Text>
                        <Text size="lg" fw={700}>
                          {status.total_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>

                    <Paper p="sm" bg="red.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Failed
                        </Text>
                        <Text size="lg" fw={700} c="red">
                          {status.failed_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>
                  </Group>

                  <Alert color="blue" title="Processing" icon={<IconClock size={16} />}>
                    The evaluation is running in the background. Questions are being tested
                    sequentially. This may take several minutes depending on the dataset size.
                  </Alert>
                </>
              )}

              {status.status === 'completed' && (
                <>
                  <Alert color="green" title="Evaluation Complete!" icon={<IconCheck size={16} />}>
                    The evaluation has completed successfully. You will be redirected to the
                    dashboard shortly.
                  </Alert>

                  <Group grow>
                    <Paper p="sm" bg="green.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Total Questions
                        </Text>
                        <Text size="lg" fw={700} c="green">
                          {status.total_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>

                    <Paper p="sm" bg="blue.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Completed
                        </Text>
                        <Text size="lg" fw={700} c="blue">
                          {status.completed_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>

                    <Paper p="sm" bg="red.0" radius="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Failed
                        </Text>
                        <Text size="lg" fw={700} c="red">
                          {status.failed_questions || 0}
                        </Text>
                      </Stack>
                    </Paper>
                  </Group>

                  <Button size="md" onClick={() => navigate(ROUTES.EVALUATION_DASHBOARD)} fullWidth>
                    View Results Dashboard
                  </Button>
                </>
              )}

              {status.status === 'failed' && (
                <>
                  <Alert color="red" title="Evaluation Failed" icon={<IconAlertCircle size={16} />}>
                    {status.error_message || 'The evaluation failed due to an error.'}
                  </Alert>

                  <Button variant="light" onClick={() => window.location.reload()} fullWidth>
                    Try Again
                  </Button>
                </>
              )}
            </Stack>
          </Card>
        )}

        {/* Info Card */}
        {!jobId && (
          <Card shadow="sm" padding="md" radius="md" bg="gray.0">
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                About Evaluation
              </Text>
              <Text size="xs" c="dimmed">
                The evaluation process tests each question in your dataset against the retrieval
                system. It measures:
              </Text>
              <Stack gap={4} ml="md">
                <Text size="xs" c="dimmed">
                  • <strong>Context Precision</strong>: Quality of retrieved context ranking
                </Text>
                <Text size="xs" c="dimmed">
                  • <strong>Context Recall</strong>: Completeness of retrieved context
                </Text>
                <Text size="xs" c="dimmed">
                  • <strong>Context Relevancy</strong>: Relevance to the query
                </Text>
              </Stack>
              <Text size="xs" c="dimmed" mt="xs">
                Questions are processed sequentially, one at a time, to ensure accurate results.
              </Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
};
