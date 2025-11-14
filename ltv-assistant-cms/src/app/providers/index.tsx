import '@mantine/core/styles.layer.css';
import '@mantine/notifications/styles.layer.css';
import 'mantine-datatable/styles.layer.css';

import { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { AuthProvider } from '@/features/auth/model';
import { theme } from '@/shared/config';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <ModalsProvider>
        <AuthProvider>{children}</AuthProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}
