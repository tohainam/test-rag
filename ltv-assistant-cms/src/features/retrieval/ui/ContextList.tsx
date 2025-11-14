import { Stack, Text } from '@mantine/core';
import type { Context } from '../types';
import { ContextCard } from './ContextCard';

interface ContextListProps {
  contexts: Context[];
}

export function ContextList({ contexts }: ContextListProps) {
  if (contexts.length === 0) {
    return (
      <Text c="dimmed" ta="center" mt="xl">
        Không tìm thấy kết quả. Thử với câu truy vấn khác.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      {contexts.map((context, index) => (
        <ContextCard key={context.parentChunkId} context={context} index={index} />
      ))}
    </Stack>
  );
}
