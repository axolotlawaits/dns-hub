import { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Title,
  Table,
  Button,
  Group,
  ActionIcon,
  Tooltip,
  Badge,
  Stack,
  Alert,
  Text,
  ScrollArea,
  Pagination,
  Box,
} from '@mantine/core';
import { IconEdit, IconTrash, IconPlus, IconAlertCircle, IconUsers, IconLogin } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { ColumnFiltersState } from '@tanstack/react-table';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  position?: string;
  group?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function UsersManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [, setDeleteModalOpened] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API}/admin/users?page=${page}&limit=${pageSize}`);
      if (response && response.ok) {
        const data = await response.json();
        // API возвращает { success: true, data: [...], pagination: {...} }
        setUsers(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotal(data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Ошибка загрузки пользователей');
      setUsers([]); // Устанавливаем пустой массив при ошибке
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setModalOpened(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setModalOpened(true);
  };

  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setDeleteModalOpened(true);
  };

  const handleLoginAs = async (user: User) => {
    try {
      // Сохраняем текущий токен и данные администратора перед входом под пользователем
      const currentToken = localStorage.getItem('token');
      const currentUser = localStorage.getItem('user');
      if (currentToken) {
        localStorage.setItem('adminToken', currentToken);
      }
      if (currentUser) {
        localStorage.setItem('adminUser', currentUser);
      }

      const response = await authFetch(`${API}/admin/users/${user.id}/login-as`, {
        method: 'POST',
      });
      if (response && response.ok) {
        const data = await response.json();
        // Сохраняем токены и данные нового пользователя
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Проверяем токен для отладки
        try {
          const base64Url = data.token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const tokenData = JSON.parse(jsonPayload);
          console.log('[UsersManagement] Token after login-as:', tokenData);
          console.log('[UsersManagement] impersonatedBy:', tokenData?.impersonatedBy);
        } catch (e) {
          console.error('[UsersManagement] Error decoding token:', e);
        }
        
        // Перезагружаем страницу для применения нового токена
        window.location.href = '/';
      } else {
        const error = await response?.json();
        setError(error?.error || 'Не удалось войти как пользователь');
      }
    } catch (error) {
      console.error('Error logging in as user:', error);
      setError('Не удалось войти как пользователь');
    }
  };

  const handleSave = async (formData: any) => {
    try {
      setError(null);
      if (selectedUser) {
        // Обновление
        const response = await authFetch(`${API}/admin/users/${selectedUser.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchUsers();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка обновления пользователя');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/admin/users`, {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchUsers();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка создания пользователя');
        }
      }
    } catch (error) {
      console.error('Error saving user:', error);
      setError('Ошибка сохранения пользователя');
    }
  };

  const _handleConfirmDelete = async () => {
    if (!selectedUser) return;

    try {
      setError(null);
      const response = await authFetch(`${API}/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
      });
      if (response && response.ok) {
        await fetchUsers();
        setDeleteModalOpened(false);
        setSelectedUser(null);
      } else {
        const errorData = await response?.json();
        setError(errorData?.error || 'Ошибка удаления пользователя');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Ошибка удаления пользователя');
    }
  };

  const formFields = useMemo(() => [
    {
      name: 'name',
      label: 'Имя',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'email',
      label: 'Email',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'role',
      label: 'Роль',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'EMPLOYEE', label: 'Сотрудник' },
        { value: 'ADMIN', label: 'Администратор' },
        { value: 'DEVELOPER', label: 'Разработчик' },
      ],
    },
    {
      name: 'position',
      label: 'Должность',
      type: 'text' as const,
      required: false,
    },
    {
      name: 'group',
      label: 'Группа',
      type: 'text' as const,
      required: false,
    },
    {
      name: 'isActive',
      label: 'Активен',
      type: 'boolean' as const,
      required: false,
    },
  ], []);

  const initialValues = useMemo(() => selectedUser ? {
    name: selectedUser.name,
    email: selectedUser.email,
    role: selectedUser.role,
    position: selectedUser.position || '',
    group: selectedUser.group || '',
    isActive: selectedUser.isActive,
  } : undefined, [selectedUser]);

  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];
  const roleFilter = columnFilters.find(f => f.id === 'role')?.value as string[] || [];

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
      if (nameSearch && !user.name.toLowerCase().includes(nameSearch) && !user.email.toLowerCase().includes(nameSearch)) return false;
      if (roleFilter.length > 0 && !roleFilter.includes(user.role)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, nameFilter, roleFilter]);

  const handleColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== columnId);
      if (value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
        return [...filtered, { id: columnId, value }];
      }
      return filtered;
    });
  };

  const filterConfig = useMemo(() => [
    {
      type: 'text' as const,
      columnId: 'name',
      label: 'Имя/Email',
      placeholder: 'Поиск по имени или email...',
    },
    {
      type: 'select' as const,
      columnId: 'role',
      label: 'Роль',
      placeholder: 'Выберите роли',
      options: [
        { value: 'EMPLOYEE', label: 'Сотрудник' },
        { value: 'ADMIN', label: 'Администратор' },
        { value: 'DEVELOPER', label: 'Разработчик' },
      ],
    },
  ], []);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'DEVELOPER': return 'red';
      case 'ADMIN': return 'blue';
      case 'EMPLOYEE': return 'gray';
      default: return 'gray';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'DEVELOPER': return 'Разработчик';
      case 'ADMIN': return 'Администратор';
      case 'EMPLOYEE': return 'Сотрудник';
      default: return role;
    }
  };

  return (
    <Box size="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Управление пользователями</Title>
          <Button leftSection={<IconPlus size={18} />} onClick={handleCreate}>
            Добавить пользователя
          </Button>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        <FilterGroup
          filters={filterConfig}
          columnFilters={columnFilters}
          onColumnFiltersChange={handleColumnFiltersChange}
        />

        <Paper shadow="sm" radius="md" withBorder>
          {loading ? (
            <Text c="dimmed">Загрузка...</Text>
          ) : filteredUsers.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {columnFilters.length > 0 ? 'Нет результатов по заданным фильтрам' : 'Нет пользователей'}
            </Text>
          ) : (
            <>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Имя</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Роль</Table.Th>
                      <Table.Th>Должность</Table.Th>
                      <Table.Th>Группа</Table.Th>
                      <Table.Th>Статус</Table.Th>
                      <Table.Th>Действия</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredUsers.map((user) => (
                      <Table.Tr key={user.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <IconUsers size={16} />
                            <Text fw={500}>{user.name}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>{user.email}</Table.Td>
                        <Table.Td>
                          <Badge color={getRoleColor(user.role)}>
                            {getRoleLabel(user.role)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{user.position || '—'}</Table.Td>
                        <Table.Td>{user.group || '—'}</Table.Td>
                        <Table.Td>
                          <Badge color={user.isActive ? 'green' : 'gray'}>
                            {user.isActive ? 'Активен' : 'Неактивен'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Войти как пользователь">
                              <ActionIcon
                                variant="light"
                                color="green"
                                onClick={() => handleLoginAs(user)}
                              >
                                <IconLogin size={18} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Редактировать">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => handleEdit(user)}
                              >
                                <IconEdit size={18} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Удалить">
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => handleDelete(user)}
                              >
                                <IconTrash size={18} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              {totalPages > 1 && (
                <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid var(--theme-border)' }}>
                  <Text size="sm" c="dimmed">
                    Показано {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} из {total}
                  </Text>
                  <Pagination
                    value={page}
                    onChange={setPage}
                    total={totalPages}
                    size="sm"
                  />
                </Group>
              )}
            </>
          )}
        </Paper>

        <DynamicFormModal
          opened={modalOpened}
          onClose={() => {
            setModalOpened(false);
            setSelectedUser(null);
            setError(null);
          }}
          title={selectedUser ? 'Редактировать пользователя' : 'Добавить пользователя'}
          mode={selectedUser ? 'edit' : 'create'}
          fields={formFields}
          initialValues={initialValues || {}}
          onSubmit={handleSave}
        />
      </Stack>
    </Box>
  );
}