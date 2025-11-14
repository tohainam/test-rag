import { Button, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { CreateTokenDto } from '../types';

interface CreateTokenModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateTokenDto) => void;
  loading: boolean;
}

const EXPIRATION_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
];

export function CreateTokenModal({ opened, onClose, onSubmit, loading }: CreateTokenModalProps) {
  const form = useForm<{ name: string; expiresInDays: string }>({
    initialValues: {
      name: '',
      expiresInDays: '90',
    },
    validate: {
      name: (value) => {
        if (!value.trim()) {
          return 'Token name is required';
        }
        if (value.length > 100) {
          return 'Name must be less than 100 characters';
        }
        return null;
      },
    },
  });

  const handleSubmit = (values: { name: string; expiresInDays: string }) => {
    const dto: CreateTokenDto = {
      name: values.name.trim(),
      expiresInDays: values.expiresInDays === 'never' ? null : parseInt(values.expiresInDays, 10),
    };
    onSubmit(dto);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Create Personal Access Token" size="md">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput
            label="Token Name"
            placeholder="e.g., Development API Access"
            description="A descriptive name to help you identify this token"
            required
            {...form.getInputProps('name')}
          />

          <Select
            label="Expiration"
            description="When should this token expire?"
            data={EXPIRATION_OPTIONS}
            required
            {...form.getInputProps('expiresInDays')}
          />

          <Button type="submit" loading={loading} fullWidth>
            Create Token
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
