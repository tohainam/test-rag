import { useEffect, useState } from 'react';
import { IconDevices, IconKey, IconSearch } from '@tabler/icons-react';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Group, Select, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { UserRole } from '@/entities/user/model';
import { userManagementApi } from '../api/user-management.api';
import type { UserListItem } from '../model/types';

const PAGE_SIZE = 10;

const getRoleBadgeColor = (role: UserRole) => {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'red';
    case UserRole.ADMIN:
      return 'blue';
    case UserRole.USER:
      return 'gray';
    default:
      return 'gray';
  }
};

export function UserManagementTable() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<UserListItem>>({
    columnAccessor: 'createdAt',
    direction: 'desc',
  });

  // Debounce search value by 500ms to avoid calling API on every keystroke
  const [debouncedSearch] = useDebouncedValue(search, 500);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await userManagementApi.getUsers({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        sortBy: sortStatus.columnAccessor,
        sortOrder: sortStatus.direction,
      });
      setUsers(response.data);
      setTotal(response.meta.total);
    } catch (error) {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, debouncedSearch, roleFilter, sortStatus]);

  const handleRoleChange = async (userId: number, newRole: UserRole) => {
    try {
      await userManagementApi.updateUserRole(userId, newRole);
      await fetchUsers();
    } catch (error) {
      // Handle error silently
    }
  };

  const canChangeRole = (user: UserListItem): boolean => {
    // Cannot change role for super admins
    if (user.role === UserRole.SUPER_ADMIN) {
      return false;
    }
    return true;
  };

  return (
    <>
      <Group mb="md" gap="md">
        <TextInput
          placeholder="Search by name or email..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filter by role"
          data={[
            { value: '', label: 'All Roles' },
            { value: UserRole.SUPER_ADMIN, label: 'Super Admin' },
            { value: UserRole.ADMIN, label: 'Admin' },
            { value: UserRole.USER, label: 'User' },
          ]}
          value={roleFilter}
          onChange={(value) => {
            setRoleFilter((value as UserRole) || '');
            setPage(1);
          }}
          clearable
          style={{ minWidth: 200 }}
        />
      </Group>

      <DataTable
        withTableBorder
        withColumnBorders
        striped
        highlightOnHover
        records={users}
        columns={[
          {
            accessor: 'name',
            title: 'Name',
            sortable: true,
          },
          {
            accessor: 'email',
            title: 'Email',
            sortable: true,
          },
          {
            accessor: 'role',
            title: 'Role',
            sortable: true,
            render: (user) => {
              const isEditable = canChangeRole(user);

              if (!isEditable) {
                return (
                  <Badge color={getRoleBadgeColor(user.role)} variant="filled">
                    {user.role}
                  </Badge>
                );
              }

              return (
                <Select
                  value={user.role}
                  onChange={(value) => {
                    if (value) {
                      handleRoleChange(user.id, value as UserRole);
                    }
                  }}
                  data={[
                    { value: UserRole.ADMIN, label: 'Admin' },
                    { value: UserRole.USER, label: 'User' },
                  ]}
                  size="xs"
                  styles={{ input: { minWidth: 120 } }}
                />
              );
            },
          },
          {
            accessor: 'createdAt',
            title: 'Created At',
            sortable: true,
            render: (user) => new Date(user.createdAt).toLocaleDateString(),
          },
          {
            accessor: 'actions',
            title: 'Actions',
            textAlign: 'center',
            render: (user) => {
              // Only show token management for non-super-admin users
              if (user.role === UserRole.SUPER_ADMIN) {
                return null;
              }

              return (
                <Group gap="xs" justify="center">
                  <Tooltip label="Manage Personal Access Tokens">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconKey size={14} />}
                      onClick={() => navigate(`/users/${user.id}/tokens`)}
                    >
                      Tokens
                    </Button>
                  </Tooltip>
                  <Tooltip label="Manage Sessions">
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconDevices size={14} />}
                      onClick={() => navigate(`/users/${user.id}/sessions`)}
                    >
                      Sessions
                    </Button>
                  </Tooltip>
                </Group>
              );
            },
          },
        ]}
        totalRecords={total}
        recordsPerPage={PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        fetching={loading}
        noRecordsText="No users found"
      />
    </>
  );
}
