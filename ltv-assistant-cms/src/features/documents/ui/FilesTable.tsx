import { useState } from 'react';
import { IconDownload, IconEye, IconRefresh, IconTrash } from '@tabler/icons-react';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { ActionIcon, Badge, Group, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { getErrorMessage } from '@/shared/types';
import { documentsApi, File } from '../api/documents.api';

interface FilesTableProps {
  files: File[];
  onFileDeleted: () => void;
}

export function FilesTable({ files, onFileDeleted }: FilesTableProps) {
  const navigate = useNavigate();
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);

  const handleDownload = async (file: File) => {
    try {
      const response = await documentsApi.getDownloadUrl(file.id);
      window.open(response.presignedUrl, '_blank');
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to download file',
        color: 'red',
      });
    }
  };

  const handleDelete = (file: File) => {
    modals.openConfirmModal({
      title: 'Delete File',
      children: `Are you sure you want to delete "${file.filename}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await documentsApi.deleteFile(file.id);
          notifications.show({
            title: 'Success',
            message: 'File deleted successfully',
            color: 'green',
          });
          onFileDeleted();
        } catch (error) {
          notifications.show({
            title: 'Error',
            message: getErrorMessage(error) || 'Failed to delete file',
            color: 'red',
          });
        }
      },
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'green';
      case 'uploading':
        return 'blue';
      case 'pending':
        return 'gray';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getIndexingStatusColor = (
    status: string | null | undefined
  ): 'green' | 'blue' | 'yellow' | 'red' | 'gray' => {
    if (!status) {
      return 'gray';
    }
    switch (status) {
      case 'completed':
        return 'green';
      case 'processing':
        return 'blue';
      case 'pending':
        return 'yellow';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getOutboxStatusColor = (
    status: string | null | undefined
  ): 'green' | 'blue' | 'yellow' | 'red' | 'orange' | 'gray' => {
    if (!status) {
      return 'gray';
    }
    switch (status) {
      case 'published':
        return 'green';
      case 'publishing':
        return 'blue';
      case 'pending':
        return 'yellow';
      case 'failed':
        return 'red';
      case 'poison':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const handleRetry = async (file: File) => {
    setRetryingFileId(file.id);
    try {
      await documentsApi.retryFileIndexing(file.id);
      notifications.show({
        title: 'Success',
        message: 'File indexing retry scheduled successfully',
        color: 'green',
      });
      onFileDeleted(); // Refresh the file list
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to retry file indexing',
        color: 'red',
      });
    } finally {
      setRetryingFileId(null);
    }
  };

  const canRetry = (file: File): boolean => {
    return (
      file.outboxStatus === 'failed' ||
      file.outboxStatus === 'poison' ||
      file.indexingStatus === 'failed'
    );
  };

  return (
    <DataTable
      records={files}
      columns={[
        {
          accessor: 'filename',
          title: 'Filename',
          width: '25%',
        },
        {
          accessor: 'fileType',
          title: 'Type',
          width: '7%',
          render: (file) => file.fileType.toUpperCase(),
        },
        {
          accessor: 'fileSize',
          title: 'Size',
          width: '10%',
          render: (file) => formatFileSize(file.fileSize),
        },
        {
          accessor: 'status',
          title: 'Upload',
          width: '10%',
          render: (file) => (
            <Badge color={getStatusColor(file.status)} size="sm">
              {file.status}
            </Badge>
          ),
        },
        {
          accessor: 'outboxStatus',
          title: 'Outbox',
          width: '11%',
          render: (file) => (
            <Badge color={getOutboxStatusColor(file.outboxStatus)} size="sm">
              {file.outboxStatus || 'N/A'}
            </Badge>
          ),
        },
        {
          accessor: 'indexingStatus',
          title: 'Indexing',
          width: '11%',
          render: (file) => (
            <Badge color={getIndexingStatusColor(file.indexingStatus)} size="sm">
              {file.indexingStatus || 'Not started'}
            </Badge>
          ),
        },
        {
          accessor: 'createdAt',
          title: 'Uploaded',
          width: '12%',
          render: (file) => new Date(file.createdAt).toLocaleDateString(),
        },
        {
          accessor: 'actions',
          title: 'Actions',
          width: '14%',
          textAlign: 'center',
          render: (file) => (
            <Group gap="xs" justify="center">
              <Tooltip label="View details">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => navigate(`/files/${file.id}`)}
                >
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>
              {file.status === 'uploaded' && (
                <Tooltip label="Download">
                  <ActionIcon variant="subtle" color="blue" onClick={() => handleDownload(file)}>
                    <IconDownload size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              {canRetry(file) && (
                <Tooltip label="Retry indexing">
                  <ActionIcon
                    variant="subtle"
                    color="orange"
                    onClick={() => handleRetry(file)}
                    loading={retryingFileId === file.id}
                  >
                    <IconRefresh size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label="Delete">
                <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(file)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ),
        },
      ]}
      minHeight={200}
      noRecordsText="No files uploaded yet"
    />
  );
}
