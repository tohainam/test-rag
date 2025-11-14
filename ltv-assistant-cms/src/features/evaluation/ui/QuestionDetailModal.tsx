/**
 * QuestionDetailModal Component
 * Displays complete question details with contexts and scores
 */

import { IconAlertCircle } from '@tabler/icons-react';
import {
  Accordion,
  Alert,
  Badge,
  Card,
  Group,
  LoadingOverlay,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import type { ResultDetailResponse } from '../types/evaluation.types';

interface QuestionDetailModalProps {
  opened: boolean;
  onClose: () => void;
  result: ResultDetailResponse | null;
  loading?: boolean;
  error?: Error | null;
}

export const QuestionDetailModal = ({
  opened,
  onClose,
  result,
  loading = false,
  error = null,
}: QuestionDetailModalProps) => {
  const getScoreBadge = (score: number | undefined | null, label: string) => {
    if (score === undefined || score === null) {
      return (
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {label}:
          </Text>
          <Badge color="gray">N/A</Badge>
        </Group>
      );
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

    return (
      <Group gap="xs">
        <Text size="sm" fw={500}>
          {label}:
        </Text>
        <Badge color={color} size="lg">
          {value}
        </Badge>
      </Group>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="lg" fw={600}>
          Question Details
        </Text>
      }
      size="xl"
      padding="lg"
    >
      <LoadingOverlay visible={loading} />

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" mb="md">
          {error.message || 'Failed to load question details'}
        </Alert>
      )}

      {result && !error && (
        <Stack gap="lg">
          {/* Status */}
          <Group>
            <Badge color={result.status === 'completed' ? 'green' : 'red'} size="lg">
              {result.status}
            </Badge>
            {result.error_message && (
              <Badge color="red" variant="light">
                Error
              </Badge>
            )}
          </Group>

          {/* Question */}
          <Card bg="blue.0" p="md">
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Question
              </Text>
              <Text size="sm">{result.question_text}</Text>
            </Stack>
          </Card>

          {/* Expected Context */}
          <Card bg="green.0" p="md">
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Expected Context (Ground Truth)
              </Text>
              <Text size="sm">{result.expected_context}</Text>
            </Stack>
          </Card>

          {/* RAGAS Scores */}
          <Card withBorder p="md">
            <Stack gap="md">
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                RAGAS Evaluation Scores
              </Text>
              <Group>
                {getScoreBadge(result.context_precision, 'Context Precision')}
                {getScoreBadge(result.context_recall, 'Context Recall')}
                {getScoreBadge(result.context_relevancy, 'Context Relevancy')}
              </Group>
            </Stack>
          </Card>

          {/* Retrieved Contexts */}
          <Card withBorder p="md">
            <Stack gap="sm">
              <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                Retrieved Contexts ({result.retrieved_contexts.length})
              </Text>

              {result.retrieved_contexts.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No contexts retrieved
                </Text>
              ) : (
                <Accordion variant="separated">
                  {result.retrieved_contexts.map((context, index) => (
                    <Accordion.Item key={index} value={`context-${index}`}>
                      <Accordion.Control>
                        <Text size="sm" fw={500}>
                          Context {index + 1}
                        </Text>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                          {context}
                        </Text>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              )}
            </Stack>
          </Card>

          {/* Metadata */}
          {result.metadata && Object.keys(result.metadata).length > 0 && (
            <Card withBorder p="md">
              <Stack gap="sm">
                <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                  Metadata
                </Text>
                <Stack gap="xs">
                  {result.metadata.retrieval_time_ms !== undefined && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        Retrieval Time:
                      </Text>
                      <Text size="sm" fw={500}>
                        {result.metadata.retrieval_time_ms}ms
                      </Text>
                    </Group>
                  )}
                  {result.metadata.evaluation_time_ms !== undefined && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        Evaluation Time:
                      </Text>
                      <Text size="sm" fw={500}>
                        {result.metadata.evaluation_time_ms}ms
                      </Text>
                    </Group>
                  )}
                  {result.metadata.cache_hit !== undefined && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        Cache Hit:
                      </Text>
                      <Badge color={result.metadata.cache_hit ? 'green' : 'gray'} size="sm">
                        {result.metadata.cache_hit ? 'Yes' : 'No'}
                      </Badge>
                    </Group>
                  )}
                  {result.metadata.top_k !== undefined && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        Top K:
                      </Text>
                      <Text size="sm" fw={500}>
                        {result.metadata.top_k}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Stack>
            </Card>
          )}

          {/* Error Message */}
          {result.error_message && (
            <Alert icon={<IconAlertCircle size={16} />} title="Error Details" color="red">
              {result.error_message}
            </Alert>
          )}

          {/* Timestamps */}
          <Text size="xs" c="dimmed">
            Created: {new Date(result.created_at).toLocaleString()}
          </Text>
        </Stack>
      )}
    </Modal>
  );
};
