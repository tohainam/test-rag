import { IconBrandGoogle } from '@tabler/icons-react';
import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useAuth } from '../model';

export function LoginForm() {
  const { loginWithGoogle } = useAuth();

  const handleGoogleLogin = () => {
    loginWithGoogle();
  };

  return (
    <Paper radius="md" p="xl" withBorder shadow="md" style={{ width: '100%', maxWidth: 380 }}>
      <Title order={2} ta="center" mb="md">
        Welcome back
      </Title>
      <Text c="dimmed" size="sm" ta="center" mb="xl">
        Sign in to your account
      </Text>

      <Stack gap="md">
        <Button
          leftSection={<IconBrandGoogle size={18} />}
          variant="default"
          fullWidth
          size="md"
          onClick={handleGoogleLogin}
        >
          Continue with Google
        </Button>
      </Stack>
    </Paper>
  );
}
