import { useState, useEffect, useMemo } from 'react';
import {
  Paper,
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
  Box,
  Pagination,
} from '@mantine/core';
import { IconEdit, IconPlus, IconAlertCircle, IconBuilding } from '@tabler/icons-react';
import { DynamicFormModal } from '../../../utils/formModal';
import { FilterGroup } from '../../../utils/filter';
import useAuthFetch from '../../../hooks/useAuthFetch';
import { API } from '../../../config/constants';
import { ColumnFiltersState } from '@tanstack/react-table';

interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function BranchesManagement() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpened, setModalOpened] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const authFetch = useAuthFetch();

  useEffect(() => {
    fetchBranches();
  }, [page]);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API}/admin/branches?page=${page}&limit=${pageSize}`);
      if (response && response.ok) {
        const data = await response.json();
        // API возвращает { success: true, data: [...], pagination: {...} }
        setBranches(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotal(data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      setError('Ошибка загрузки филиалов');
      setBranches([]); // Устанавливаем пустой массив при ошибке
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedBranch(null);
    setModalOpened(true);
  };

  const handleEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    setModalOpened(true);
  };


  const handleSave = async (formData: any) => {
    try {
      setError(null);
      if (selectedBranch) {
        // Обновление
        const response = await authFetch(`${API}/admin/branches/${selectedBranch.id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchBranches();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка обновления филиала');
        }
      } else {
        // Создание
        const response = await authFetch(`${API}/admin/branches`, {
          method: 'POST',
          body: JSON.stringify(formData),
        });
        if (response && response.ok) {
          await fetchBranches();
          setModalOpened(false);
        } else {
          const errorData = await response?.json();
          setError(errorData?.error || 'Ошибка создания филиала');
        }
      }
    } catch (error) {
      console.error('Error saving branch:', error);
      setError('Ошибка сохранения филиала');
    }
  };

  const formFields = useMemo(() => [
    {
      name: 'name',
      label: 'Название филиала',
      type: 'text' as const,
      required: true,
    },
    {
      name: 'address',
      label: 'Адрес',
      type: 'text' as const,
      required: false,
    },
    {
      name: 'phone',
      label: 'Телефон',
      type: 'text' as const,
      required: false,
    },
    {
      name: 'email',
      label: 'Email',
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

  const initialValues = useMemo(() => selectedBranch ? {
    name: selectedBranch.name,
    address: selectedBranch.address || '',
    phone: selectedBranch.phone || '',
    email: selectedBranch.email || '',
    isActive: selectedBranch.isActive,
  } : undefined, [selectedBranch]);

  const nameFilter = columnFilters.find(f => f.id === 'name')?.value as string[] || [];

  const filteredBranches = useMemo(() => {
    return branches.filter(branch => {
      const nameSearch = nameFilter.length > 0 ? nameFilter[0].toLowerCase() : '';
      if (nameSearch && !branch.name.toLowerCase().includes(nameSearch)) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [branches, nameFilter]);

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
      label: 'Название',
      placeholder: 'Поиск по названию...',
    },
  ], []);

  return (
    <Box  size="xl">
      <Stack gap="md">
        {error && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Фильтры */}
        <Group justify="space-between" align="flex-start">
          <Box style={{ flex: 1 }}>
            <FilterGroup
              filters={filterConfig}
              columnFilters={columnFilters}
              onColumnFiltersChange={handleColumnFiltersChange}
            />
          </Box>
          <Button leftSection={<IconPlus size={18} />} onClick={handleCreate} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
            Добавить филиал
          </Button>
        </Group>

        <Paper shadow="sm" p="md" radius="md" withBorder>
          {loading ? (
            <Text c="dimmed">Загрузка...</Text>
          ) : filteredBranches.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {columnFilters.length > 0 ? 'Нет результатов по заданным фильтрам' : 'Нет филиалов'}
            </Text>
          ) : (
            <>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Название</Table.Th>
                      <Table.Th>Адрес</Table.Th>
                      <Table.Th>Телефон</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Статус</Table.Th>
                      <Table.Th>Действия</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredBranches.map((branch) => (
                      <Table.Tr key={branch.id}>
                        <Table.Td>
                          <Group gap="xs">
                            <IconBuilding size={16} />
                            <Text fw={500}>{branch.name}</Text>
                          </Group>
                          {(branch as any).code && (
                            <Text size="xs" c="dimmed">Код: {(branch as any).code}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {branch.address || '—'}
                          {(branch as any).city && (
                            <Text size="xs" c="dimmed">{(branch as any).city}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>{branch.phone || '—'}</Table.Td>
                        <Table.Td>{branch.email || '—'}</Table.Td>
                        <Table.Td>
                          <Badge color={branch.isActive ? 'green' : 'gray'}>
                            {branch.isActive ? 'Активен' : 'Неактивен'}
                          </Badge>
                          {(branch as any).type && (
                            <Text size="xs" c="dimmed" mt={4}>{(branch as any).type}</Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Редактировать">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => handleEdit(branch)}
                              >
                                <IconEdit size={18} />
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
            setSelectedBranch(null);
            setError(null);
          }}
          title={selectedBranch ? 'Редактировать филиал' : 'Добавить филиал'}
          mode={selectedBranch ? 'edit' : 'create'}
          fields={formFields}
          initialValues={initialValues || {}}
          onSubmit={handleSave}
        />
      </Stack>
    </Box>
  );
}

