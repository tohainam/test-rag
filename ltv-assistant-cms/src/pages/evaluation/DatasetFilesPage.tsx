/**
 * Dataset Files Page
 * Manage files linked to a dataset
 */

import { useEffect, useState } from 'react';
import { IconAlertCircle, IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react';
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
  Modal,
  MultiSelect,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  useDatasetAddFiles,
  useDatasetDetail,
  useDatasetRemoveFile,
} from '../../features/evaluation/hooks/useDatasets';
import { useFilesList } from '../../features/evaluation/hooks/useFiles';

export const DatasetFilesPage = () => {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const { dataset, loading: loadingDataset, refetch } = useDatasetDetail(datasetId);
  const { files: allFiles } = useFilesList({ page: 1, limit: 100 });
  const { addFiles, adding } = useDatasetAddFiles();
  const { removeFile, removing } = useDatasetRemoveFile();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    if (!datasetId) {
      navigate('/evaluation/datasets');
    }
  }, [datasetId, navigate]);

  // Get currently linked file IDs
  const linkedFileIds = dataset?.files?.map((f) => f.file_id) || [];

  // Get available files (not yet linked)
  const availableFiles =
    allFiles?.items.filter((file) => !linkedFileIds.includes(file.file_id)) || [];

  const handleAddFiles = async () => {
    if (!datasetId || selectedFileIds.length === 0) {
      return;
    }

    try {
      await addFiles(datasetId, selectedFileIds);
      setAddModalOpen(false);
      setSelectedFileIds([]);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Add files failed:', error);
    }
  };

  const handleRemoveFile = async () => {
    if (!datasetId || !selectedFileId) {
      return;
    }

    try {
      await removeFile(datasetId, selectedFileId);
      setDeleteModalOpen(false);
      setSelectedFileId(null);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Remove file failed:', error);
    }
  };

  const openDeleteModal = (fileId: string) => {
    setSelectedFileId(fileId);
    setDeleteModalOpen(true);
  };

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
          <Text>Files</Text>
        </Breadcrumbs>

        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="sm" mb="xs">
              <ActionIcon variant="light" onClick={() => navigate('/evaluation/datasets')}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <Title order={1}>{dataset?.dataset.name || 'Dataset Files'}</Title>
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
                  {dataset.files?.length || 0} linked file{dataset.files?.length !== 1 ? 's' : ''}
                </Text>
                <Text size="sm" c="dimmed">
                  {dataset.questions.length} questions
                </Text>
              </Group>
            )}
          </div>

          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddModalOpen(true)}>
            Add Files
          </Button>
        </Group>

        {/* Files Table */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Text size="lg" fw={600}>
              Linked Files
            </Text>

            {loadingDataset ? (
              <Text ta="center" c="dimmed" py="xl">
                Loading files...
              </Text>
            ) : !dataset || !dataset.files || dataset.files.length === 0 ? (
              <Stack align="center" gap="md" py="xl">
                <Text c="dimmed">No files linked to this dataset yet</Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setAddModalOpen(true)}
                  variant="light"
                >
                  Add Files
                </Button>
              </Stack>
            ) : (
              <Table.ScrollContainer minWidth={800}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Filename</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Size</Table.Th>
                      <Table.Th>Uploaded</Table.Th>
                      <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {dataset.files.map((file) => (
                      <Table.Tr key={file.file_id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {file.original_filename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" size="sm">
                            {file.content_type || 'Unknown'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {(file.filesize / 1024 / 1024).toFixed(2)} MB
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(file.created_at).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Remove from Dataset">
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => openDeleteModal(file.file_id)}
                                loading={removing}
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

        {/* Add Files Modal */}
        <Modal
          opened={addModalOpen}
          onClose={() => {
            setAddModalOpen(false);
            setSelectedFileIds([]);
          }}
          title="Add Files to Dataset"
          size="lg"
        >
          <Stack gap="md">
            {availableFiles.length === 0 ? (
              <Alert color="blue" icon={<IconAlertCircle size={16} />}>
                All uploaded files are already linked to this dataset. Upload new files first.
              </Alert>
            ) : (
              <>
                <MultiSelect
                  label="Select Files"
                  description="Choose files to link with this dataset"
                  placeholder="Select files..."
                  data={availableFiles.map((file) => ({
                    value: file.file_id,
                    label: `${file.original_filename} (${(file.filesize / 1024 / 1024).toFixed(2)} MB)`,
                  }))}
                  value={selectedFileIds}
                  onChange={setSelectedFileIds}
                  searchable
                  clearable
                />

                <Group justify="flex-end" mt="md">
                  <Button
                    variant="light"
                    onClick={() => {
                      setAddModalOpen(false);
                      setSelectedFileIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddFiles}
                    loading={adding}
                    disabled={selectedFileIds.length === 0}
                  >
                    Add Files
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Modal>

        {/* Remove File Confirmation Modal */}
        <Modal
          opened={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setSelectedFileId(null);
          }}
          title="Remove File from Dataset"
        >
          <Stack gap="md">
            <Alert color="orange" icon={<IconAlertCircle size={16} />}>
              This will remove the file from this dataset. The file itself will not be deleted and
              can be linked to other datasets.
            </Alert>
            <Group justify="flex-end">
              <Button
                variant="light"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setSelectedFileId(null);
                }}
              >
                Cancel
              </Button>
              <Button color="red" onClick={handleRemoveFile} loading={removing}>
                Remove File
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
};
