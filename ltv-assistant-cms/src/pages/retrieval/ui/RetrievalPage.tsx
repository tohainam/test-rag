import { IconInfoCircle } from '@tabler/icons-react';
import { Alert, Badge, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useRetrievalQuery } from '@/features/retrieval/hooks/useRetrievalQuery';
import { ContextList } from '@/features/retrieval/ui/ContextList';
import { SearchBar } from '@/features/retrieval/ui/SearchBar';

export function RetrievalPage() {
  const { execute, data, error, isLoading } = useRetrievalQuery();

  const handleSearch = (query: string, topK: number, mode: string, useCache: boolean) => {
    execute({
      query,
      topK,
      mode: mode as 'retrieval_only' | 'generation',
      useCache,
    });
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Title order={1}>Tìm kiếm Tài liệu</Title>

        <SearchBar onSearch={handleSearch} isLoading={isLoading} />

        {error && (
          <Alert icon={<IconInfoCircle size={16} />} title="Lỗi" color="red">
            {error.message || 'Đã xảy ra lỗi khi xử lý truy vấn của bạn.'}
          </Alert>
        )}

        {isLoading && (
          <Group justify="center" py="xl">
            <Loader size="lg" />
            <Text>Đang tìm kiếm tài liệu...</Text>
          </Group>
        )}

        {data && (
          <Stack gap="lg">
            {/* Results Header */}
            <Group justify="space-between">
              <Group gap="md">
                <Text fw={600} size="lg">
                  Kết quả
                </Text>
                <Badge color="blue" variant="filled">
                  {data.contexts.length} contexts
                </Badge>
                <Badge color="gray" variant="light">
                  {data.metrics.totalDuration.toFixed(0)}ms
                </Badge>
                {data.metrics.cacheHit && (
                  <Badge color="green" variant="light">
                    Cache Hit
                  </Badge>
                )}
                {!data.metrics.cacheHit && (
                  <Badge color="gray" variant="outline">
                    Cache Miss
                  </Badge>
                )}
              </Group>
            </Group>

            {/* Context List - Backend đã filter, chỉ việc hiển thị */}
            <ContextList contexts={data.contexts} />
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
