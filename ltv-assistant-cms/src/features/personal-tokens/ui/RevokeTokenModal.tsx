import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { PersonalToken } from '../types';

interface RevokeTokenModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  token: PersonalToken | null;
  loading: boolean;
}

export function RevokeTokenModal({
  opened,
  onClose,
  onConfirm,
  token,
  loading,
}: RevokeTokenModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Revoke Token" size="md">
      <Stack gap="md">
        <Text>
          Are you sure you want to revoke the token <strong>{token?.name}</strong>?
        </Text>
        <Text size="sm" c="dimmed">
          Any applications or scripts using this token will no longer be able to access the API.
          This action cannot be undone.
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="red" onClick={onConfirm} loading={loading}>
            Revoke Token
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
