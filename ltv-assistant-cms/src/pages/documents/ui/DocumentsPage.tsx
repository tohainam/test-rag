import { useEffect, useState } from 'react';
import { IconEdit, IconEye, IconFiles, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { Document, documentsApi } from '@/features/documents/api/documents.api';
import { getErrorMessage } from '@/shared/types';
import { EmptyState } from '@/shared/ui';

const PAGE_SIZE = 10;

export function DocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'public' | 'restricted' | null>(null);
  const [debouncedSearch] = useDebouncedValue(search, 500);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await documentsApi.getDocuments({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        type: typeFilter ?? undefined,
      });
      setDocuments(response.data);
      setTotal(response.pagination.total);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to load documents',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter]);

  useEffect(() => {
    loadDocuments();
  }, [page, debouncedSearch, typeFilter]);

  const handleDelete = (document: Document) => {
    modals.openConfirmModal({
      title: 'Delete Document',
      children: `Are you sure you want to delete "${document.title}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await documentsApi.deleteDocument(document.id);
          notifications.show({
            title: 'Success',
            message: 'Document deleted successfully',
            color: 'green',
          });
          loadDocuments();
        } catch (error) {
          notifications.show({
            title: 'Error',
            message: getErrorMessage(error) || 'Failed to delete document',
            color: 'red',
          });
        }
      },
    });
  };

  const getTypeColor = (type: string) => {
    return type === 'public' ? 'green' : 'orange';
  };

  const hasFilters = search || typeFilter;
  const showEmptyState = !loading && documents.length === 0 && !hasFilters;

  return (
    <Container fluid>
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2} mb="xs">
              Documents
            </Title>
            <Text size="sm" c="dimmed">
              Manage documents and upload files for the RAG system
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/documents/new')}>
            Create Document
          </Button>
        </Group>

        <Paper p="lg" withBorder radius="md">
          <Group mb="lg">
            <TextInput
              placeholder="Search documents..."
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <Select
              placeholder="Filter by type"
              clearable
              data={[
                { value: 'public', label: 'Public' },
                { value: 'restricted', label: 'Restricted' },
              ]}
              value={typeFilter}
              onChange={(value) =>
                setTypeFilter(value === 'public' || value === 'restricted' ? value : null)
              }
              w={200}
            />
          </Group>

          {showEmptyState ? (
            <EmptyState
              icon={<IconFiles size={32} />}
              title="No documents yet"
              description="Get started by creating your first document"
              action={{
                label: 'Create Document',
                onClick: () => navigate('/documents/new'),
              }}
            />
          ) : (
            <DataTable
              records={documents}
              columns={[
                {
                  accessor: 'title',
                  title: 'Title',
                  width: '30%',
                },
                {
                  accessor: 'description',
                  title: 'Description',
                  width: '30%',
                  ellipsis: true,
                  render: (doc) => <Text c="dimmed">{doc.description || '-'}</Text>,
                },
                {
                  accessor: 'type',
                  title: 'Type',
                  width: '10%',
                  render: (doc) => (
                    <Badge color={getTypeColor(doc.type)} size="sm" variant="light">
                      {doc.type}
                    </Badge>
                  ),
                },
                {
                  accessor: 'fileCount',
                  title: 'Files',
                  width: '8%',
                  textAlign: 'center',
                  render: (doc) => doc.fileCount || 0,
                },
                {
                  accessor: 'createdAt',
                  title: 'Created',
                  width: '10%',
                  render: (doc) => new Date(doc.createdAt).toLocaleDateString(),
                },
                {
                  accessor: 'actions',
                  title: 'Actions',
                  width: '12%',
                  textAlign: 'center',
                  render: (doc) => (
                    <Group gap="xs" justify="center">
                      <Tooltip label="View details">
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                        >
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Edit">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => navigate(`/documents/${doc.id}/edit`)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(doc)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  ),
                },
              ]}
              fetching={loading}
              totalRecords={total}
              recordsPerPage={PAGE_SIZE}
              page={page}
              onPageChange={setPage}
              withTableBorder
              withColumnBorders
              striped
              highlightOnHover
              minHeight={200}
              noRecordsText={hasFilters ? 'No documents match your search' : 'No documents found'}
            />
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
