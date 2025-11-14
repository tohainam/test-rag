import { IconChevronDown, IconLogout, IconMoon, IconSun } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Avatar,
  Burger,
  Group,
  Menu,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useAuth } from '@/features/auth/model';
import { ROUTES } from '@/shared/config';

interface HeaderProps {
  onToggleMobile: () => void;
  onToggleDesktop: () => void;
}

export function Header({ onToggleMobile, onToggleDesktop }: HeaderProps) {
  const { user, logout } = useAuth();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 48em)');

  const handleLogout = async () => {
    await logout();
    navigate(ROUTES.LOGIN);
  };

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Burger
          opened={false}
          onClick={isMobile ? onToggleMobile : onToggleDesktop}
          size="sm"
          aria-label="Toggle navigation"
        />
        <Text size="xl" fw={700} c="blue">
          LTV Assistant
        </Text>
      </Group>

      <Group gap="xs">
        <ActionIcon
          variant="default"
          onClick={() => toggleColorScheme()}
          size="lg"
          aria-label="Toggle color scheme"
        >
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>

        <Menu shadow="md" width={200}>
          <Menu.Target>
            <UnstyledButton>
              <Group gap="xs">
                <Avatar color="blue" radius="xl">
                  {user?.name?.charAt(0).toUpperCase()}
                </Avatar>
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {user?.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {user?.email}
                  </Text>
                </div>
                <IconChevronDown size={16} />
              </Group>
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item leftSection={<IconLogout size={14} />} onClick={handleLogout}>
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
