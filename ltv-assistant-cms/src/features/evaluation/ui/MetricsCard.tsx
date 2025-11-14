/**
 * MetricsCard Component
 * Displays a single metric with optional progress bar
 */

import { Badge, Card, Group, Progress, Stack, Text } from '@mantine/core';

interface MetricsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  showProgress?: boolean;
  progressValue?: number;
  color?: string;
  badge?: string;
  badgeColor?: string;
}

export const MetricsCard = ({
  title,
  value,
  subtitle,
  showProgress = false,
  progressValue = 0,
  color = 'blue',
  badge,
  badgeColor,
}: MetricsCardProps) => {
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Text size="sm" c="dimmed" fw={500}>
            {title}
          </Text>
          {badge && (
            <Badge color={badgeColor || color} variant="light" size="sm">
              {badge}
            </Badge>
          )}
        </Group>

        <Text size="xl" fw={700} c={color}>
          {typeof value === 'number' ? value.toFixed(3) : value}
        </Text>

        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}

        {showProgress && (
          <Progress value={progressValue * 100} color={color} size="sm" radius="xl" animated />
        )}
      </Stack>
    </Card>
  );
};
