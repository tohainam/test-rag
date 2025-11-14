import { Badge, Code, Divider, Drawer, Group, ScrollArea, Stack, Text } from '@mantine/core';
import type { ChildChunk, ParentChunk } from '@/features/files/api/files.api';

interface ChunkMetadataDrawerProps {
  opened: boolean;
  onClose: () => void;
  chunk: ParentChunk | ChildChunk;
  chunkType: 'parent' | 'child';
}

export function ChunkMetadataDrawer({
  opened,
  onClose,
  chunk,
  chunkType,
}: ChunkMetadataDrawerProps) {
  const isChildChunk = (c: ParentChunk | ChildChunk): c is ChildChunk => {
    return 'parentChunkId' in c;
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>Chunk Metadata</Text>
          <Badge color={chunkType === 'parent' ? 'blue' : 'cyan'}>
            {chunkType === 'parent' ? 'Parent' : 'Child'} #{chunk.chunkIndex}
          </Badge>
        </Group>
      }
      position="right"
      size="xl"
    >
      <Stack gap="lg">
        {/* Basic Information */}
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
            Basic Information
          </Text>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Chunk ID
              </Text>
              <Code>{chunk.id}</Code>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Chunk Index
              </Text>
              <Badge>{chunk.chunkIndex}</Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Tokens
              </Text>
              <Text size="sm" fw={600}>
                {chunk.tokens.toLocaleString()}
              </Text>
            </Group>
            {isChildChunk(chunk) && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Parent Chunk ID
                </Text>
                <Code>{chunk.parentChunkId}</Code>
              </Group>
            )}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Created At
              </Text>
              <Text size="sm">{new Date(chunk.createdAt).toLocaleString()}</Text>
            </Group>
          </Stack>
        </div>

        <Divider />

        {/* Content */}
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
            Content
          </Text>
          <ScrollArea h={200} type="auto">
            <Text size="sm">{chunk.content}</Text>
          </ScrollArea>
        </div>

        <Divider />

        {/* Section Information */}
        {chunk.metadata.sectionPath && (
          <>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                Section Information
              </Text>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Section Path
                  </Text>
                  <Text size="sm" fw={500}>
                    {chunk.metadata.sectionPath}
                  </Text>
                </Group>
                {chunk.metadata.sectionLevel !== undefined && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Section Level
                    </Text>
                    <Badge size="sm">{chunk.metadata.sectionLevel}</Badge>
                  </Group>
                )}
                {chunk.metadata.sectionId && (
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Section ID
                    </Text>
                    <Code>{chunk.metadata.sectionId}</Code>
                  </Group>
                )}
              </Stack>
            </div>
            <Divider />
          </>
        )}

        {/* Position Information */}
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
            Position Information
          </Text>
          <Stack gap="sm">
            {chunk.metadata.pageNumber !== undefined && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Page Number
                </Text>
                <Text size="sm" fw={500}>
                  {chunk.metadata.pageNumber}
                </Text>
              </Group>
            )}
            {chunk.metadata.offsetStart !== undefined && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Offset Start
                </Text>
                <Text size="sm">{chunk.metadata.offsetStart}</Text>
              </Group>
            )}
            {chunk.metadata.offsetEnd !== undefined && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Offset End
                </Text>
                <Text size="sm">{chunk.metadata.offsetEnd}</Text>
              </Group>
            )}
            {chunk.metadata.isOnlyChild && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Only Child
                </Text>
                <Badge color="gray" variant="outline">
                  Yes
                </Badge>
              </Group>
            )}
          </Stack>
        </div>

        {/* Entities */}
        {chunk.metadata.entities && chunk.metadata.entities.length > 0 && (
          <>
            <Divider />
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                Extracted Entities ({chunk.metadata.entities.length})
              </Text>
              <Stack gap="xs">
                {chunk.metadata.entities.map((entity, index) => (
                  <Group key={index} gap="xs">
                    <Badge size="sm" variant="light">
                      {entity.type}
                    </Badge>
                    <Text size="sm">{entity.text}</Text>
                  </Group>
                ))}
              </Stack>
            </div>
          </>
        )}

        {/* Keywords */}
        {chunk.metadata.keywords && chunk.metadata.keywords.length > 0 && (
          <>
            <Divider />
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                Keywords ({chunk.metadata.keywords.length})
              </Text>
              <Group gap="xs">
                {chunk.metadata.keywords.map((keyword, index) => (
                  <Badge key={index} size="sm" variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </Group>
            </div>
          </>
        )}

        {/* Summary (Parent only) */}
        {chunk.metadata.summary && chunkType === 'parent' && (
          <>
            <Divider />
            <div>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                Summary
              </Text>
              <Text
                size="sm"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                  wordBreak: 'break-word',
                }}
              >
                {chunk.metadata.summary}
              </Text>
            </div>
          </>
        )}

        {/* Hypothetical Questions (Parent only) */}
        {chunk.metadata.hypotheticalQuestions &&
          chunk.metadata.hypotheticalQuestions.length > 0 &&
          chunkType === 'parent' && (
            <>
              <Divider />
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                  Hypothetical Questions ({chunk.metadata.hypotheticalQuestions.length})
                </Text>
                <Stack gap="xs">
                  {chunk.metadata.hypotheticalQuestions.map((question, index) => (
                    <Text key={index} size="sm">
                      {index + 1}. {question}
                    </Text>
                  ))}
                </Stack>
              </div>
            </>
          )}

        {/* Raw Metadata JSON */}
        <Divider />
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
            Raw Metadata (JSON)
          </Text>
          <ScrollArea h={300} type="auto">
            <Code block>{JSON.stringify(chunk.metadata, null, 2)}</Code>
          </ScrollArea>
        </div>
      </Stack>
    </Drawer>
  );
}
