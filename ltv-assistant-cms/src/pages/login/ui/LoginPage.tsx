import { Box, Center, Container } from '@mantine/core';
import { LoginForm } from '@/features/auth/ui';

export function LoginPage() {
  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Container size="xs">
        <Center>
          <LoginForm />
        </Center>
      </Container>
    </Box>
  );
}
