import { ReactNode } from 'react';
import { IconInboxOff } from '@tabler/icons-react';
import { Button, Stack, Text, ThemeIcon } from '@mantine/core';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Stack align="center" gap="md" py="xl">
      <ThemeIcon size={64} radius="xl" variant="light" color="gray">
        {icon || <IconInboxOff size={32} />}
      </ThemeIcon>

      <div style={{ textAlign: 'center' }}>
        <Text fw={600} size="lg" mb="xs">
          {title}
        </Text>
        {description && (
          <Text c="dimmed" size="sm">
            {description}
          </Text>
        )}
      </div>

      {action && (
        <Button onClick={action.onClick} mt="sm">
          {action.label}
        </Button>
      )}
    </Stack>
  );
}
