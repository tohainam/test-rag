import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { Alert, Button, Code, CopyButton, Group, Modal, Stack, Text } from '@mantine/core';

interface TokenCreatedModalProps {
  opened: boolean;
  onClose: () => void;
  token: string | null;
}

export function TokenCreatedModal({ opened, onClose, token }: TokenCreatedModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Token Created Successfully"
      size="lg"
      closeOnClickOutside={false}
      withCloseButton
    >
      <Stack gap="md">
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="Important">
          <Text size="sm">
            Make sure to copy your personal access token now. You won't be able to see it again!
          </Text>
        </Alert>

        {token && (
          <>
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Your Token:
              </Text>
              <Code
                block
                p="md"
                style={{
                  wordBreak: 'break-all',
                  fontSize: '0.85rem',
                }}
              >
                {token}
              </Code>
            </Stack>

            <Group justify="space-between">
              <CopyButton value={token}>
                {({ copied, copy }) => (
                  <Button
                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    color={copied ? 'teal' : 'blue'}
                    onClick={copy}
                    fullWidth
                  >
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </Button>
                )}
              </CopyButton>
            </Group>

            <Alert color="blue" variant="light">
              <Text size="sm">
                Use this token in the Authorization header of your API requests:
              </Text>
              <Code block mt="xs" p="xs">
                Authorization: Bearer {token}
              </Code>
            </Alert>
          </>
        )}

        <Button onClick={onClose} variant="default" fullWidth>
          I've Saved My Token
        </Button>
      </Stack>
    </Modal>
  );
}
