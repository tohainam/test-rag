/**
 * Files Management Page
 * Upload and manage evaluation files
 */

import { useState } from 'react';
import {
  IconAlertCircle,
  IconDownload,
  IconFile,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Container,
  FileButton,
  Group,
  Modal,
  Progress,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  useFileDelete,
  useFileDownload,
  useFilesList,
  useFileUpload,
} from '../../features/evaluation/hooks/useFiles';

export const FilesManagementPage = () => {
  const {
    files,
    loading: loadingFiles,
    params,
    updateParams,
    refetch,
  } = useFilesList({ page: 1, limit: 20 });
  const { upload, uploading, uploadProgress, error: uploadError } = useFileUpload();
  const { deleteFile, deleting } = useFileDelete();
  const { download } = useFileDownload();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleFileSelect = async (file: File | null) => {
    if (!file) {
      return;
    }
    setSelectedFile(file);

    try {
      await upload(file);
      setSelectedFile(null);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Upload failed:', error);
    }
  };

  const handleDelete = async () => {
    if (!fileToDelete) {
      return;
    }

    try {
      await deleteFile(fileToDelete);
      setDeleteModalOpen(false);
      setFileToDelete(null);
      refetch();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Delete failed:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileTypeColor = (contentType: string) => {
    if (contentType.includes('pdf')) {
      return 'red';
    }
    if (contentType.includes('word') || contentType.includes('document')) {
      return 'blue';
    }
    if (contentType.includes('text')) {
      return 'gray';
    }
    return 'cyan';
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Files Management</Title>
            <Text c="dimmed" size="sm" mt="xs">
              Upload and manage files for evaluation datasets
            </Text>
          </div>

          <FileButton onChange={handleFileSelect} accept=".pdf,.docx,.txt,.md">
            {(props) => (
              <Button
                {...props}
                leftSection={<IconUpload size={16} />}
                loading={uploading}
                disabled={uploading}
              >
                Upload File
              </Button>
            )}
          </FileButton>
        </Group>

        {/* Upload Progress */}
        {uploading && (
          <Card shadow="sm" padding="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Uploading: {selectedFile?.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {uploadProgress}%
                </Text>
              </Group>
              <Progress value={uploadProgress} color="blue" size="lg" radius="xl" animated />
            </Stack>
          </Card>
        )}

        {/* Upload Error */}
        {uploadError && (
          <Alert color="red" title="Upload Failed" icon={<IconAlertCircle size={16} />}>
            {uploadError.message}
          </Alert>
        )}

        {/* Files Table */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="lg" fw={600}>
                Files
              </Text>
              <Text size="sm" c="dimmed">
                {files?.total || 0} files total
              </Text>
            </Group>

            <Table.ScrollContainer minWidth={800}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Filename</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>Uploaded</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loadingFiles ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Text ta="center" c="dimmed" py="xl">
                          Loading files...
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : files?.items.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Stack align="center" gap="md" py="xl">
                          <IconFile size={48} stroke={1} />
                          <Text c="dimmed">No files uploaded yet</Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    files?.items.map((file) => (
                      <Table.Tr key={file.file_id}>
                        <Table.Td>
                          <Group gap="xs">
                            <IconFile size={16} />
                            <Text size="sm">{file.original_filename}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getFileTypeColor(file.content_type)} variant="light">
                            {file.content_type.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatFileSize(file.filesize)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(file.created_at).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Download">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => download(file.file_id)}
                              >
                                <IconDownload size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Delete">
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => {
                                  setFileToDelete(file.file_id);
                                  setDeleteModalOpen(true);
                                }}
                                loading={deleting}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>

            {/* Pagination */}
            {files && files.pages > 1 && (
              <Group justify="center">
                <Button
                  variant="light"
                  onClick={() => updateParams({ ...params, page: (params?.page || 1) - 1 })}
                  disabled={params?.page === 1}
                >
                  Previous
                </Button>
                <Text size="sm">
                  Page {params?.page || 1} of {files.pages}
                </Text>
                <Button
                  variant="light"
                  onClick={() => updateParams({ ...params, page: (params?.page || 1) + 1 })}
                  disabled={params?.page === files.pages}
                >
                  Next
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setFileToDelete(null);
          }}
          title="Delete File"
        >
          <Stack gap="md">
            <Text>Are you sure you want to delete this file? This action cannot be undone.</Text>
            <Group justify="flex-end">
              <Button
                variant="light"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setFileToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button color="red" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Info Card */}
        <Card shadow="sm" padding="md" radius="md" bg="gray.0">
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Supported File Types
            </Text>
            <Text size="xs" c="dimmed">
              • PDF (.pdf) - Portable Document Format
            </Text>
            <Text size="xs" c="dimmed">
              • Word (.docx) - Microsoft Word Document
            </Text>
            <Text size="xs" c="dimmed">
              • Text (.txt) - Plain Text File
            </Text>
            <Text size="xs" c="dimmed">
              • Markdown (.md) - Markdown Document
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              Maximum file size: 100 MB
            </Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
};
