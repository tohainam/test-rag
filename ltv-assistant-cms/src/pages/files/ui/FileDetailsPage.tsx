import { useEffect, useState } from 'react';
import { IconAlertCircle, IconFileAnalytics, IconFileText, IconRefresh } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  LoadingOverlay,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { filesApi, type FileDetails } from '@/features/files/api/files.api';
import { ChunksTab } from '@/features/files/ui/ChunksTab';
import { getErrorMessage } from '@/shared/types';
import { PageBreadcrumbs } from '@/shared/ui';

export function FileDetailsPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const [fileDetails, setFileDetails] = useState<FileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('parent-chunks');

  const loadFileDetails = async () => {
    if (!fileId) {
      return;
    }

    try {
      setLoading(true);
      const data = await filesApi.getFileDetails(fileId);
      setFileDetails(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to load file details',
        color: 'red',
      });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFileDetails();
  }, [fileId]);

  if (loading || !fileDetails) {
    return <LoadingOverlay visible />;
  }

  const getStatusColor = (status: string | null): 'gray' | 'blue' | 'green' | 'red' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'processing':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (status: string | null): string => {
    if (!status) {
      return 'Not Indexed';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getOutboxStatusColor = (
    status: string | null | undefined
  ): 'gray' | 'blue' | 'green' | 'red' | 'orange' => {
    if (!status) {
      return 'gray';
    }
    switch (status) {
      case 'published':
        return 'green';
      case 'publishing':
        return 'blue';
      case 'failed':
        return 'red';
      case 'poison':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const getOutboxStatusLabel = (status: string | null | undefined): string => {
    if (!status) {
      return 'N/A';
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleRetry = async () => {
    if (!fileId) {
      return;
    }
    setRetrying(true);
    try {
      await filesApi.retryFileIndexing(fileId);
      notifications.show({
        title: 'Success',
        message: 'File indexing retry scheduled successfully',
        color: 'green',
      });
      // Reload file details
      await loadFileDetails();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to retry file indexing',
        color: 'red',
      });
    } finally {
      setRetrying(false);
    }
  };

  const canRetry = (): boolean => {
    if (!fileDetails) {
      return false;
    }
    return (
      fileDetails.outboxStatus === 'failed' ||
      fileDetails.outboxStatus === 'poison' ||
      fileDetails.indexingStatus === 'failed'
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {
      return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  };

  const isIndexingComplete = fileDetails.indexingStatus === 'completed';
  const isIndexingInProgress =
    fileDetails.indexingStatus === 'pending' || fileDetails.indexingStatus === 'processing';
  const isIndexingFailed = fileDetails.indexingStatus === 'failed';

  return (
    <Container fluid>
      <PageBreadcrumbs
        items={[{ label: 'Documents', href: '/documents' }, { label: fileDetails.filename }]}
      />

      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} mb="xs">
              {fileDetails.filename}
            </Title>
            <Group gap="xs">
              <Badge color={getOutboxStatusColor(fileDetails.outboxStatus)} variant="light">
                Outbox: {getOutboxStatusLabel(fileDetails.outboxStatus)}
              </Badge>
              <Badge color={getStatusColor(fileDetails.indexingStatus)} variant="light">
                Indexing: {getStatusLabel(fileDetails.indexingStatus)}
              </Badge>
              <Badge color="gray" variant="outline">
                {fileDetails.fileType.toUpperCase()}
              </Badge>
            </Group>
          </div>
          {canRetry() && (
            <Button
              leftSection={<IconRefresh size={16} />}
              color="orange"
              variant="light"
              onClick={handleRetry}
              loading={retrying}
            >
              Retry Indexing
            </Button>
          )}
        </Group>

        <Paper p="xl" withBorder radius="md">
          <Stack gap="md">
            <Group gap="xl" grow>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  File Size
                </Text>
                <Text size="sm">{formatFileSize(fileDetails.fileSize)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  MIME Type
                </Text>
                <Text size="sm">{fileDetails.mimeType}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Uploaded
                </Text>
                <Text size="sm">
                  {fileDetails.uploadedAt
                    ? new Date(fileDetails.uploadedAt).toLocaleString()
                    : 'N/A'}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Indexed
                </Text>
                <Text size="sm">
                  {fileDetails.indexedAt ? new Date(fileDetails.indexedAt).toLocaleString() : 'N/A'}
                </Text>
              </div>
            </Group>

            {isIndexingComplete && (
              <Group gap="xl" grow>
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Parent Chunks
                  </Text>
                  <Text size="sm" fw={600}>
                    {fileDetails.parentChunksCount.toLocaleString()}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Child Chunks
                  </Text>
                  <Text size="sm" fw={600}>
                    {fileDetails.childChunksCount.toLocaleString()}
                  </Text>
                </div>
                <div />
                <div />
              </Group>
            )}
          </Stack>
        </Paper>

        {isIndexingFailed && fileDetails.indexingError && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Indexing Failed"
            color="red"
            variant="light"
          >
            {fileDetails.indexingError}
          </Alert>
        )}

        <Paper p={0} withBorder radius="md">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="parent-chunks" leftSection={<IconFileText size={16} />}>
                Parent Chunks
              </Tabs.Tab>
              <Tabs.Tab value="child-chunks" leftSection={<IconFileText size={16} />}>
                Child Chunks
              </Tabs.Tab>
              <Tabs.Tab value="visualization" leftSection={<IconFileAnalytics size={16} />}>
                Indexing Visualization
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="parent-chunks" p="xl">
              <ChunksTab
                type="parent"
                fileId={fileDetails.id}
                isIndexingComplete={isIndexingComplete}
                isIndexingInProgress={isIndexingInProgress}
              />
            </Tabs.Panel>

            <Tabs.Panel value="child-chunks" p="xl">
              <ChunksTab
                type="child"
                fileId={fileDetails.id}
                isIndexingComplete={isIndexingComplete}
                isIndexingInProgress={isIndexingInProgress}
              />
            </Tabs.Panel>

            <Tabs.Panel value="visualization" p="xl">
              <Alert icon={<IconAlertCircle size={16} />} title="Coming Soon" color="blue">
                Detailed indexing visualization will be available in a future update.
              </Alert>
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Stack>
    </Container>
  );
}
