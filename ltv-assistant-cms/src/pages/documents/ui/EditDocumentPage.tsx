import { useEffect, useState } from 'react';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Container,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { documentsApi } from '@/features/documents/api/documents.api';
import { getErrorMessage } from '@/shared/types';
import { PageBreadcrumbs } from '@/shared/ui';

interface DocumentFormValues {
  title: string;
  description: string;
  type: 'public' | 'restricted';
}

export function EditDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const form = useForm<DocumentFormValues>({
    initialValues: {
      title: '',
      description: '',
      type: 'public',
    },
    validate: {
      title: (value) => (value.trim().length > 0 ? null : 'Title is required'),
    },
  });

  useEffect(() => {
    const loadDocument = async () => {
      if (!id) {
        return;
      }

      try {
        const document = await documentsApi.getDocument(id);
        form.setValues({
          title: document.title,
          description: document.description || '',
          type: document.type,
        });
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: getErrorMessage(error) || 'Failed to load document',
          color: 'red',
        });
        navigate('/documents');
      } finally {
        setInitialLoading(false);
      }
    };

    loadDocument();
  }, [id]);

  const handleSubmit = async (values: DocumentFormValues) => {
    if (!id) {
      return;
    }

    setLoading(true);
    try {
      await documentsApi.updateDocument(id, {
        title: values.title,
        description: values.description,
        type: values.type,
      });

      notifications.show({
        title: 'Success',
        message: 'Document updated successfully',
        color: 'green',
      });

      navigate(`/documents/${id}`);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to update document',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <LoadingOverlay visible />;
  }

  return (
    <Container fluid>
      <PageBreadcrumbs
        items={[
          { label: 'Documents', href: '/documents' },
          { label: form.values.title || 'Document', href: `/documents/${id}` },
          { label: 'Edit' },
        ]}
      />

      <Stack gap="xl">
        <div>
          <Title order={2} mb="xs">
            Edit Document
          </Title>
          <Text size="sm" c="dimmed">
            Update document details and settings
          </Text>
        </div>

        <Paper p="xl" withBorder radius="md">
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="lg">
              <TextInput
                label="Title"
                placeholder="Enter document title"
                required
                {...form.getInputProps('title')}
              />

              <Textarea
                label="Description"
                placeholder="Enter document description (optional)"
                minRows={4}
                {...form.getInputProps('description')}
              />

              <Select
                label="Type"
                description="Public documents are visible to all users, restricted documents require explicit access"
                data={[
                  { value: 'public', label: 'Public' },
                  { value: 'restricted', label: 'Restricted' },
                ]}
                {...form.getInputProps('type')}
              />

              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => navigate(`/documents/${id}`)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  leftSection={<IconDeviceFloppy size={16} />}
                >
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
