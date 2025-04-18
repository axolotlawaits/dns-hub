import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { API } from '../../../config/constants';
import { PaginationOption } from '../../../config/table';
import { User } from '../../../contexts/UserContext';
import { formatName } from '../../../utils/format';
import { dateRange } from '../../../utils/filter';
import {
  Button,
  Modal,
  TextInput,
  Title,
  Text,
  Group,
  ActionIcon,
  Box,
  LoadingOverlay,
  NumberInput,
  Grid,
  Card,
  Pagination,
  Select,
  Flex,
  MultiSelect
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useUserContext } from '../../../hooks/useUserContext';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState
} from '@tanstack/react-table';

type MeterReading = {
  id: string;
  date: Date;
  counter: number;
  userId: string;
  createdAt: Date;
  user: User;
};

type MeterReadingWithConsumption = MeterReading & {
  consumption: number;
  formattedDate: string;
  formattedCounter: string;
  formattedConsumption: string;
  userName: string;
};

type DateFilter = {
  start?: string;
  end?: string;
};

const DEFAULT_READING_FORM = {
  date: dayjs().format('YYYY-MM-DDTHH:mm'),
  counter: 0,
};

export default function MeterReadingsList() {
  const { user } = useUserContext();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReading, setSelectedReading] = useState<MeterReading | null>(null);
  const [readingForm, setReadingForm] = useState(DEFAULT_READING_FORM);

  // Table states
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Modal controls
  const [viewModalOpened, viewModalHandlers] = useDisclosure(false);
  const [editModalOpened, editModalHandlers] = useDisclosure(false);
  const [createModalOpened, createModalHandlers] = useDisclosure(false);
  const [deleteModalOpened, deleteModalHandlers] = useDisclosure(false);

  // Fetch readings
  useEffect(() => {
    const fetchReadings = async () => {
      try {
        const response = await fetch(`${API}/aho/`);
        const data = await response.json();
        setReadings(data);
      } catch (err) {
        console.error('Failed to load meter readings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReadings();
  }, []);

  // Prepare table data
  const tableData = useMemo<MeterReadingWithConsumption[]>(() => {
    const sortedByDate = [...readings].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
    
    return sortedByDate.map((reading, index, array) => {
      const prevReading = array[index - 1];
      const consumption = prevReading ? Math.max(0, reading.counter - prevReading.counter) : 0;
      
      return {
        ...reading,
        consumption,
        formattedDate: dayjs(reading.date).format('MMMM YYYY'),
        formattedCounter: reading.counter.toFixed(2),
        formattedConsumption: consumption.toFixed(2),
        userName: formatName(reading.user.name),
      };
    });
  }, [readings]);

  // Table columns
  const columns = useMemo<ColumnDef<MeterReadingWithConsumption>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Дата',
        cell: (info) => dayjs(info.getValue<Date>()).format('MMMM YYYY'),
        filterFn: dateRange,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'formattedCounter',
        header: 'Показание (м³)',
        size: 120,
      },
      {
        accessorKey: 'formattedConsumption',
        header: 'Израсходовано (м³)',
        size: 140,
      },
      {
        accessorKey: 'userName',
        header: 'Пользователь',
        size: 150,
        filterFn: 'includesString',
      },
      {
        id: 'actions',
        header: 'Действия',
        cell: ({ row }) => (
          <Group gap="xs">
            <ActionIcon
              color="blue"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleEditClick(row.original);
              }}
            >
              <IconPencil size={18} />
            </ActionIcon>
            <ActionIcon
              color="red"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteClick(row.original);
              }}
            >
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        ),
        size: 100,
        enableSorting: false,
      },
    ],
    []
  );

  // Initialize table
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      columnFilters,
      sorting,
    },
    filterFns: {
      dateRange: dateRange,
    },
    columnResizeMode: 'onChange',
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Handlers
  const handleEditClick = useCallback((reading: MeterReading) => {
    setSelectedReading(reading);
    setReadingForm({
      date: dayjs(reading.date).format('YYYY-MM-DDTHH:mm'),
      counter: reading.counter,
    });
    editModalHandlers.open();
  }, []);

  const handleDeleteClick = useCallback((reading: MeterReading) => {
    setSelectedReading(reading);
    deleteModalHandlers.open();
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedReading) return;
    try {
      await fetch(`${API}/aho/${selectedReading.id}`, { method: 'DELETE' });
      setReadings(prev => prev.filter(item => item.id !== selectedReading.id));
      deleteModalHandlers.close();
    } catch (err) {
      console.error('Failed to delete reading:', err);
    }
  }, [selectedReading]);

  const handleCreateReading = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const response = await fetch(`${API}/aho/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          date: new Date(readingForm.date).toISOString(),
          counter: readingForm.counter,
          userId: user.id
        }),
      });
      
      if (!response.ok) throw new Error('Failed to create reading');
      
      const newReading = await response.json();
      setReadings(prev => [newReading, ...prev]);
      setReadingForm(DEFAULT_READING_FORM);
      createModalHandlers.close();
    } catch (err) {
      console.error('Failed to create reading:', err);
    }
  }, [user, readingForm]);

  const handleEditReadingSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReading) return;
    
    try {
      const response = await fetch(`${API}/aho/${selectedReading.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          date: new Date(readingForm.date).toISOString(),
          counter: readingForm.counter
        }),
      });
      
      if (!response.ok) throw new Error('Failed to update reading');
      
      const updatedReading = await response.json();
      setReadings(prev => prev.map(item => 
        item.id === selectedReading.id ? updatedReading : item
      ));
      editModalHandlers.close();
    } catch (err) {
      console.error('Failed to edit reading:', err);
    }
  }, [selectedReading, readingForm]);

  const handleDateFilterChange = useCallback((startDate: string | null, endDate: string | null) => {
    setColumnFilters(prev => [
      ...prev.filter(filter => filter.id !== 'date'),
      ...(startDate || endDate ? [{ 
        id: 'date', 
        value: { start: startDate, end: endDate } 
      }] : []),
    ]);
  }, []);

  const handleUserFilterChange = useCallback((values: string[]) => {
    setColumnFilters(prev => [
      ...prev.filter(filter => filter.id !== 'userName'),
      ...(values.length > 0 ? [{ id: 'userName', value: values }] : []),
    ]);
  }, []);

  const userFilterOptions = useMemo(() => {
    const uniqueNames = Array.from(new Set(readings.map(reading => formatName(reading.user.name))));
    return uniqueNames.map(name => ({ value: name, label: name }));
  }, [readings]);

  if (loading) {
    return <LoadingOverlay visible />;
  }

  const currentDateFilter = columnFilters.find(filter => filter.id === 'date')?.value as DateFilter | undefined;
  const currentUserFilter = columnFilters.find(filter => filter.id === 'userName')?.value as string[] | undefined;

  return (
    <Box p="md">
      <Button
        fullWidth
        mt="xl"
        size="md"
        onClick={() => {
          setReadingForm(DEFAULT_READING_FORM);
          createModalHandlers.open();
        }}
      >
        Добавить показание
      </Button>
      
      <Title order={2} mt="md" mb="lg">
        Показания счетчиков
      </Title>
      
      <Grid>
        <Grid.Col span={12}>
          <Group gap="md" mb="md">
            <TextInput
              type="date"
              label="Фильтр по дате (начало)"
              placeholder="Выберите начальную дату"
              value={currentDateFilter?.start ?? ''}
              onChange={(e) => handleDateFilterChange(
                e.target.value, 
                currentDateFilter?.end ?? null
              )}
              style={{ width: '200px' }}
            />
            <TextInput
              type="date"
              label="Фильтр по дате (конец)"
              placeholder="Выберите конечную дату"
              value={currentDateFilter?.end ?? ''}
              onChange={(e) => handleDateFilterChange(
                currentDateFilter?.start ?? null,
                e.target.value
              )}
              style={{ width: '200px' }}
            />
            <MultiSelect
              label="Фильтр по пользователю"
              placeholder="Выберите пользователей"
              data={userFilterOptions}
              value={currentUserFilter || []}
              onChange={handleUserFilterChange}
              searchable
              clearable
              style={{ width: '200px' }}
            />
          </Group>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder shadow="sm" radius="md">
            <div ref={tableContainerRef} style={{ overflowX: 'auto', position: 'relative' }}>
              <table>
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          style={{
                            width: header.getSize(),
                            cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <Group gap="xs">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <IconArrowUp size={14} />,
                              desc: <IconArrowDown size={14} />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </Group>
                          <div
                            {...{
                              onMouseDown: header.getResizeHandler(),
                              onTouchStart: header.getResizeHandler(),
                              style: {
                                position: 'absolute',
                                right: 0,
                                top: 0,
                                height: '100%',
                                width: '4px',
                                backgroundColor: header.column.getIsResizing() ? '#228be6' : '#ddd',
                                cursor: 'col-resize',
                                userSelect: 'none',
                                touchAction: 'none',
                              },
                            }}
                          />
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        setSelectedReading(row.original);
                        viewModalHandlers.open();
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          style={{
                            width: cell.column.getSize(),
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <Flex justify="space-between" align="center" mt="md">
              <Select
                value={table.getState().pagination.pageSize.toString()}
                onChange={value => table.setPageSize(Number(value))}
                data={PaginationOption}
                style={{ width: '120px' }}
              />
              <Pagination
                value={table.getState().pagination.pageIndex + 1}
                onChange={page => table.setPageIndex(page - 1)}
                total={table.getPageCount()}
              />
            </Flex>
          </Card>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder shadow="sm" radius="md" style={{ height: '100%' }}>
            <Title order={4} mb="md">
              График показаний
            </Title>
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={table.getRowModel().rows.map(row => ({
                    date: row.original.formattedDate,
                    value: row.original.counter,
                    consumption: row.original.consumption,
                    name: row.original.userName,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis unit=" м³" />
                  <Tooltip
                    formatter={(value, name) => [
                      `${value} м³`, 
                      name === 'consumption' ? 'Расход' : name
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="consumption"
                    name="Расход"
                    stroke="#82ca9d"
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Grid.Col>
      </Grid>
      
      {/* Модальные окна */}
      <Modal
        opened={viewModalOpened}
        onClose={viewModalHandlers.close}
        title="Просмотр показания"
        size="md"
        radius="md"
      >
        {selectedReading && (
          <>
            <Group mb="md">
              <Text fw={500}>Дата показания:</Text>
              <Text>{dayjs(selectedReading.date).format('DD.MM.YYYY HH:mm')}</Text>
            </Group>
            <Group mb="md">
              <Text fw={500}>Показание:</Text>
              <Text>{selectedReading.counter.toFixed(2)} м³</Text>
            </Group>
            <Group mb="md">
              <Text fw={500}>Пользователь:</Text>
              <Text>{formatName(selectedReading.user.name)}</Text>
            </Group>
            <Group>
              <Text fw={500}>Дата создания:</Text>
              <Text>{dayjs(selectedReading.createdAt).format('DD.MM.YYYY HH:mm')}</Text>
            </Group>
          </>
        )}
      </Modal>
      
      <Modal
        opened={editModalOpened}
        onClose={editModalHandlers.close}
        title="Редактировать показание"
        size="sm"
        radius="md"
      >
        <form onSubmit={handleEditReadingSubmit}>
          <TextInput
            type="datetime-local"
            label="Дата"
            value={readingForm.date}
            onChange={(e) => setReadingForm(prev => ({...prev, date: e.target.value}))}
            required
            mb="md"
          />
          <NumberInput
            label="Показание (м³)"
            value={readingForm.counter}
            onChange={(value) => setReadingForm(prev => ({...prev, counter: Number(value)}))}
            required
            min={0}
            step={0.01}
            mb="md"
          />
          <Button type="submit" fullWidth mt="xl">
            Сохранить изменения
          </Button>
        </form>
      </Modal>
      
      <Modal
        opened={createModalOpened}
        onClose={createModalHandlers.close}
        title="Добавить показание"
        size="sm"
        radius="md"
      >
        <form onSubmit={handleCreateReading}>
          <TextInput
            type="datetime-local"
            label="Дата"
            value={readingForm.date}
            onChange={(e) => setReadingForm(prev => ({...prev, date: e.target.value}))}
            required
            mb="md"
          />
          <NumberInput
            label="Показание (м³)"
            value={readingForm.counter}
            onChange={(value) => setReadingForm(prev => ({...prev, counter: Number(value)}))}
            required
            min={0}
            step={0.01}
            mb="md"
          />
          <Button type="submit" fullWidth mt="xl">
            Создать показание
          </Button>
        </form>
      </Modal>
      
      <Modal
        opened={deleteModalOpened}
        onClose={deleteModalHandlers.close}
        title="Подтверждение удаления"
        size="sm"
        radius="md"
      >
        <Text mb="xl">
          Вы уверены, что хотите удалить показание от {selectedReading && dayjs(selectedReading.date).format('DD.MM.YYYY')}?
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={deleteModalHandlers.close}>
            Отмена
          </Button>
          <Button color="red" onClick={handleDeleteConfirm}>
            Удалить
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}