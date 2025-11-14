import { Group, NumberInput, Select, Switch, Text } from '@mantine/core';

interface AdvancedOptionsProps {
  topK: number;
  setTopK: (value: number) => void;
  mode: 'retrieval_only' | 'generation';
  setMode: (value: 'retrieval_only' | 'generation') => void;
  useCache: boolean;
  setUseCache: (value: boolean) => void;
}

export function AdvancedOptions({
  topK,
  setTopK,
  mode,
  setMode,
  useCache,
  setUseCache,
}: AdvancedOptionsProps) {
  return (
    <Group gap="md">
      <NumberInput
        label="Số kết quả"
        description="Số lượng contexts cần truy xuất"
        value={topK}
        onChange={(value) => setTopK(Number(value))}
        min={1}
        max={50}
        style={{ width: 200 }}
      />

      <Select
        label="Chế độ"
        description="Chế độ truy xuất"
        value={mode}
        onChange={(value) => setMode(value as 'retrieval_only' | 'generation')}
        data={[
          { value: 'retrieval_only', label: 'Chỉ truy xuất' },
          { value: 'generation', label: 'Sinh câu trả lời (Phase 2)' },
        ]}
        disabled
        style={{ width: 250 }}
      />

      <div style={{ width: 200 }}>
        <Text size="sm" fw={500} mb={4}>
          Sử dụng Cache
        </Text>
        <Switch
          label="Semantic caching"
          description={useCache ? 'Cache đang bật (nhanh hơn)' : 'Cache đã tắt'}
          checked={useCache}
          onChange={(event) => setUseCache(event.currentTarget.checked)}
        />
      </div>
    </Group>
  );
}
