import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Container,
  Group,
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
import { CreateDocumentDto, documentsApi } from '@/features/documents/api/documents.api';
import { getErrorMessage } from '@/shared/types';
import { PageBreadcrumbs } from '@/shared/ui';

export function CreateDocumentPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const form = useForm<CreateDocumentDto>({
    initialValues: {
      title: '',
      description: '',
      type: 'public',
    },
    validate: {
      title: (value) => (!value ? 'Title is required' : null),
    },
  });

  const handleSubmit = async (values: CreateDocumentDto) => {
    setLoading(true);
    try {
      const document = await documentsApi.createDocument(values);
      notifications.show({
        title: 'Success',
        message: 'Document created successfully',
        color: 'green',
      });
      navigate(`/documents/${document.id}`);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to create document',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container fluid>
      <PageBreadcrumbs
        items={[{ label: 'Documents', href: '/documents' }, { label: 'Create Document' }]}
      />

      <Stack gap="xl">
        <div>
          <Title order={2} mb="xs">
            Create Document
          </Title>
          <Text size="sm" c="dimmed">
            Create a new document to upload files for the RAG system
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
                required
                data={[
                  { value: 'public', label: 'Public' },
                  { value: 'restricted', label: 'Restricted' },
                ]}
                {...form.getInputProps('type')}
              />

              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={() => navigate('/documents')}>
                  Cancel
                </Button>
                <Button type="submit" loading={loading}>
                  Create Document
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
