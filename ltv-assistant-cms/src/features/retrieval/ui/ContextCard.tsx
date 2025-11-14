import { useState } from 'react';
import { IconFile } from '@tabler/icons-react';
import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import type { Context } from '../types';

interface ContextCardProps {
  context: Context;
  index: number;
}

export function ContextCard({ context, index }: ContextCardProps) {
  const [showFullContent, setShowFullContent] = useState(false);

  const contentPreview = context.content.slice(0, 300);
  const hasMore = context.content.length > 300;

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.8) {
      return 'green';
    }
    if (score >= 0.6) {
      return 'blue';
    }
    return 'orange';
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Group>
            <IconFile size={20} />
            <Text fw={600} size="lg">
              Context {index + 1}
            </Text>
          </Group>
          <Badge color={getScoreBadgeColor(context.score)} variant="filled">
            Điểm: {context.score.toFixed(3)}
          </Badge>
        </Group>

        {/* Metadata */}
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            <strong>Tài liệu:</strong> {context.metadata.documentTitle || 'Không rõ'}
          </Text>
          {context.metadata.sectionPath && context.metadata.sectionPath.length > 0 && (
            <Text size="sm" c="dimmed">
              <strong>Mục:</strong> {context.metadata.sectionPath.join(' > ')}
            </Text>
          )}
          <Text size="sm" c="dimmed">
            <strong>Tokens:</strong> {context.tokens.toLocaleString()}
          </Text>
        </Stack>

        {/* Content */}
        <Stack gap="xs">
          <Text fw={500}>Nội dung:</Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {showFullContent ? context.content : contentPreview}
            {hasMore && !showFullContent && '...'}
          </Text>
          {hasMore && (
            <Button variant="subtle" size="xs" onClick={() => setShowFullContent(!showFullContent)}>
              {showFullContent ? 'Thu gọn' : 'Xem thêm'}
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
