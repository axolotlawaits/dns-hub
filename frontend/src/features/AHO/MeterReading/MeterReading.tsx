import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { formatName, formatValue } from '../../../utils/format';
import { FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Divider, Paper, Pagination, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ColumnFiltersState } from '@tanstack/react-table';
import { DynamicFormModal } from '../../../utils/formModal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isBetween from 'dayjs/plugin/isBetween';
import 'dayjs/locale/ru';

dayjs.locale('ru');
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);

interface User {
  id: string;
  name: string;
  organization?: string;
}

interface MeterData {
  'Офис - Холодная вода'?: number;
  'ProДвери - Электричество'?: number;
  'КакДома - Электричество'?: number;
  'КакДома - Холодная вода'?: number;
  'КакДома - Горячая вода'?: number;
  [key: string]: number | undefined;
}

interface MeterReading {
  id: string;
  date: Date;
  indications: MeterData; // Изменено с string на MeterData
  userId: string;
  createdAt: Date;
  user: User;
}

interface MeterReadingWithFormattedData extends MeterReading {
  consumption: number;
  formattedDate: string;
  displayDate: string;
  formattedData: MeterData;
  formattedConsumption: string;
  userName: string;
}

interface DateFilterValue {
  start?: string;
  end?: string;
}

interface ReadingFormValues {
  date: string;
  officeColdWater: number;
  proDveriElectricity: number;
  kakDomaElectricity: number;
  kakDomaColdWater: number;
  kakDomaHotWater: number;
}

const DEFAULT_READING_FORM: ReadingFormValues = {
  date: dayjs().format('YYYY-MM-DDTHH:mm'),
  officeColdWater: 0,
  proDveriElectricity: 0,
  kakDomaElectricity: 0,
  kakDomaColdWater: 0,
  kakDomaHotWater: 0,
};

const COLORS = ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948'];

const ReadingsChart = React.memo(({ data }: { data: MeterReadingWithFormattedData[] }) => {
  const chartData = useMemo(() => data.map(reading => ({
    date: reading.formattedDate,
    displayDate: reading.displayDate,
    ...reading.formattedData,
    'КакДома - Электричество': (reading.formattedData['КакДома - Электричество'] || 0) - (reading.formattedData['ProДвери - Электричество'] || 0)
  })), [data]);

  const meterTypes = useMemo(() => {
    const types = new Set<string>();
    data.forEach(reading => Object.keys(reading.formattedData).forEach(type => types.add(type)));
    return Array.from(types);
  }, [data]);

  return (
    <Paper withBorder p="md" radius="md" shadow="sm" style={{ height: '100%', backgroundColor: 'var(--layer)' }}>
      <Title order={4} mb="md" style={{ color: 'var(--font)' }}>График показаний</Title>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="displayDate" tick={{ fill: '#555' }} tickMargin={10} />
          <YAxis tick={{ fill: '#555' }} tickMargin={10} />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '4px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            formatter={(value: number, name: string) => [`${value} ${name.includes('Электричество') ? 'кВт·ч' : 'м³'}`, name]}
            labelFormatter={(label) => `Дата: ${label}`}
          />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          {meterTypes.map((type, index) => (
            <Line
              key={type}
              type="monotone"
              dataKey={type}
              name={type}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 0 }}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
});

const useMeterReadings = () => {
  const { user } = useUserContext();
  const [state, setState] = useState({
    readings: [] as MeterReading[],
    loading: true,
    selectedReading: null as MeterReading | null,
    readingForm: DEFAULT_READING_FORM,
    columnFilters: [] as ColumnFiltersState,
    currentPage: 1,
    pageSize: 5
  });

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    notificationSystem.addNotification(
      type === 'success' ? 'Успех' : 'Ошибка',
      message,
      type
    );
  }, []);

  const fetchData = useCallback(async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        ...options,
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }, []);

  const formatTableData = useCallback((data: MeterReading[]): MeterReadingWithFormattedData[] => {
    return [...data]
      .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
      .map((reading, index, array) => {
        const prevReading = array[index - 1];
        const currentData = reading.indications; // Убрали JSON.parse
        const prevData = prevReading ? prevReading.indications : {}; // Убрали JSON.parse
        const consumption = Object.keys(currentData).reduce((sum, key) => {
          const currentValue = currentData[key] || 0;
          const prevValue = prevData[key] || 0;
          return sum + (currentValue - prevValue);
        }, 0);

        return {
          ...reading,
          consumption,
          formattedDate: dayjs(reading.date).format('MMMM YYYY'),
          displayDate: dayjs(reading.date).format('MMMM YYYY'),
          formattedData: currentData,
          formattedConsumption: consumption.toFixed(2),
          userName: reading.user?.name ? formatName(reading.user.name) : 'Unknown',
        };
      });
  }, []);

  const tableData = useMemo(() => formatTableData(state.readings), [state.readings, formatTableData]);

  const filteredData = useMemo(() => {
    return state.columnFilters.reduce((result, filter) => {
      if (filter.id === 'displayDate' && filter.value) {
        const { start, end } = filter.value as DateFilterValue;
        return result.filter(row => {
          const rowDate = new Date(row.date);
          if (start && end) return rowDate >= new Date(start) && rowDate <= new Date(end);
          if (start) return rowDate >= new Date(start);
          if (end) return rowDate <= new Date(end);
          return true;
        });
      }
      if (filter.id === 'userName' && filter.value) {
        const users = filter.value as string[];
        return users.length ? result.filter(row => users.includes(row.userName)) : result;
      }
      return result;
    }, [...tableData]);
  }, [tableData, state.columnFilters]);

  const paginatedData = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.pageSize;
    return filteredData.slice(startIndex, startIndex + state.pageSize);
  }, [filteredData, state.currentPage, state.pageSize]);

  const userFilterOptions = useMemo(() => {
    const uniqueNames = Array.from(new Set(state.readings.map(r => r.user?.name ? formatName(r.user.name) : 'Unknown')));
    return uniqueNames.map(name => ({ value: name, label: name }));
  }, [state.readings]);

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', reading: MeterReading) => {
    setState(prev => ({ ...prev, selectedReading: reading }));
    if (action === 'edit') {
      const readingData = reading.indications; // Убрали JSON.parse
      setState(prev => ({
        ...prev,
        readingForm: {
          date: dayjs(reading.date).format('YYYY-MM-DDTHH:mm'),
          officeColdWater: readingData['Офис - Холодная вода'] || 0,
          proDveriElectricity: readingData['ProДвери - Электричество'] || 0,
          kakDomaElectricity: readingData['КакДома - Электричество'] || 0,
          kakDomaColdWater: readingData['КакДома - Холодная вода'] || 0,
          kakDomaHotWater: readingData['КакДома - Горячая вода'] || 0,
        }
      }));
    }
    modals[action][1].open();
  }, [modals]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!state.selectedReading) return;
    try {
      await fetch(`${API}/aho/meter-reading/${state.selectedReading.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      setState(prev => ({
        ...prev,
        readings: prev.readings.filter(item => item.id !== state.selectedReading!.id)
      }));
      modals.delete[1].close();
      showNotification('success', 'Показание успешно удалено');
    } catch (error) {
      console.error('Failed to delete reading:', error);
      showNotification('error', 'Ошибка при удалении показания');
    }
  }, [state.selectedReading, modals.delete, showNotification]);

  const handleFormSubmit = useCallback(async (values: ReadingFormValues, mode: 'create' | 'edit') => {
    if (!user) return;
    const selectedMonth = dayjs(values.date).format('YYYY-MM');
    if (mode === 'create' && state.readings.some(reading =>
      dayjs(reading.date).format('YYYY-MM') === selectedMonth
    )) {
      showNotification('error', 'Запись для этого месяца уже существует');
      return;
    }
    try {
      const url = mode === 'create'
        ? `${API}/aho/meter-reading`
        : `${API}/aho/meter-reading/${state.selectedReading!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const indications = { // Создаем объект напрямую
        'Офис - Холодная вода': values.officeColdWater,
        'ProДвери - Электричество': values.proDveriElectricity,
        'КакДома - Электричество': values.kakDomaElectricity,
        'КакДома - Холодная вода': values.kakDomaColdWater,
        'КакДома - Горячая вода': values.kakDomaHotWater,
      };
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          date: new Date(values.date).toISOString(),
          indications, // Передаем объект напрямую
          userId: user.id,
        }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      setState(prev => ({
        ...prev,
        readings: mode === 'create'
          ? [result, ...prev.readings]
          : prev.readings.map(item => item.id === state.selectedReading!.id ? result : item),
        readingForm: DEFAULT_READING_FORM
      }));
      modals[mode][1].close();
      showNotification('success', mode === 'create' ? 'Показание успешно добавлено' : 'Показание успешно обновлено');
    } catch (error) {
      console.error(`Failed to ${mode} reading:`, error);
      showNotification('error', `Ошибка при ${mode === 'create' ? 'добавлении' : 'обновлении'} показания`);
    }
  }, [user, state.selectedReading, state.readings, modals, showNotification]);

  const handleFilterChange = useCallback((columnId: string, value: any) => {
    setState(prev => ({
      ...prev,
      columnFilters: [
        ...prev.columnFilters.filter(f => f.id !== columnId),
        ...(value !== undefined ? [{ id: columnId, value }] : [])
      ]
    }));
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const readingsData = await fetchData(`${API}/aho/meter-reading`);
        const formattedReadings = readingsData.map((r: any) => ({
          ...r,
          date: new Date(r.date),
          createdAt: new Date(r.createdAt),
        }));
        setState(prev => ({ ...prev, readings: formattedReadings, loading: false }));
      } catch (error) {
        console.error('Failed to load data:', error);
        setState(prev => ({ ...prev, loading: false }));
      }
    };
    fetchInitialData();
  }, [fetchData]);

  return {
    loading: state.loading,
    filteredData,
    paginatedData,
    userFilterOptions,
    columnFilters: state.columnFilters,
    readingForm: state.readingForm,
    selectedReading: state.selectedReading,
    modals,
    currentPage: state.currentPage,
    pageSize: state.pageSize,
    setCurrentPage: (page: number) => setState(prev => ({ ...prev, currentPage: page })),
    setPageSize: (size: number) => setState(prev => ({ ...prev, pageSize: size })),
    handleTableAction,
    handleDeleteConfirm,
    handleFormSubmit,
    handleFilterChange,
    setReadingForm: (form: ReadingFormValues) => setState(prev => ({ ...prev, readingForm: form })),
    setColumnFilters: (filters: ColumnFiltersState) => setState(prev => ({ ...prev, columnFilters: filters })),
  };
};

const ReadingRow = React.memo(({
  reading,
  onEdit,
  onDelete
}: {
  reading: MeterReadingWithFormattedData;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const formattedData = useMemo(() => {
    const data = reading.formattedData;
    return {
      ...data,
      'КакДома - Электричество': (data['КакДома - Электричество'] || 0) - (data['ProДвери - Электричество'] || 0)
    };
  }, [reading.formattedData]);

  const hasKakDomaData = useMemo(() =>
    formattedData['КакДома - Электричество'] !== undefined ||
    formattedData['КакДома - Холодная вода'] !== undefined ||
    formattedData['КакДома - Горячая вода'] !== undefined
  , [formattedData]);

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      shadow="xs"
      mb="sm"
      style={{
        backgroundColor: 'var(--layer)',
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'var(--layer)',
        },
      }}
    >
      <Group align="flex-start" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">Офис</Text>
          {formattedData['Офис - Холодная вода'] !== undefined ? (
            <Text ta="left" style={{ color: 'var(--font)' }}>
              <Text span fw={500}>Холодная вода: </Text>
              <Text span>{formatValue('Холодная вода', formattedData['Офис - Холодная вода'])}</Text>
            </Text>
          ) : (
            <Text c="dimmed" ta="left">Нет данных</Text>
          )}
        </Box>
        <Divider orientation="vertical" />
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">ProДвери</Text>
          {formattedData['ProДвери - Электричество'] !== undefined ? (
            <Text ta="left" style={{ color: 'var(--font)' }}>
              <Text span fw={500}>Электричество: </Text>
              <Text span>{formatValue('Электричество', formattedData['ProДвери - Электричество'])}</Text>
            </Text>
          ) : (
            <Text c="dimmed" ta="left">Нет данных</Text>
          )}
        </Box>
        <Divider orientation="vertical" />
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">Как дома</Text>
          <Stack gap={4}>
            {formattedData['КакДома - Электричество'] !== undefined && (
              <Text ta="left" style={{ color: 'var(--font)' }}>
                <Text span fw={500}>Электричество: </Text>
                <Text span>{formatValue('Электричество', formattedData['КакДома - Электричество'])}</Text>
              </Text>
            )}
            {formattedData['КакДома - Холодная вода'] !== undefined && (
              <Text ta="left" style={{ color: 'var(--font)' }}>
                <Text span fw={500}>Холодная вода: </Text>
                <Text span>{formatValue('Холодная вода', formattedData['КакДома - Холодная вода'])}</Text>
              </Text>
            )}
            {formattedData['КакДома - Горячая вода'] !== undefined && (
              <Text ta="left" style={{ color: 'var(--font)' }}>
                <Text span fw={500}>Горячая вода: </Text>
                <Text span>{formatValue('Горячая вода', formattedData['КакДома - Горячая вода'])}</Text>
              </Text>
            )}
            {!hasKakDomaData && <Text c="dimmed" ta="left">Нет данных</Text>}
          </Stack>
        </Box>
        <Stack gap="xs" justify="center" style={{ width: 'auto', marginLeft: 'auto', height: '100%', padding: '4px 0' }}>
          <ActionIcon color="blue" variant="light" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{ margin: '0 auto' }}>
            <IconPencil size={18} />
          </ActionIcon>
          <ActionIcon color="red" variant="light" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ margin: '0 auto' }}>
            <IconTrash size={18} />
          </ActionIcon>
        </Stack>
      </Group>
      <Text size="sm" c="dimmed" mt="sm">Автор: {reading.userName}</Text>
      <Text size="sm" c="dimmed">Дата: {reading.displayDate}</Text>
    </Paper>
  );
});

const TotalsBlock = React.memo(({ totals }: { totals: {
  officeColdWater: number;
  proDveriElectricity: number;
  kakDomaElectricity: number;
  kakDomaColdWater: number;
  kakDomaHotWater: number;
} }) => {
  const adjustedKakDomaElectricity = totals.kakDomaElectricity - totals.proDveriElectricity;
  return (
    <Paper withBorder p="md" radius="md" shadow="sm" style={{ marginBottom: '20px', backgroundColor: 'var(--layer)' }}>
      
      <Title order={4} mb="md" style={{ color: 'var(--font)' }}>Общие итоги</Title>
      <Group align="flex-start" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">Офис</Text>
          <Text ta="left" style={{ color: '  var(--font)' }}>
            <Text span fw={500}>Холодная вода: </Text>
            <Text span>{formatValue('Холодная вода', totals.officeColdWater)}</Text>
          </Text>
        </Box>
        <Divider orientation="vertical" />
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">ProДвери</Text>
          <Text ta="left" style={{ color: 'var(--font)' }}>
            <Text span fw={500}>Электричество: </Text>
            <Text span>{formatValue('Электричество', totals.proDveriElectricity)}</Text>
          </Text>
        </Box>
        <Divider orientation="vertical" />
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={4} ta="left">Как дома</Text>
          <Stack gap={4}>
            <Text ta="left" style={{ color: 'var(--font)' }}>
              <Text span fw={500}>Электричество: </Text>
              <Text span>{formatValue('Электричество', adjustedKakDomaElectricity)}</Text>
            </Text>
            <Text ta="left" style={{ color: 'var(--font)' }}>
              <Text span fw={500}>Холодная вода: </Text>
              <Text span>{formatValue('Холодная вода', totals.kakDomaColdWater)}</Text>
            </Text>
            <Text ta="left" style={{ color: 'var(--font)' }}>
              <Text span fw={500}>Горячая вода: </Text>
              <Text span>{formatValue('Горячая вода', totals.kakDomaHotWater)}</Text>
            </Text>
          </Stack>
        </Box>
        <Box style={{ width: 60 }}></Box>
      </Group>
    </Paper>
  );
});

const MeterReadingsList = () => {
  const {
    loading,
    filteredData,
    paginatedData,
    userFilterOptions,
    columnFilters,
    readingForm,
    selectedReading,
    modals,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
    handleTableAction,
    handleDeleteConfirm,
    handleFormSubmit,
    handleFilterChange,
    setReadingForm,
    setColumnFilters,
  } = useMeterReadings();

  const totals = useMemo(() => {
    if (filteredData.length === 0) return {
      officeColdWater: 0,
      proDveriElectricity: 0,
      kakDomaElectricity: 0,
      kakDomaColdWater: 0,
      kakDomaHotWater: 0,
    };
    const lastReading = filteredData[filteredData.length - 1];
    const data = lastReading.formattedData;
    return {
      officeColdWater: data['Офис - Холодная вода'] || 0,
      proDveriElectricity: data['ProДвери - Электричество'] || 0,
      kakDomaElectricity: data['КакДома - Электричество'] || 0,
      kakDomaColdWater: data['КакДома - Холодная вода'] || 0,
      kakDomaHotWater: data['КакДома - Горячая вода'] || 0,
    };
  }, [filteredData]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата', value: (item: MeterReading) => item?.date ? dayjs(item.date).format('MMMM YYYY') : 'N/A' },
    {
      label: 'Показания',
      value: (item: MeterReading) => {
        try {
          const data = item.indications ? item.indications as MeterData : {};
          return Object.entries(data)
            .map(([key, value]) => `${key}: ${value} ${key.includes('Электричество') ? 'кВт·ч' : 'м³'}`)
            .join(', ');
        } catch {
          return 'N/A';
        }
      }
    },
    { label: 'Пользователь', value: (item: MeterReading) => item?.user?.name || 'Unknown' },
    { label: 'Дата создания', value: (item: MeterReading) => item?.createdAt ? dayjs(item.createdAt).format('DD.MM.YYYY HH:mm') : 'N/A' },
  ], []);

  const formConfig = useMemo(() => ({
    fields: [
      { name: 'date', label: 'Дата', type: 'date' as const, required: true },
      { name: 'officeColdWater', label: 'Офис - Холодная вода (м³)', type: 'number' as const, required: true },
      { name: 'proDveriElectricity', label: 'ProДвери - Электричество (кВт·ч)', type: 'number' as const, required: true },
      { name: 'kakDomaElectricity', label: 'КакДома - Электричество (кВт·ч)', type: 'number' as const, required: true },
      { name: 'kakDomaColdWater', label: 'КакДома - Холодная вода (м³)', type: 'number' as const, required: true },
      { name: 'kakDomaHotWater', label: 'КакДома - Горячая вода (м³)', type: 'number' as const, required: true },
    ],
    initialValues: DEFAULT_READING_FORM,
  }), []);

  const filters = useMemo(() => [
    {
      type: 'date' as const,
      columnId: 'displayDate',
      label: 'Фильтр по дате',
      width: 200,
    },
    {
      type: 'select' as const,
      columnId: 'userName',
      label: 'Фильтр по пользователю',
      placeholder: 'Выберите пользователя',
      options: userFilterOptions,
      width: 200,
    },
  ], [userFilterOptions]);

  if (loading) return <LoadingOverlay visible />;

  return (
      <Box p="md">
        <Box mb="md">
          <FilterGroup
            filters={filters}
            columnFilters={columnFilters}
            onColumnFiltersChange={handleFilterChange}
          />
          <Button
            variant="outline"
            onClick={() => setColumnFilters([])}
            mt="sm"
            style={{ marginRight: 'auto', display: 'block' }}
          >
            Сбросить все фильтры
          </Button>
        </Box>
        
        {/* Переносим заголовок и кнопку сюда */}
        <Group justify="space-between" mb="md">
          <Title order={2} style={{ color: 'var(--font)' }}>Показания счетчиков</Title>
          <Button
            size="md"
            variant="light"
            onClick={() => {
              setReadingForm(DEFAULT_READING_FORM);
              modals.create[1].open();
            }}
          >
            Добавить показание
          </Button>
        </Group>
          
        <Box style={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box style={{ flex: 1, marginRight: '16px' }}>
            <Stack style={{ height: '100%' }}>
              <Stack gap="md" style={{ flex: 1, overflowY: 'auto' }}>
                {paginatedData.length > 0 ? (
                  paginatedData.map((reading) => (
                    <ReadingRow
                      key={reading.id}
                      reading={reading}
                      onEdit={() => handleTableAction('edit', reading)}
                      onDelete={() => handleTableAction('delete', reading)}
                    />
                  ))
                ) : (
                  <Paper withBorder p="xl" radius="md" shadow="xs" style={{ backgroundColor: 'var(--layer)' }}>
                    <Text c="dimmed" ta="center">Нет данных для отображения</Text>
                  </Paper>
                )}
              </Stack>
              <Group justify="space-between" mt="md">
                <Select
                  value={pageSize.toString()}
                  onChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                  data={[
                    { value: '5', label: '5' },
                    { value: '10', label: '10' },
                    { value: '20', label: '20' },
                  ]}
                />
                <Pagination
                  value={currentPage}
                  onChange={setCurrentPage}
                  total={Math.ceil(filteredData.length / pageSize)}
                />
              </Group>
            </Stack>
          </Box>
          <Box style={{ flex: 1 }}>
            <Box style={{ height: '100%' }}>
              <TotalsBlock totals={totals} />
              <ReadingsChart data={paginatedData} />
            </Box>
          </Box>
        </Box>
      <DynamicFormModal
        opened={modals.view[0]}
        onClose={modals.view[1].close}
        title="Просмотр показания"
        mode="view"
        initialValues={selectedReading || {}}
        viewFieldsConfig={viewFieldsConfig}
      />
      <DynamicFormModal
        opened={modals.edit[0]}
        onClose={modals.edit[1].close}
        title="Редактировать показание"
        mode="edit"
        fields={formConfig.fields}
        initialValues={readingForm}
        onSubmit={(values) => handleFormSubmit(values as any, 'edit')}
      />
      <DynamicFormModal
        opened={modals.create[0]}
        onClose={modals.create[1].close}
        title="Добавить показание"
        mode="create"
        fields={formConfig.fields}
        initialValues={DEFAULT_READING_FORM}
        onSubmit={(values) => handleFormSubmit(values as any, 'create')}
      />
      <DynamicFormModal
        opened={modals.delete[0]}
        onClose={modals.delete[1].close}
        title="Подтверждение удаления"
        mode="delete"
        initialValues={selectedReading || {}}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
};

export default MeterReadingsList;