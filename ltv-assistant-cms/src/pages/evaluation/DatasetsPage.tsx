/**
 * Datasets Management Page
 * List and manage evaluation datasets
 */

import { useEffect, useState } from 'react';
import {
  IconAlertCircle,
  IconEdit,
  IconFile,
  IconList,
  IconLoader,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Modal,
  MultiSelect,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ROUTES } from '@/shared/config';
import {
  useDatasetCreate,
  useDatasetDelete,
  useDatasetsList,
  useDatasetUpdate,
} from '../../features/evaluation/hooks/useDatasets';
import { useFilesList } from '../../features/evaluation/hooks/useFiles';
import type {
  DatasetCreateRequest,
  DatasetUpdateRequest,
} from '../../features/evaluation/types/evaluation.types';

export const DatasetsPage = () => {
  const navigate = useNavigate();
  const { datasets, loading: loadingDatasets, refetch } = useDatasetsList({ page: 1, limit: 50 });
  const { files } = useFilesList({ page: 1, limit: 100 });
  const { createDataset, creating } = useDatasetCreate();
  const { updateDataset, updating } = useDatasetUpdate();
  const { deleteDataset, deleting } = useDatasetDelete();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    source: 'manual' as 'manual' | 'llm_generated',
    file_ids: [] as string[],
  });

  // Auto-refresh when there are active generation jobs
  useEffect(() => {
    const hasActiveJobs = datasets?.items.some(
      (d) =>
        d.generation_job &&
        (d.generation_job.status === 'pending' || d.generation_job.status === 'processing')
    );

    if (hasActiveJobs) {
      const interval = setInterval(() => {
        refetch();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [datasets, refetch]);

  const handleCreateDataset = async () => {
    try {
      const request: DatasetCreateRequest = {
        name: formData.name,
        description: formData.description || undefined,
        source: formData.source,
        file_ids: formData.file_ids.length > 0 ? formData.file_ids : undefined,
      };

      const response = await createDataset(request);

      setCreateModalOpen(false);
      setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
      refetch();

      // Show notification about generation
      if (response?.generation_job_id) {
        notifications.show({
          title: 'Dataset Created',
          message: 'Questions are being generated from the files. This may take a few minutes.',
          color: 'blue',
          icon: <IconAlertCircle />,
          autoClose: 8000,
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Create dataset failed:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create dataset',
        color: 'red',
        autoClose: 5000,
      });
    }
  };

  const handleEditDataset = async () => {
    if (!selectedDatasetId) {
      return;
    }

    try {
      const request: DatasetUpdateRequest = {
        name: formData.name,
        description: formData.description || undefined,
      };

      await updateDataset(selectedDatasetId, request);
      setEditModalOpen(false);
      setSelectedDatasetId(null);
      setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Update dataset failed:', error);
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId) {
      return;
    }

    try {
      await deleteDataset(selectedDatasetId);
      setDeleteModalOpen(false);
      setSelectedDatasetId(null);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Delete dataset failed:', error);
    }
  };

  const openEditModal = (dataset: { dataset_id: string; name: string; description?: string }) => {
    setSelectedDatasetId(dataset.dataset_id);
    setFormData({
      name: dataset.name,
      description: dataset.description || '',
      source: 'manual',
      file_ids: [],
    });
    setEditModalOpen(true);
  };

  const openDeleteModal = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setDeleteModalOpen(true);
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Datasets</Title>
            <Text c="dimmed" size="sm" mt="xs">
              Manage evaluation datasets with questions
            </Text>
          </div>

          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateModalOpen(true)}>
            New Dataset
          </Button>
        </Group>

        {/* Datasets Grid */}
        {loadingDatasets ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Text ta="center" c="dimmed">
              Loading datasets...
            </Text>
          </Card>
        ) : datasets?.items.length === 0 ? (
          <Card shadow="sm" padding="xl" radius="md" withBorder>
            <Stack align="center" gap="md">
              <IconList size={48} stroke={1} />
              <Text c="dimmed">No datasets created yet</Text>
              <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateModalOpen(true)}>
                Create Your First Dataset
              </Button>
            </Stack>
          </Card>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {datasets?.items.map((dataset) => (
              <Card key={dataset.dataset_id} shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  {/* Header */}
                  <Group justify="space-between" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <Text size="lg" fw={600} lineClamp={1}>
                        {dataset.name}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {new Date(dataset.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                    <Badge color={dataset.source === 'manual' ? 'blue' : 'green'} variant="light">
                      {dataset.source}
                    </Badge>
                  </Group>

                  {/* Description */}
                  {dataset.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {dataset.description}
                    </Text>
                  )}

                  {/* Generation Job Status */}
                  {dataset.generation_job && (
                    <Alert
                      color={
                        dataset.generation_job.status === 'pending'
                          ? 'blue'
                          : dataset.generation_job.status === 'processing'
                            ? 'cyan'
                            : dataset.generation_job.status === 'completed'
                              ? 'green'
                              : 'red'
                      }
                      icon={<IconLoader size={16} />}
                      p="xs"
                    >
                      <Stack gap={4}>
                        <Group gap={8} justify="space-between">
                          <Text size="xs" fw={500}>
                            {dataset.generation_job.status === 'pending'
                              ? 'Queued for generation'
                              : dataset.generation_job.status === 'processing'
                                ? 'Generating questions'
                                : 'Generation complete'}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {Math.round(dataset.generation_job.progress_percent)}%
                          </Text>
                        </Group>
                        <Progress
                          value={dataset.generation_job.progress_percent}
                          size="xs"
                          color={
                            dataset.generation_job.status === 'pending'
                              ? 'blue'
                              : dataset.generation_job.status === 'processing'
                                ? 'cyan'
                                : 'green'
                          }
                          animated={dataset.generation_job.status === 'processing'}
                        />
                        <Text size="xs" c="dimmed">
                          Files: {dataset.generation_job.processed_files}/
                          {dataset.generation_job.total_files} • Questions generated:{' '}
                          {dataset.generation_job.total_questions_generated}
                        </Text>
                      </Stack>
                    </Alert>
                  )}

                  {/* Stats */}
                  <Group gap="md">
                    <div>
                      <Text size="xs" c="dimmed">
                        Questions
                      </Text>
                      <Text size="lg" fw={700}>
                        {dataset.total_questions}
                      </Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Files
                      </Text>
                      <Text size="lg" fw={700}>
                        {dataset.file_count || 0}
                      </Text>
                    </div>
                  </Group>

                  {/* Actions */}
                  <Group gap="xs" mt="auto">
                    <Tooltip label="Manage Questions">
                      <ActionIcon
                        variant="light"
                        color="blue"
                        size="lg"
                        onClick={() =>
                          navigate(`/evaluation/datasets/${dataset.dataset_id}/questions`)
                        }
                      >
                        <IconList size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Manage Files">
                      <ActionIcon
                        variant="light"
                        color="violet"
                        size="lg"
                        onClick={() => navigate(`/evaluation/datasets/${dataset.dataset_id}/files`)}
                      >
                        <IconFile size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Run Evaluation">
                      <ActionIcon
                        variant="light"
                        color="green"
                        size="lg"
                        onClick={() => navigate(ROUTES.EVALUATION_RUN)}
                        disabled={dataset.total_questions === 0}
                      >
                        <IconPlayerPlay size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit">
                      <ActionIcon
                        variant="light"
                        color="orange"
                        size="lg"
                        onClick={() => openEditModal(dataset)}
                      >
                        <IconEdit size={18} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete">
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="lg"
                        onClick={() => openDeleteModal(dataset.dataset_id)}
                      >
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}

        {/* Create Dataset Modal */}
        <Modal
          opened={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
          }}
          title="Create New Dataset"
          size="lg"
        >
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="Enter dataset name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <Textarea
              label="Description"
              placeholder="Enter dataset description (optional)"
              minRows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            <Select
              label="Source"
              description="How questions will be added to this dataset"
              data={[
                { value: 'manual', label: 'Manual - Add questions manually' },
                { value: 'llm_generated', label: 'LLM Generated - Auto-generate from files' },
              ]}
              value={formData.source}
              onChange={(value) =>
                setFormData({ ...formData, source: value as 'manual' | 'llm_generated' })
              }
              required
            />

            {formData.source === 'llm_generated' && formData.file_ids.length > 0 && (
              <Alert color="blue" icon={<IconAlertCircle size={16} />}>
                Questions will be automatically generated from the selected files using AI after
                dataset creation.
              </Alert>
            )}

            {formData.source === 'llm_generated' && formData.file_ids.length === 0 && (
              <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                Please select at least one file for LLM-generated datasets. Questions will be
                generated automatically from the files.
              </Alert>
            )}

            <MultiSelect
              label="Linked Files"
              description="Select files to link with this dataset (optional, for reference)"
              placeholder="Select files..."
              data={
                files?.items.map((file) => ({
                  value: file.file_id,
                  label: `${file.original_filename} (${(file.filesize / 1024 / 1024).toFixed(2)} MB)`,
                })) || []
              }
              value={formData.file_ids}
              onChange={(value) => setFormData({ ...formData, file_ids: value })}
              searchable
              clearable
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => {
                  setCreateModalOpen(false);
                  setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateDataset}
                loading={creating}
                disabled={
                  !formData.name ||
                  (formData.source === 'llm_generated' && formData.file_ids.length === 0)
                }
              >
                Create Dataset
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Edit Dataset Modal */}
        <Modal
          opened={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedDatasetId(null);
            setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
          }}
          title="Edit Dataset"
          size="lg"
        >
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="Enter dataset name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />

            <Textarea
              label="Description"
              placeholder="Enter dataset description (optional)"
              minRows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            <Group justify="flex-end" mt="md">
              <Button
                variant="light"
                onClick={() => {
                  setEditModalOpen(false);
                  setSelectedDatasetId(null);
                  setFormData({ name: '', description: '', source: 'manual', file_ids: [] });
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleEditDataset} loading={updating} disabled={!formData.name}>
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
            setSelectedDatasetId(null);
          }}
          title="Delete Dataset"
        >
          <Stack gap="md">
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              This will permanently delete the dataset and all its questions. This action cannot be
              undone.
            </Alert>
            <Group justify="flex-end">
              <Button
                variant="light"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedDatasetId(null);
                }}
              >
                Cancel
              </Button>
              <Button color="red" onClick={handleDeleteDataset} loading={deleting}>
                Delete Dataset
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
};
