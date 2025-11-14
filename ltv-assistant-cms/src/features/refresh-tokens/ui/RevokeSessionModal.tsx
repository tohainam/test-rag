import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { RefreshToken } from '../types';

interface RevokeSessionModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  token: RefreshToken | null;
  loading: boolean;
}

export function RevokeSessionModal({
  opened,
  onClose,
  onConfirm,
  loading,
}: RevokeSessionModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Revoke Session" size="md">
      <Stack gap="md">
        <Text>Are you sure you want to revoke this session?</Text>
        <Text size="sm" c="dimmed">
          The user will be logged out from this device and will need to sign in again. This action
          cannot be undone.
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            Revoke Session
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
