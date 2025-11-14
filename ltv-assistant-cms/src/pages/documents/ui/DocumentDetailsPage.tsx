import { useEffect, useState } from 'react';
import { IconEdit, IconUpload, IconUsers } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { DocumentDetailsResponse, documentsApi } from '@/features/documents/api/documents.api';
import { DocumentUserManagement } from '@/features/documents/ui/DocumentUserManagement';
import { FilesTable } from '@/features/documents/ui/FilesTable';
import { FileUploadZone } from '@/features/documents/ui/FileUploadZone';
import { getErrorMessage } from '@/shared/types';
import { PageBreadcrumbs } from '@/shared/ui';

export function DocumentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetailsResponse | null>(null);
  const [uploadModalOpened, setUploadModalOpened] = useState(false);
  const [userManagementOpened, setUserManagementOpened] = useState(false);

  const loadDocument = async () => {
    if (!id) {
      return;
    }
    try {
      const data = await documentsApi.getDocument(id);
      setDocument(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to load document',
        color: 'red',
      });
      navigate('/documents');
    }
  };

  useEffect(() => {
    loadDocument();
  }, [id]);

  const handleUploadComplete = () => {
    setUploadModalOpened(false);
    loadDocument();
  };

  if (!document) {
    return <LoadingOverlay visible />;
  }

  const getTypeColor = (type: string) => {
    return type === 'public' ? 'green' : 'orange';
  };

  return (
    <Container fluid>
      <PageBreadcrumbs
        items={[{ label: 'Documents', href: '/documents' }, { label: document.title }]}
      />

      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} mb="xs">
              {document.title}
            </Title>
            <Group gap="xs">
              <Badge color={getTypeColor(document.type)} variant="light">
                {document.type}
              </Badge>
            </Group>
          </div>

          <Group>
            {document.type === 'restricted' && (
              <Button
                variant="light"
                leftSection={<IconUsers size={16} />}
                onClick={() => setUserManagementOpened(true)}
              >
                Manage Users
              </Button>
            )}
            <Button
              variant="filled"
              leftSection={<IconEdit size={16} />}
              onClick={() => navigate(`/documents/${id}/edit`)}
            >
              Edit
            </Button>
          </Group>
        </Group>

        <Paper p="xl" withBorder radius="md">
          <Stack gap="md">
            {document.description && (
              <div>
                <Text fw={600} mb="xs">
                  Description
                </Text>
                <Text c="dimmed">{document.description}</Text>
              </div>
            )}

            <Divider />

            <Group gap="xl">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Created
                </Text>
                <Text size="sm">{new Date(document.createdAt).toLocaleString()}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  Updated
                </Text>
                <Text size="sm">{new Date(document.updatedAt).toLocaleString()}</Text>
              </div>
            </Group>
          </Stack>
        </Paper>

        <Paper p="xl" withBorder radius="md">
          <Group justify="space-between" mb="lg">
            <Title order={3}>Files ({document.files.length})</Title>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={() => setUploadModalOpened(true)}
            >
              Upload Files
            </Button>
          </Group>

          {uploadModalOpened && (
            <FileUploadZone
              documentId={document.id}
              onUploadComplete={handleUploadComplete}
              onClose={() => setUploadModalOpened(false)}
            />
          )}

          <FilesTable files={document.files} onFileDeleted={loadDocument} />
        </Paper>
      </Stack>

      <Modal
        opened={userManagementOpened}
        onClose={() => setUserManagementOpened(false)}
        title="Document Access Management"
        size="xl"
      >
        <DocumentUserManagement
          documentId={document.id}
          documentType={document.type}
          onClose={() => setUserManagementOpened(false)}
        />
      </Modal>
    </Container>
  );
}
