import { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { formatName } from '../../../utils/format';
import { FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Grid, Card, Group, ActionIcon, Text, Stack, SimpleGrid, Badge } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { ColumnFiltersState } from '@tanstack/react-table';
import { DynamicFormModal } from '../../../utils/formModal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import 'dayjs/locale/ru';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.locale('ru');
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);

interface User {
  id: string;
  name: string;
}

interface MeterReading {
  id: string;
  date: Date;
  counter: number;
  userId: string;
  createdAt: Date;
  user: User;
}

interface MeterReadingWithFormattedData extends MeterReading {
  consumption: number;
  formattedDate: string;
  displayDate: string;
  formattedCounter: string;
  formattedConsumption: string;
  userName: string;
}

interface DateFilterValue {
  start?: string;
  end?: string;
}

interface ReadingFormValues {
  date: string;
  counter: number;
}

const DEFAULT_READING_FORM: ReadingFormValues = {
  date: dayjs().format('YYYY-MM-DDTHH:mm'),
  counter: 0,
};

const ReadingsChart = ({ data }: { data: MeterReadingWithFormattedData[] }) => (
  <ResponsiveContainer width="100%" height={400}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis 
        dataKey="formattedDate" 
        label={{ value: 'Дата', position: 'insideBottomRight', offset: -5 }} 
      />
      <YAxis 
        label={{ value: 'м³', angle: -90, position: 'insideLeft' }} 
        unit=" м³" 
      />
      <Tooltip
        formatter={(value: number, name: string) => [
          `${value.toFixed(2)} м³`, 
          name === 'consumption' ? 'Расход' : 'Показание'
        ]}
        labelFormatter={(label) => `Дата: ${label}`}
      />
      <Legend />
      <Line
        type="monotone"
        dataKey="consumption"
        name="Расход"
        stroke="#82ca9d"
        activeDot={{ r: 6 }}
        strokeWidth={2}
      />
      <Line
        type="monotone"
        dataKey="counter"
        name="Показание"
        stroke="#8884d8"
        activeDot={{ r: 6 }}
        strokeWidth={2}
      />
    </LineChart>
  </ResponsiveContainer>
);

const useMeterReadings = () => {
  const { user } = useUserContext();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReading, setSelectedReading] = useState<MeterReading | null>(null);
  const [readingForm, setReadingForm] = useState<ReadingFormValues>(DEFAULT_READING_FORM);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const modals = {
    view: useDisclosure(false),
    edit: useDisclosure(false),
    create: useDisclosure(false),
    delete: useDisclosure(false),
  };

  const fetchData = useCallback(async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        ...options,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch data from ${url}: ${errorData.message || 'Unknown error'}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Error fetching data from ${url}:`, error);
      throw error;
    }
  }, []);

  const formatTableData = useCallback((data: MeterReading[]): MeterReadingWithFormattedData[] => {
    const sortedByDate = [...data].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
    return sortedByDate.map((reading, index, array) => {
      const prevReading = array[index - 1];
      const consumption = prevReading ? Math.max(0, reading.counter - prevReading.counter) : 0;
      return {
        ...reading,
        consumption,
        formattedDate: dayjs(reading.date).format('MMMM YYYY'),
        displayDate: dayjs(reading.date).format('DD.MM.YYYY HH:mm'),
        formattedCounter: reading.counter.toFixed(2),
        formattedConsumption: consumption.toFixed(2),
        userName: reading.user?.name ? formatName(reading.user.name) : 'Unknown',
      };
    });
  }, []);

  const tableData = useMemo(() => formatTableData(readings), [readings, formatTableData]);

  const filteredData = useMemo(() => {
    let result = [...tableData];
    
    columnFilters.forEach(filter => {
      if (filter.id === 'displayDate' && filter.value) {
        const { start, end } = filter.value as DateFilterValue;
        result = result.filter(row => {
          const rowDate = new Date(row.date);
          if (start && end) {
            return rowDate >= new Date(start) && rowDate <= new Date(end);
          }
          if (start) return rowDate >= new Date(start);
          if (end) return rowDate <= new Date(end);
          return true;
        });
      }
      if (filter.id === 'userName' && filter.value) {
        const users = filter.value as string[];
        if (users.length > 0) {
          result = result.filter(row => users.includes(row.userName));
        }
      }
    });
    
    return result;
  }, [tableData, columnFilters]);

  const userFilterOptions = useMemo(() => {
    const uniqueNames = Array.from(
      new Set(readings.map(r => r.user?.name ? formatName(r.user.name) : 'Unknown'))
    );
    return uniqueNames.map(name => ({ value: name, label: name }));
  }, [readings]);

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', data: MeterReading) => {
    setSelectedReading(data);
    if (action === 'edit') {
      setReadingForm({
        date: dayjs(data.date).format('YYYY-MM-DDTHH:mm'),
        counter: data.counter,
      });
    }
    modals[action][1].open();
  }, [modals]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedReading) return;
    
    try {
      const response = await fetch(`${API}/aho/meter-reading/${selectedReading.id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text);
          console.log('Delete response:', data);
        } catch (e) {
          console.log('Non-JSON response:', text);
        }
      }
  
      setReadings(prev => prev.filter(item => item.id !== selectedReading.id));
      modals.delete[1].close();
    } catch (error) {
      console.error('Failed to delete reading:', error);
    }
  }, [selectedReading, modals.delete]);

  const handleFormSubmit = useCallback(async (values: ReadingFormValues, mode: 'create' | 'edit') => {
    if (!user) return;
    
    try {
      const url = mode === 'create'
        ? `${API}/aho/meter-reading`
        : `${API}/aho/meter-reading/${selectedReading!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
  
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          date: new Date(values.date).toISOString(),
          counter: parseFloat(values.counter.toString()),
          userId: user.id,
        }),
      });
  
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
  
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but received: ${text.substring(0, 100)}...`);
      }
  
      const result = await response.json();
      
      setReadings(prev => mode === 'create'
        ? [result, ...prev]
        : prev.map(item => item.id === selectedReading!.id ? result : item)
      );
      setReadingForm(DEFAULT_READING_FORM);
      modals[mode][1].close();
    } catch (error) {
      console.error(`Failed to ${mode} reading:`, error);
      if (error instanceof Error) {
        alert(`Ошибка: ${error.message}`);
      }
    }
  }, [user, selectedReading, modals]);

  const handleFilterChange = useCallback((columnId: string, value: any) => {
    setColumnFilters(prev => [
      ...prev.filter(f => f.id !== columnId),
      ...(value !== undefined ? [{ id: columnId, value }] : [])
    ]);
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const readingsData = await fetchData(`${API}/aho/meter-reading`);
        const formattedReadings = readingsData.map((r: { date: string | number | Date; createdAt: string | number | Date; }) => ({
          ...r,
          date: new Date(r.date),
          createdAt: new Date(r.createdAt),
        }));
        setReadings(formattedReadings);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [fetchData]);

  return {
    loading,
    filteredData,
    userFilterOptions,
    columnFilters,
    readingForm,
    selectedReading,
    modals,
    handleTableAction,
    handleDeleteConfirm,
    handleFormSubmit,
    handleFilterChange,
    setReadingForm,
    setColumnFilters,
  };
};

const ReadingCard = ({ 
  reading, 
  onEdit, 
  onDelete 
}: { 
  reading: MeterReadingWithFormattedData; 
  onEdit: () => void; 
  onDelete: () => void; 
}) => {
  return (
    <Card withBorder shadow="sm" radius="md" p="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={500}>{reading.formattedDate}</Text>
          <Badge color="blue" variant="light">
            {reading.userName}
          </Badge>
        </Group>
        
        <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs">
          <div>
            <Text size="sm" c="dimmed">Показание</Text>
            <Text fw={500}>{reading.formattedCounter} м³</Text>
          </div>
          <div>
            <Text size="sm" c="dimmed">Расход</Text>
            <Text fw={500}>{reading.formattedConsumption} м³</Text>
          </div>
        </SimpleGrid>
        
        <Group justify="flex-end" mt="sm">
          <ActionIcon
            color="blue"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <IconPencil size={18} />
          </ActionIcon>
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      </Stack>
    </Card>
  );
};

const MeterReadingsList = () => {
  const {
    loading,
    filteredData,
    userFilterOptions,
    columnFilters,
    readingForm,
    selectedReading,
    modals,
    handleTableAction,
    handleDeleteConfirm,
    handleFormSubmit,
    handleFilterChange,
    setReadingForm,
    setColumnFilters,
  } = useMeterReadings();

  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата', value: (item: MeterReading) => item?.date ? dayjs(item.date).format('DD.MM.YYYY HH:mm') : 'N/A' },
    { label: 'Показание', value: (item: MeterReading) => item?.counter ? `${item.counter.toFixed(2)} м³` : 'N/A' },
    { label: 'Пользователь', value: (item: MeterReading) => item?.user?.name || 'Unknown' },
    { label: 'Дата создания', value: (item: MeterReading) => item?.createdAt ? dayjs(item.createdAt).format('DD.MM.YYYY HH:mm') : 'N/A' },
  ], []);

  const formConfig = useMemo(() => ({
    fields: [
      {
        name: 'date',
        label: 'Дата',
        type: 'datetime' as const,
        required: true,
      },
      {
        name: 'counter',
        label: 'Показание (м³)',
        type: 'number' as const,
        required: true,
        min: 0,
        step: "0.01",
      },
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
      <Button
        fullWidth
        mt="xl"
        size="md"
        onClick={() => {
          setReadingForm(DEFAULT_READING_FORM);
          modals.create[1].open();
        }}
      >
        Добавить показание
      </Button>
      <Title order={2} mt="md" mb="lg">
        Показания счетчиков
      </Title>
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
        >
          Сбросить все фильтры
        </Button>
      </Box>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder shadow="sm" radius="md" p="md">
            <Title order={4} mb="md">
              Показания
            </Title>
            <Stack gap="md">
              {filteredData.length > 0 ? (
                filteredData.map((reading) => (
                  <ReadingCard
                    key={reading.id}
                    reading={reading}
                    onEdit={() => handleTableAction('edit', reading)}
                    onDelete={() => handleTableAction('delete', reading)}
                  />
                ))
              ) : (
                <Text c="dimmed" ta="center" py="md">
                  Нет данных для отображения
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder shadow="sm" radius="md" h="100%">
            <Title order={4} mb="md">
              График показаний
            </Title>
            <ReadingsChart data={filteredData} />
          </Card>
        </Grid.Col>
      </Grid>
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