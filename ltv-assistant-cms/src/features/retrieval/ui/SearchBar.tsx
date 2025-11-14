import { useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { Button, Group, Stack, Textarea } from '@mantine/core';
import { AdvancedOptions } from './AdvancedOptions';

interface SearchBarProps {
  onSearch: (query: string, topK: number, mode: string, useCache: boolean) => void;
  isLoading: boolean;
}

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [mode, setMode] = useState<'retrieval_only' | 'generation'>('retrieval_only');
  const [useCache, setUseCache] = useState(true); // Default: cache enabled

  const handleSubmit = () => {
    if (query.trim()) {
      onSearch(query, topK, mode, useCache);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Stack gap="md">
      <Textarea
        label="Câu truy vấn"
        placeholder="Nhập câu hỏi của bạn tại đây..."
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        minRows={3}
        autosize
        required
      />

      <AdvancedOptions
        topK={topK}
        setTopK={setTopK}
        mode={mode}
        setMode={setMode}
        useCache={useCache}
        setUseCache={setUseCache}
      />

      <Group justify="flex-end">
        <Button
          leftSection={<IconSearch size={16} />}
          onClick={handleSubmit}
          loading={isLoading}
          disabled={!query.trim() || isLoading}
        >
          Tìm kiếm
        </Button>
      </Group>
    </Stack>
  );
}
