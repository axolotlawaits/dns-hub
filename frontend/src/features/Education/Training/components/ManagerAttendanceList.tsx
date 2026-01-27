import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Text,
  Group,
  Paper,
  Stack,
  Loader,
  Switch,
  Button,
  Box
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { API } from '../../../../config/constants';
import { notificationSystem } from '../../../../utils/Push';
import { TableComponent } from '../../../../utils/table';
import { FilterGroup } from '../../../../utils/filter';
import { getTypesFlat } from '../../../../utils/typesData';

// Константы chapters для типов обучения (на русском языке)
const TRAINING_STATUS_CHAPTER = 'Статус обучения';

interface Manager {
  id: string;
  userId: string;
  name: string;
  email: string;
  position: string;
  branch: string;
  branchCode: string | null;
  rrs: string | null;
  city: string | null;
  status: string;
  trainingProgress: Array<{
    id: string;
    trainingProgramId: string;
    statusId: string;
    status: string;
  }>;
}

interface ManagerWithFormattedData extends Manager {
  formattedName: string;
  formattedEmail: string;
  formattedBranch: string;
  formattedPosition: string;
  formattedRrs: string;
  attendanceStatus: string;
}

interface ManagerAttendanceListProps {
  programId: string;
  programName: string;
}

function ManagerAttendanceList({ programId, programName }: ManagerAttendanceListProps) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [trainingStatuses, setTrainingStatuses] = useState<Array<{ id: string; name: string }>>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'formattedName', desc: false }]);

  useEffect(() => {
    fetchManagers();
    fetchTrainingStatuses();
  }, [programId]);

  const fetchTrainingStatuses = async () => {
    try {
      const { getToolByLink } = await import('../../../../utils/toolUtils');
      const trainingTool = await getToolByLink('education/training');
      if (trainingTool) {
        const types = await getTypesFlat(TRAINING_STATUS_CHAPTER, trainingTool.id);
        setTrainingStatuses(types.map(t => ({ id: t.id, name: t.name })));
      }
    } catch (error) {
      console.error('Ошибка при загрузке статусов:', error);
    }
  };

  const fetchManagers = async () => {
    setLoading(true);
    try {
      // Загружаем всех управляющих (без фильтра по программе)
      // чтобы показать всех, даже тех, у кого еще нет прогресса
      const response = await fetch(`${API}/training/managers?limit=1000`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const data = await response.json();
      setManagers(data.data || []);
    } catch (error) {
      console.error('Ошибка при загрузке управляющих:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось загрузить список управляющих', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusId = (statusName: string) => {
    const status = trainingStatuses.find(s => 
      s.name === statusName || 
      s.name.toLowerCase().includes(statusName.toLowerCase())
    );
    return status?.id;
  };

  const getCompletedStatusId = () => {
    // Ищем статус "ЗАВЕРШЕНО" или похожий
    const statuses = ['ЗАВЕРШЕНО', 'завершено', 'ПРОЙДЕНО', 'БЫЛ', 'ПРОЙДЕН', 'ПРОШЕЛ'];
    for (const statusName of statuses) {
      const id = getStatusId(statusName);
      if (id) return id;
    }
    // Если не нашли, берем первый статус из списка (если есть)
    return trainingStatuses.length > 0 ? trainingStatuses[0].id : null;
  };

  const getNotStartedStatusId = () => {
    // Ищем статус "НЕ_НАЧАЛ" или похожий
    const statuses = ['НЕ_НАЧАЛ', 'не начал', 'НЕ ПРОЙДЕНО', 'НЕ БЫЛ', 'НЕ ПРОЙДЕН', 'НЕ ПРОШЕЛ'];
    for (const statusName of statuses) {
      const id = getStatusId(statusName);
      if (id) return id;
    }
    // Если не нашли, берем последний статус из списка (если есть)
    return trainingStatuses.length > 1 ? trainingStatuses[trainingStatuses.length - 1].id : null;
  };

  const getCurrentProgress = (manager: Manager) => {
    return manager.trainingProgress.find(tp => tp.trainingProgramId === programId);
  };

  const isCompleted = useCallback((manager: Manager) => {
    const progress = getCurrentProgress(manager);
    if (!progress) return false;
    const completedStatusId = getCompletedStatusId();
    if (!completedStatusId) return false;
    
    // Проверяем по ID статуса
    if (progress.statusId === completedStatusId) return true;
    
    // Также проверяем по названию статуса (на случай если ID не совпадает)
    const completedStatus = trainingStatuses.find(s => s.id === completedStatusId);
    if (completedStatus && progress.status) {
      return progress.status.toLowerCase().includes(completedStatus.name.toLowerCase()) ||
             completedStatus.name.toLowerCase().includes(progress.status.toLowerCase());
    }
    
    return false;
  }, [programId, trainingStatuses]);

  const handleToggleAttendance = async (manager: Manager) => {
    const managerId = manager.id;
    setUpdating(prev => new Set(prev).add(managerId));

    try {
      const isCurrentlyCompleted = isCompleted(manager);
      
      // Определяем новый статус
      const newStatusId = isCurrentlyCompleted 
        ? getNotStartedStatusId()
        : getCompletedStatusId();

      if (!newStatusId) {
        throw new Error('Не удалось определить статус. Убедитесь, что статусы обучения настроены в системе.');
      }

      // Используем upsert endpoint для создания или обновления прогресса
      const response = await fetch(`${API}/training/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          managerId: manager.id,
          trainingProgramId: programId,
          statusId: newStatusId,
          completionDate: !isCurrentlyCompleted ? new Date().toISOString() : null
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка обновления статуса');
      }

      const updatedProgress = await response.json();

      // Обновляем локальное состояние
      setManagers(prevManagers =>
        prevManagers.map(m => {
          if (m.id === managerId) {
            const existingProgressIndex = m.trainingProgress.findIndex(
              tp => tp.trainingProgramId === programId
            );
            
            const updatedProgressItem = {
              id: updatedProgress.id,
              trainingProgramId: programId,
              statusId: newStatusId,
              status: updatedProgress.status?.name || (isCurrentlyCompleted ? 'НЕ_НАЧАЛ' : 'ЗАВЕРШЕНО')
            };
            
            const newProgress = existingProgressIndex >= 0
              ? m.trainingProgress.map((tp, idx) => 
                  idx === existingProgressIndex ? updatedProgressItem : tp
                )
              : [...m.trainingProgress, updatedProgressItem];

            return {
              ...m,
              trainingProgress: newProgress
            };
          }
          return m;
        })
      );

      notificationSystem.addNotification('Успешно', `Статус для ${manager.name} обновлен`, 'success');
    } catch (error) {
      console.error('Ошибка при обновлении статуса:', error);
      notificationSystem.addNotification('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить статус', 'error');
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(managerId);
        return next;
      });
    }
  };

  // Форматирование данных для таблицы
  const formatTableData = useCallback((managersList: Manager[]): ManagerWithFormattedData[] => {
    return managersList.map(manager => {
      const completed = isCompleted(manager);
      return {
        ...manager,
        formattedName: manager.name,
        formattedEmail: manager.email,
        formattedBranch: manager.branch,
        formattedPosition: manager.position,
        formattedRrs: manager.rrs || '-',
        attendanceStatus: completed ? 'Прошел' : 'Не прошел'
      };
    });
  }, [isCompleted]);

  const tableData = useMemo(() => formatTableData(managers), [managers, formatTableData]);

  // Получение уникальных значений для фильтров
  const filterOptions = useMemo(() => {
    const branches = Array.from(new Set(managers.map(m => m.branch).filter(Boolean))) as string[];
    const positions = Array.from(new Set(managers.map(m => m.position).filter(Boolean))) as string[];
    const rrs = Array.from(new Set(managers.map(m => m.rrs).filter(Boolean))) as string[];

    return {
      branch: branches.map(b => ({ value: b, label: b })),
      position: positions.map(p => ({ value: p, label: p })),
      rrs: rrs.map(r => ({ value: r, label: r }))
    };
  }, [managers]);

  // Определение фильтров
  const filters = useMemo(() => [
    {
      type: 'select' as const,
      columnId: 'formattedBranch',
      label: 'Филиал',
      placeholder: 'Выберите филиал',
      options: filterOptions.branch,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'formattedPosition',
      label: 'Должность',
      placeholder: 'Выберите должность',
      options: filterOptions.position,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'formattedRrs',
      label: 'РРС',
      placeholder: 'Выберите РРС',
      options: filterOptions.rrs,
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'attendanceStatus',
      label: 'Статус прохождения',
      placeholder: 'Выберите статус',
      options: [
        { value: 'Прошел', label: 'Прошел' },
        { value: 'Не прошел', label: 'Не прошел' }
      ],
      width: 200,
    },
  ], [filterOptions]);

  // Определение колонок таблицы
  const columns = useMemo<ColumnDef<ManagerWithFormattedData>[]>(() => [
    {
      accessorKey: 'formattedName',
      header: 'ФИО',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <Box>
          <Text fw={500} size="sm">{row.original.name}</Text>
          <Text size="xs" c="dimmed">{row.original.email}</Text>
        </Box>
      ),
    },
    {
      accessorKey: 'formattedPosition',
      header: 'Должность',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <Text size="sm">{row.original.position}</Text>
      ),
    },
    {
      accessorKey: 'formattedBranch',
      header: 'Филиал',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <Box>
          <Text size="sm">{row.original.branch}</Text>
          {row.original.branchCode && (
            <Text size="xs" c="dimmed">Код: {row.original.branchCode}</Text>
          )}
        </Box>
      ),
    },
    {
      accessorKey: 'formattedRrs',
      header: 'РРС',
      filterFn: 'includesString',
      cell: ({ row }) => (
        <Text size="sm">{row.original.rrs || '-'}</Text>
      ),
    },
    {
      accessorKey: 'attendanceStatus',
      header: 'Прошел обучение',
      filterFn: 'includesString',
      cell: ({ row }) => {
        const manager = row.original;
        const completed = isCompleted(manager);
        const progress = getCurrentProgress(manager);
        const isUpdating = updating.has(manager.id);

        return (
          <Box style={{ textAlign: 'center' }}>
            {isUpdating ? (
              <Loader size="sm" />
            ) : (
              <Switch
                checked={completed}
                onChange={() => handleToggleAttendance(manager)}
                color="green"
                size="md"
                thumbIcon={
                  completed ? (
                    <IconCheck size={12} stroke={3} />
                  ) : (
                    <IconX size={12} stroke={3} />
                  )
                }
              />
            )}
            {progress && (
              <Text size="xs" c="dimmed" mt={4}>
                {progress.status}
              </Text>
            )}
          </Box>
        );
      },
    },
  ], [isCompleted, updating]);

  // Обработчик для FilterGroup (принимает columnId и value)
  const handleFilterGroupChange = useCallback((columnId: string, value: any) => {
    setColumnFilters(prev => [
      ...prev.filter(f => f.id !== columnId),
      ...(value ? [{ id: columnId, value }] : [])
    ]);
  }, []);

  // Обработчик для TableComponent (принимает updaterOrValue)
  const handleColumnFiltersChange = useCallback((updaterOrValue: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
    setColumnFilters(prev => {
      if (typeof updaterOrValue === 'function') {
        return updaterOrValue(prev);
      }
      return updaterOrValue;
    });
  }, []);

  if (loading) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <Loader />
      </Box>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Text size="lg" fw={600} mb="xs">
            Управляющие по программе: {programName}
          </Text>
          <Text size="sm" c="dimmed">
            Всего: {managers.length} управляющих
          </Text>
        </div>
        <Button
          variant="light"
          onClick={fetchManagers}
        >
          Обновить
        </Button>
      </Group>

      {/* Фильтры */}
      <FilterGroup
        filters={filters}
        columnFilters={columnFilters}
        onColumnFiltersChange={handleFilterGroupChange}
      />

      {/* Таблица */}
      {managers.length === 0 ? (
        <Paper p="xl" style={{ textAlign: 'center' }}>
          <Text c="dimmed">Нет управляющих для этой программы</Text>
        </Paper>
      ) : (
        <Box
          style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '16px',
            border: '1px solid var(--theme-border-primary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden'
          }}
        >
          <TableComponent<ManagerWithFormattedData>
            data={tableData}
            columns={columns}
            columnFilters={columnFilters}
            sorting={sorting}
            onColumnFiltersChange={handleColumnFiltersChange}
            onSortingChange={(updaterOrValue) => {
              setSorting(prev => 
                typeof updaterOrValue === 'function'
                  ? updaterOrValue(prev)
                  : updaterOrValue
              );
            }}
            paginationOptions={[
              { value: '10', label: '10' },
              { value: '20', label: '20' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
        </Box>
      )}
    </Stack>
  );
}

export default ManagerAttendanceList;
