/**
 * Dataset Questions Page
 * Manage questions within a dataset
 */

import { useEffect, useState } from 'react';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconEdit,
  IconFileText,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Progress,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDatasetDetail } from '../../features/evaluation/hooks/useDatasets';
import {
  useActiveGenerationJob,
  useGenerationJobStatus,
  useTriggerGeneration,
} from '../../features/evaluation/hooks/useQuestionGeneration';
import {
  useQuestionDelete,
  useQuestionsBulkAdd,
  useQuestionUpdate,
} from '../../features/evaluation/hooks/useQuestions';
import type { QuestionInput } from '../../features/evaluation/types/evaluation.types';

export const DatasetQuestionsPage = () => {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const { dataset, loading: loadingDataset, refetch } = useDatasetDetail(datasetId);
  const { bulkAdd, adding } = useQuestionsBulkAdd();
  const { updateQuestion, updating } = useQuestionUpdate();
  const { deleteQuestion, deleting } = useQuestionDelete();

  // Generation hooks
  const { activeJob, refetch: refetchActiveJob } = useActiveGenerationJob(datasetId || null);
  const { job: generationJob, isPolling } = useGenerationJobStatus(activeJob?.job_id || null, {
    enabled: !!activeJob,
    stopOnComplete: true,
  });
  const { triggerGeneration, loading: triggeringGeneration } = useTriggerGeneration();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    question: '',
    expected_context: '',
  });
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    if (!datasetId) {
      navigate('/evaluation/datasets');
    }
  }, [datasetId, navigate]);

  const handleAddQuestion = async () => {
    if (!datasetId) {
      return;
    }

    try {
      const questions: QuestionInput[] = [
        {
          question: formData.question,
          expected_context: formData.expected_context,
        },
      ];

      await bulkAdd(datasetId, questions);
      setAddModalOpen(false);
      setFormData({ question: '', expected_context: '' });
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Add question failed:', error);
    }
  };

  const handleEditQuestion = async () => {
    if (!selectedQuestionId) {
      return;
    }

    try {
      await updateQuestion(selectedQuestionId, {
        question: formData.question,
        expected_context: formData.expected_context,
      });
      setEditModalOpen(false);
      setSelectedQuestionId(null);
      setFormData({ question: '', expected_context: '' });
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Update question failed:', error);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!selectedQuestionId) {
      return;
    }

    try {
      await deleteQuestion(selectedQuestionId);
      setDeleteModalOpen(false);
      setSelectedQuestionId(null);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Delete question failed:', error);
    }
  };

  const openEditModal = (question: {
    question_id: string;
    question: string;
    expected_context: string;
  }) => {
    setSelectedQuestionId(question.question_id);
    setFormData({
      question: question.question,
      expected_context: question.expected_context,
    });
    setEditModalOpen(true);
  };

  const openDeleteModal = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setDeleteModalOpen(true);
  };

  const handleRegenerateQuestions = async () => {
    if (!datasetId) {
      return;
    }

    try {
      const response = await triggerGeneration(datasetId, {
        file_ids: selectedFileIds.length > 0 ? selectedFileIds : undefined,
      });

      if (response) {
        setRegenerateModalOpen(false);
        setSelectedFileIds([]);
        refetchActiveJob();
        notifications.show({
          title: 'Regeneration Started',
          message: `Questions are being generated${selectedFileIds.length > 0 ? ' for selected files' : ' for all files'}. This may take a few minutes.`,
          color: 'blue',
          icon: <IconRefresh />,
          autoClose: 8000,
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Regenerate questions failed:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to start question regeneration',
        color: 'red',
        autoClose: 5000,
      });
    }
  };

  // Refresh questions when generation completes
  useEffect(() => {
    if (generationJob?.status === 'completed') {
      refetch();
      notifications.show({
        title: 'Generation Complete',
        message: `Successfully generated ${generationJob.total_questions_generated} questions from ${generationJob.processed_files} files.`,
        color: 'green',
        autoClose: 8000,
      });
    } else if (generationJob?.status === 'failed') {
      notifications.show({
        title: 'Generation Failed',
        message: 'Question generation encountered errors. Check the error details below.',
        color: 'red',
        autoClose: 8000,
      });
    }
  }, [
    generationJob?.status,
    generationJob?.total_questions_generated,
    generationJob?.processed_files,
    refetch,
  ]);

  if (!datasetId) {
    return null;
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Breadcrumbs */}
        <Breadcrumbs>
          <Anchor onClick={() => navigate('/evaluation/datasets')}>Datasets</Anchor>
          <Text>{dataset?.dataset.name || 'Loading...'}</Text>
        </Breadcrumbs>

        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <ActionIcon variant="light" onClick={() => navigate('/evaluation/datasets')}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <Title order={1}>{dataset?.dataset.name || 'Dataset Questions'}</Title>
            </Group>
            {dataset?.dataset.description && (
              <Text c="dimmed" size="sm" ml={44}>
                {dataset.dataset.description}
              </Text>
            )}
            {dataset && (
              <Group gap="md" ml={44} mt="xs">
                <Badge color={dataset.dataset.source === 'manual' ? 'blue' : 'green'}>
                  {dataset.dataset.source}
                </Badge>
                <Text size="sm" c="dimmed">
                  {dataset.questions.length} questions
                </Text>
                {dataset.files && dataset.files.length > 0 && (
                  <Text size="sm" c="dimmed">
                    {dataset.files.length} linked file{dataset.files.length > 1 ? 's' : ''}
                  </Text>
                )}
              </Group>
            )}
          </div>

          <Group>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setAddModalOpen(true)}>
              Add Question
            </Button>
            {dataset?.dataset.source === 'llm_generated' && (
              <Button
                leftSection={<IconRefresh size={16} />}
                variant="light"
                onClick={() => setRegenerateModalOpen(true)}
                disabled={isPolling}
              >
                Regenerate
              </Button>
            )}
          </Group>
        </Group>

        {/* Generation Progress Banner */}
        {generationJob &&
          (generationJob.status === 'pending' || generationJob.status === 'processing') && (
            <Alert color="blue" icon={<Loader size={16} />}>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    Generating Questions{' '}
                    {generationJob.current_file && `- ${generationJob.current_file}`}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {generationJob.processed_files}/{generationJob.total_files} files •{' '}
                    {generationJob.total_questions_generated} questions generated
                  </Text>
                </Group>
                <Progress value={generationJob.progress_percent} size="sm" animated />
              </Stack>
            </Alert>
          )}

        {/* Generation Completed/Failed Banner */}
        {generationJob &&
          generationJob.status === 'completed' &&
          generationJob.failed_files > 0 && (
            <Alert
              color="yellow"
              icon={<IconAlertCircle size={16} />}
              withCloseButton
              onClose={() => refetchActiveJob()}
            >
              <Text size="sm">
                Generation completed with {generationJob.failed_files} file failure
                {generationJob.failed_files > 1 ? 's' : ''}. Generated{' '}
                {generationJob.total_questions_generated} questions from{' '}
                {generationJob.processed_files} files.
              </Text>
            </Alert>
          )}

        {generationJob && generationJob.status === 'failed' && (
          <Alert
            color="red"
            icon={<IconAlertCircle size={16} />}
            withCloseButton
            onClose={() => refetchActiveJob()}
          >
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Question generation failed
              </Text>
              {generationJob.error_messages && generationJob.error_messages.length > 0 && (
                <Text size="xs" c="dimmed">
                  {generationJob.error_messages[0]}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        {/* Linked Files Section */}
        {dataset && dataset.files && dataset.files.length > 0 && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Text size="lg" fw={600}>
                Linked Files
              </Text>
              <Group gap="sm">
                {dataset.files.map((file) => (
                  <Badge key={file.file_id} variant="light" size="lg">
                    {file.original_filename} ({(file.filesize / 1024 / 1024).toFixed(2)} MB)
                  </Badge>
                ))}
              </Group>
            </Stack>
          </Card>
        )}

        {/* Questions Table */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text size="lg" fw={600}>
              Questions
            </Text>

            {loadingDataset ? (
              <Text ta="center" c="dimmed" py="xl">
                Loading questions...
              </Text>
            ) : !dataset || dataset.questions.length === 0 ? (
              <Stack align="center" gap="md" py="xl">
                <Text c="dimmed">No questions added yet</Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setAddModalOpen(true)}
                  variant="light"
                >
                  Add Your First Question
                </Button>
              </Stack>
            ) : (
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 60 }}>#</Table.Th>
                      <Table.Th>Question</Table.Th>
                      <Table.Th>Expected Context</Table.Th>
                      <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {dataset.questions.map((question, index) => (
                      <Table.Tr key={question.question_id}>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {index + 1}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={2}>
                            {question.question}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {question.expected_context}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Edit">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => openEditModal(question)}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete">
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => openDeleteModal(question.question_id)}
                                loading={deleting}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Card>

        {/* Add Question Modal */}
        <Modal
          opened={addModalOpen}
          onClose={() => {
            setAddModalOpen(false);
            setFormData({ question: '', expected_context: '' });
          }}
          title="Add Question"
          size="lg"
        >
          <Stack gap="md">
            <Textarea
              label="Question"
              placeholder="Enter the question"
              required
              minRows={3}
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            />

            <Textarea
              label="Expected Context"
              description="The ground truth context that should answer this question"
              placeholder="Enter the expected context"
              required
              minRows={4}
              value={formData.expected_context}
              onChange={(e) => setFormData({ ...formData, expected_context: e.target.value })}
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => {
                  setAddModalOpen(false);
                  setFormData({ question: '', expected_context: '' });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddQuestion}
                loading={adding}
                disabled={!formData.question || !formData.expected_context}
              >
                Add Question
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Edit Question Modal */}
        <Modal
          opened={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedQuestionId(null);
            setFormData({ question: '', expected_context: '' });
          }}
          title="Edit Question"
          size="lg"
        >
          <Stack gap="md">
            <Textarea
              label="Question"
              placeholder="Enter the question"
              required
              minRows={3}
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
            />

            <Textarea
              label="Expected Context"
              description="The ground truth context that should answer this question"
              placeholder="Enter the expected context"
              required
              minRows={4}
              value={formData.expected_context}
              onChange={(e) => setFormData({ ...formData, expected_context: e.target.value })}
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => {
                  setEditModalOpen(false);
                  setSelectedQuestionId(null);
                  setFormData({ question: '', expected_context: '' });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleEditQuestion}
                loading={updating}
                disabled={!formData.question || !formData.expected_context}
              >
                Save Changes
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedQuestionId(null);
          }}
          title="Delete Question"
        >
          <Stack gap="md">
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              Are you sure you want to delete this question? This action cannot be undone.
            </Alert>
            <Group justify="flex-end">
              <Button
                variant="light"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedQuestionId(null);
                }}
              >
                Cancel
              </Button>
              <Button color="red" onClick={handleDeleteQuestion} loading={deleting}>
                Delete Question
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Regenerate Questions Modal */}
        <Modal
          opened={regenerateModalOpen}
          onClose={() => {
            setRegenerateModalOpen(false);
            setSelectedFileIds([]);
          }}
          title="Regenerate Questions"
          size="lg"
        >
          <Stack gap="md">
            <Alert color="blue" icon={<IconFileText size={16} />}>
              Generate new questions from files using AI. You can select specific files or
              regenerate for all files.
            </Alert>

            {dataset && dataset.files && dataset.files.length > 0 && (
              <MultiSelect
                label="Select Files (Optional)"
                description="Leave empty to regenerate for all files"
                placeholder="Select files to regenerate questions from"
                data={dataset.files.map((file) => ({
                  value: file.file_id,
                  label: `${file.original_filename} (${(file.filesize / 1024 / 1024).toFixed(2)} MB)`,
                }))}
                value={selectedFileIds}
                onChange={setSelectedFileIds}
                searchable
                clearable
              />
            )}

            <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
              This will generate additional questions. Existing questions will not be removed.
            </Alert>

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => {
                  setRegenerateModalOpen(false);
                  setSelectedFileIds([]);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerateQuestions}
                loading={triggeringGeneration}
                leftSection={<IconRefresh size={16} />}
              >
                Start Generation
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
};
