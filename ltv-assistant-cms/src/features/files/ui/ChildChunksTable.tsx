import { useEffect, useState } from 'react';
import { IconEye } from '@tabler/icons-react';
import { DataTable } from 'mantine-datatable';
import { ActionIcon, Badge, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { filesApi, type ChildChunk } from '@/features/files/api/files.api';
import { getErrorMessage } from '@/shared/types';
import { ChunkMetadataDrawer } from './ChunkMetadataDrawer';

interface ChildChunksTableProps {
  fileId: string;
}

const PAGE_SIZE = 50;

export function ChildChunksTable({ fileId }: ChildChunksTableProps) {
  const [chunks, setChunks] = useState<ChildChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedChunk, setSelectedChunk] = useState<ChildChunk | null>(null);
  const [drawerOpened, setDrawerOpened] = useState(false);

  const loadChunks = async (currentPage: number) => {
    try {
      setLoading(true);
      const response = await filesApi.getChildChunks(fileId, currentPage, PAGE_SIZE);

      if (response.success) {
        setChunks(response.chunks);
        setTotal(response.total);
      } else {
        notifications.show({
          title: 'Error',
          message: 'Failed to load child chunks',
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to load child chunks',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChunks(page);
  }, [fileId, page]);

  const handleViewMetadata = (chunk: ChildChunk) => {
    setSelectedChunk(chunk);
    setDrawerOpened(true);
  };

  const truncateText = (text: string | null | undefined, maxLength: number = 100): string => {
    if (!text) {
      return '';
    }
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.substring(0, maxLength)}...`;
  };

  return (
    <>
      <DataTable
        columns={[
          {
            accessor: 'chunkIndex',
            title: 'Child Index',
            width: 100,
            render: (chunk) => (
              <Badge variant="light" color="cyan">
                #{chunk.chunkIndex}
              </Badge>
            ),
          },
          {
            accessor: 'parentChunkIndex',
            title: 'Parent Index',
            width: 110,
            render: (chunk) => (
              <Badge variant="light" color="blue">
                #{chunk.parentChunkIndex ?? 'N/A'}
              </Badge>
            ),
          },
          {
            accessor: 'content',
            title: 'Content',
            render: (chunk) => (
              <Text size="sm" lineClamp={2}>
                {truncateText(chunk.content, 200)}
              </Text>
            ),
          },
          {
            accessor: 'metadata.sectionPath',
            title: 'Section Path',
            width: 200,
            render: (chunk) => (
              <Text size="sm" c="dimmed" lineClamp={1}>
                {chunk.metadata.sectionPath || 'N/A'}
              </Text>
            ),
          },
          {
            accessor: 'tokens',
            title: 'Tokens',
            width: 100,
            textAlign: 'right',
            render: (chunk) => (
              <Text size="sm" fw={500}>
                {chunk.tokens.toLocaleString()}
              </Text>
            ),
          },
          {
            accessor: 'metadata.pageNumber',
            title: 'Page',
            width: 80,
            textAlign: 'center',
            render: (chunk) => <Text size="sm">{chunk.metadata.pageNumber ?? '-'}</Text>,
          },
          {
            accessor: 'metadata.isOnlyChild',
            title: 'Only Child',
            width: 100,
            textAlign: 'center',
            render: (chunk) =>
              chunk.metadata.isOnlyChild ? (
                <Badge size="sm" color="gray" variant="outline">
                  Only
                </Badge>
              ) : null,
          },
          {
            accessor: 'actions',
            title: 'Actions',
            width: 80,
            textAlign: 'center',
            render: (chunk) => (
              <Tooltip label="View metadata">
                <ActionIcon variant="subtle" color="blue" onClick={() => handleViewMetadata(chunk)}>
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>
            ),
          },
        ]}
        records={chunks}
        fetching={loading}
        totalRecords={total}
        recordsPerPage={PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        minHeight={200}
        noRecordsText="No child chunks found"
        highlightOnHover
        onRowClick={({ record }) => handleViewMetadata(record)}
      />

      {selectedChunk && (
        <ChunkMetadataDrawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          chunk={selectedChunk}
          chunkType="child"
        />
      )}
    </>
  );
}
