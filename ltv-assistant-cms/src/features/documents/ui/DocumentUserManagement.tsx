import { useEffect, useState } from 'react';
import {
  IconAlertCircle,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconSearch,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { UserListItem } from '@/entities/user/model';
import { userManagementApi } from '@/features/user-management/api/user-management.api';
import { getErrorMessage } from '@/shared/types';
import { documentsApi, type DocumentUser } from '../api/documents.api';

interface DocumentUserManagementProps {
  documentId: string;
  documentType: 'public' | 'restricted';
  onClose: () => void;
}

export function DocumentUserManagement({
  documentId,
  documentType,
  onClose,
}: DocumentUserManagementProps) {
  const [documentUsers, setDocumentUsers] = useState<DocumentUser[]>([]);
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [availableSearchQuery, setAvailableSearchQuery] = useState('');
  const [selectedSearchQuery, setSelectedSearchQuery] = useState('');
  const [_debouncedAvailableSearch] = useDebouncedValue(availableSearchQuery, 300);
  const [_debouncedSelectedSearch] = useDebouncedValue(selectedSearchQuery, 300);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedAvailable, setSelectedAvailable] = useState<Set<number>>(new Set());
  const [selectedGranted, setSelectedGranted] = useState<Set<string>>(new Set());
  const [addingSelected, setAddingSelected] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [removingSelected, setRemovingSelected] = useState(false);
  const [removingAll, setRemovingAll] = useState(false);

  useEffect(() => {
    loadDocumentUsers();
    loadAllUsers();
  }, [documentId]);

  const loadDocumentUsers = async () => {
    setLoading(true);
    try {
      const users = await documentsApi.getDocumentUsers(documentId);
      setDocumentUsers(users);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to load document users',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await userManagementApi.getUsers({ page: 1, limit: 1000 });
      setAllUsers(response.data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load users',
        color: 'red',
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  // Filter available users (all users minus already granted users)
  const availableUsers = allUsers.filter((user) => {
    const existingUserIds = documentUsers.map((u) => u.userId);
    const matchesSearch =
      availableSearchQuery.trim() === '' ||
      user.name.toLowerCase().includes(availableSearchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(availableSearchQuery.toLowerCase());
    return !existingUserIds.includes(String(user.id)) && matchesSearch;
  });

  // Filter selected users based on search
  const filteredSelectedUsers = documentUsers.filter((user) => {
    const matchesSearch =
      selectedSearchQuery.trim() === '' ||
      user.userName.toLowerCase().includes(selectedSearchQuery.toLowerCase()) ||
      user.userEmail.toLowerCase().includes(selectedSearchQuery.toLowerCase());
    return matchesSearch;
  });

  const handleAddSelected = async () => {
    if (selectedAvailable.size === 0) {
      return;
    }

    setAddingSelected(true);
    try {
      const usersToAdd = Array.from(selectedAvailable);

      // Add all users and collect results
      const results = await Promise.allSettled(
        usersToAdd.map((userId) =>
          documentsApi.addUserToDocument(documentId, {
            userId: String(userId),
          })
        )
      );

      // Collect successful additions
      const addedUsers = results
        .filter((r): r is PromiseFulfilledResult<DocumentUser> => r.status === 'fulfilled')
        .map((r) => r.value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;

      // Update state once with all new users
      if (addedUsers.length > 0) {
        setDocumentUsers((prev) => [...prev, ...addedUsers]);
      }

      setSelectedAvailable(new Set());

      if (failedCount > 0) {
        notifications.show({
          title: 'Partial Success',
          message: `${addedUsers.length} user(s) added, ${failedCount} failed`,
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Success',
          message: `${addedUsers.length} user(s) added to document`,
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to add users',
        color: 'red',
      });
    } finally {
      setAddingSelected(false);
    }
  };

  const handleAddAll = async () => {
    if (availableUsers.length === 0) {
      return;
    }

    setAddingAll(true);
    try {
      // Add all users and collect results
      const results = await Promise.allSettled(
        availableUsers.map((user) =>
          documentsApi.addUserToDocument(documentId, {
            userId: String(user.id),
          })
        )
      );

      // Collect successful additions
      const addedUsers = results
        .filter((r): r is PromiseFulfilledResult<DocumentUser> => r.status === 'fulfilled')
        .map((r) => r.value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;

      // Update state once with all new users
      if (addedUsers.length > 0) {
        setDocumentUsers((prev) => [...prev, ...addedUsers]);
      }

      setSelectedAvailable(new Set());

      if (failedCount > 0) {
        notifications.show({
          title: 'Partial Success',
          message: `${addedUsers.length} user(s) added, ${failedCount} failed`,
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Success',
          message: 'All users added to document',
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to add all users',
        color: 'red',
      });
    } finally {
      setAddingAll(false);
    }
  };

  const handleRemoveSelected = async () => {
    if (selectedGranted.size === 0) {
      return;
    }

    setRemovingSelected(true);
    try {
      const usersToRemove = Array.from(selectedGranted);

      // Remove all users and collect results
      const results = await Promise.allSettled(
        usersToRemove.map((userId) => documentsApi.removeUserFromDocument(documentId, userId))
      );

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;

      // Update state once - remove successfully removed users
      if (successCount > 0) {
        setDocumentUsers((prev) => prev.filter((user) => !usersToRemove.includes(user.userId)));
      }

      setSelectedGranted(new Set());

      if (failedCount > 0) {
        notifications.show({
          title: 'Partial Success',
          message: `${successCount} user(s) removed, ${failedCount} failed`,
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Success',
          message: `${successCount} user(s) removed from document`,
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to remove users',
        color: 'red',
      });
    } finally {
      setRemovingSelected(false);
    }
  };

  const handleRemoveAll = async () => {
    if (documentUsers.length === 0) {
      return;
    }

    setRemovingAll(true);
    try {
      // Remove all users and collect results
      const results = await Promise.allSettled(
        documentUsers.map((user) => documentsApi.removeUserFromDocument(documentId, user.userId))
      );

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;

      // Update state once
      if (successCount > 0) {
        setDocumentUsers([]);
        setSelectedGranted(new Set());
      }

      if (failedCount > 0) {
        notifications.show({
          title: 'Partial Success',
          message: `${successCount} user(s) removed, ${failedCount} failed`,
          color: 'yellow',
        });
      } else {
        notifications.show({
          title: 'Success',
          message: 'All users removed from document',
          color: 'green',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: getErrorMessage(error) || 'Failed to remove all users',
        color: 'red',
      });
    } finally {
      setRemovingAll(false);
    }
  };

  const toggleAvailableUser = (userId: number) => {
    setSelectedAvailable((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleGrantedUser = (userId: string) => {
    setSelectedGranted((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  if (documentType !== 'restricted') {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Not Available" color="blue">
        <Text>User access management is only available for restricted documents.</Text>
        <Group mt="md">
          <Button onClick={onClose}>Close</Button>
        </Group>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Dual List Selector */}
      <Group align="flex-start" gap="md" wrap="nowrap">
        {/* Available Users */}
        <Paper withBorder style={{ flex: 1 }}>
          <Box p="md" style={{ backgroundColor: '#f8f9fa' }}>
            <Text fw={600} size="sm">
              Available ({availableUsers.length})
            </Text>
          </Box>
          <Divider />
          <Box p="xs">
            <TextInput
              placeholder="Search available users..."
              leftSection={<IconSearch size={16} />}
              value={availableSearchQuery}
              onChange={(e) => setAvailableSearchQuery(e.currentTarget.value)}
              size="xs"
            />
          </Box>
          <Divider />
          <ScrollArea h={400}>
            {loadingUsers ? (
              <Group justify="center" p="xl">
                <Loader size="sm" />
              </Group>
            ) : availableUsers.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" p="xl">
                {availableSearchQuery.trim() ? 'No users found' : 'All users have been added'}
              </Text>
            ) : (
              <Stack gap={0}>
                {availableUsers.map((user) => (
                  <Box
                    key={user.id}
                    p="md"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedAvailable.has(user.id) ? '#e7f5ff' : 'transparent',
                      borderBottom: '1px solid #dee2e6',
                    }}
                    onClick={() => toggleAvailableUser(user.id)}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar size="md" radius="xl" color="cyan">
                        {user.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {user.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {user.email}
                        </Text>
                      </div>
                    </Group>
                  </Box>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Paper>

        {/* Control Buttons */}
        <Stack gap="xs" justify="center" style={{ paddingTop: 100 }}>
          <ActionIcon
            size="lg"
            variant="light"
            color="cyan"
            onClick={handleAddSelected}
            disabled={
              selectedAvailable.size === 0 ||
              addingSelected ||
              addingAll ||
              removingSelected ||
              removingAll
            }
            loading={addingSelected}
          >
            <IconChevronRight size={20} />
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="light"
            color="cyan"
            onClick={handleAddAll}
            disabled={
              availableUsers.length === 0 ||
              addingSelected ||
              addingAll ||
              removingSelected ||
              removingAll
            }
            loading={addingAll}
          >
            <IconChevronsRight size={20} />
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="light"
            color="red"
            onClick={handleRemoveSelected}
            disabled={
              selectedGranted.size === 0 ||
              addingSelected ||
              addingAll ||
              removingSelected ||
              removingAll
            }
            loading={removingSelected}
          >
            <IconChevronLeft size={20} />
          </ActionIcon>
          <ActionIcon
            size="lg"
            variant="light"
            color="red"
            onClick={handleRemoveAll}
            disabled={
              documentUsers.length === 0 ||
              addingSelected ||
              addingAll ||
              removingSelected ||
              removingAll
            }
            loading={removingAll}
          >
            <IconChevronsLeft size={20} />
          </ActionIcon>
        </Stack>

        {/* Selected/Granted Users */}
        <Paper withBorder style={{ flex: 1 }}>
          <Box p="md" style={{ backgroundColor: '#f8f9fa' }}>
            <Text fw={600} size="sm">
              Selected ({filteredSelectedUsers.length})
            </Text>
          </Box>
          <Divider />
          <Box p="xs">
            <TextInput
              placeholder="Search selected users..."
              leftSection={<IconSearch size={16} />}
              value={selectedSearchQuery}
              onChange={(e) => setSelectedSearchQuery(e.currentTarget.value)}
              size="xs"
            />
          </Box>
          <Divider />
          <ScrollArea h={400}>
            {loading ? (
              <Group justify="center" p="xl">
                <Loader size="sm" />
              </Group>
            ) : filteredSelectedUsers.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" p="xl">
                {selectedSearchQuery.trim()
                  ? 'No users found'
                  : 'No users have been granted access'}
              </Text>
            ) : (
              <Stack gap={0}>
                {filteredSelectedUsers.map((user) => (
                  <Box
                    key={user.id}
                    p="md"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedGranted.has(user.userId) ? '#fff5f5' : 'transparent',
                      borderBottom: '1px solid #dee2e6',
                    }}
                    onClick={() => toggleGrantedUser(user.userId)}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar size="md" radius="xl" color="blue">
                        {user.userName.charAt(0).toUpperCase()}
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={500} truncate>
                          {user.userName}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {user.userEmail}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Added: {new Date(user.grantedAt).toLocaleDateString()}
                        </Text>
                      </div>
                    </Group>
                  </Box>
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Paper>
      </Group>

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Close
        </Button>
      </Group>
    </Stack>
  );
}
