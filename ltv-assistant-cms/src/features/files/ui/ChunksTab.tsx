import { IconAlertCircle } from '@tabler/icons-react';
import { Alert, Loader, Stack, Text } from '@mantine/core';
import { ChildChunksTable } from './ChildChunksTable';
import { ParentChunksTable } from './ParentChunksTable';

interface ChunksTabProps {
  type: 'parent' | 'child';
  fileId: string;
  isIndexingComplete: boolean;
  isIndexingInProgress: boolean;
}

export function ChunksTab({
  type,
  fileId,
  isIndexingComplete,
  isIndexingInProgress,
}: ChunksTabProps) {
  if (isIndexingInProgress) {
    return (
      <Stack align="center" gap="md" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Indexing in progress... Please wait.</Text>
      </Stack>
    );
  }

  if (!isIndexingComplete) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not Indexed" color="yellow">
        This file has not been indexed yet. Chunks will be available after the indexing process
        completes.
      </Alert>
    );
  }

  return (
    <>
      {type === 'parent' && <ParentChunksTable fileId={fileId} />}
      {type === 'child' && <ChildChunksTable fileId={fileId} />}
    </>
  );
}
