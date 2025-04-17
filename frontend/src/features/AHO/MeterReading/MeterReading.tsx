import { useState, useEffect, useMemo, useRef } from 'react';
import { API } from '../../../config/constants';
import { User } from '../../../contexts/UserContext';
import { formatName } from '../../../utils/format';
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
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
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
  type SortingState,
  type ColumnResizeMode,
  FilterFn,
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
// Extend dayjs with the plugins
dayjs.extend(isBetween);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
// Добавляем кастомную функцию фильтрации для диапазона дат
const dateRangeFilter: FilterFn<any> = (row, columnId, filterValue: DateFilter) => {
  const date = row.getValue<Date>(columnId);
  if (!filterValue.start && !filterValue.end) return true;
  
  const start = filterValue.start ? dayjs(filterValue.start).startOf('day') : null;
  const end = filterValue.end ? dayjs(filterValue.end).endOf('day') : null;
  const rowDate = dayjs(date).startOf('day');

  if (start && end) {
    return rowDate.isBetween(start, end, null, '[]');
  } else if (start) {
    return rowDate.isSameOrAfter(start);
  } else if (end) {
    return rowDate.isSameOrBefore(end);
  }
  return true;
};

export default function MeterReadingsList() {
  const { user } = useUserContext();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReading, setSelectedReading] = useState<MeterReading | null>(null);
  const [readingForm, setReadingForm] = useState({
    date: dayjs().format('YYYY-MM-DDTHH:mm'),
    counter: 0,
  });

  // Table states
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }]);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Modal controls
  const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

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

  // Подготовка данных для таблицы и графика
  const tableData = useMemo<MeterReadingWithConsumption[]>(() => {
    const sortedByDate = [...readings].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
    return sortedByDate.map((reading, index, array) => {
      const prevReading = array[index - 1];
      const consumption = prevReading ? reading.counter - prevReading.counter : 0;
      return {
        ...reading,
        consumption: Math.max(0, consumption),
        formattedDate: dayjs(reading.date).format('MMMM YYYY'),
        formattedCounter: reading.counter.toFixed(2),
        formattedConsumption: Math.max(0, consumption).toFixed(2),
        userName: formatName(reading.user.name),
      };
    });
  }, [readings]);

  // Define columns
  const columns = useMemo<ColumnDef<MeterReadingWithConsumption>[]>(
    () => [
      {
        accessorKey: 'date',
        header: 'Дата',
        cell: (info) => dayjs(info.getValue<Date>()).format('MMMM YYYY'),
        filterFn: dateRangeFilter,
        sortingFn: 'datetime',
      },
      {
        accessorKey: 'formattedCounter',
        header: 'Показание (м³)',
        size: 120,
        filterFn: 'includesString',
      },
      {
        accessorKey: 'formattedConsumption',
        header: 'Израсходовано (м³)',
        size: 140,
        filterFn: 'includesString',
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
      dateRange: dateRangeFilter,
    },
    columnResizeMode,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  // Handlers
  const handleEditClick = (reading: MeterReading) => {
    setSelectedReading(reading);
    setReadingForm({
      date: dayjs(reading.date).format('YYYY-MM-DDTHH:mm'),
      counter: reading.counter,
    });
    openEditModal();
  };

  const handleDeleteClick = (reading: MeterReading) => {
    setSelectedReading(reading);
    openDeleteModal();
  };

  const handleDeleteConfirm = async () => {
    if (!selectedReading) return;
    try {
      await fetch(`${API}/aho/${selectedReading.id}`, { method: 'DELETE' });
      setReadings(readings.filter(item => item.id !== selectedReading.id));
      closeDeleteModal();
    } catch (err) {
      console.error('Failed to delete reading:', err);
    }
  };

  const handleCreateReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const requestData = {
        date: new Date(readingForm.date).toISOString(),
        counter: readingForm.counter,
        userId: user.id
      };
      const response = await fetch(`${API}/aho/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.message || 'Failed to create reading');
      }
      const newReading = await response.json();
      setReadings([newReading, ...readings]);
      closeCreateModal();
    } catch (err) {
      console.error('Failed to create reading:', err);
    }
  };

  const handleEditReadingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReading) return;
    try {
      const requestData = {
        date: new Date(readingForm.date).toISOString(),
        counter: readingForm.counter
      };
      const response = await fetch(`${API}/aho/${selectedReading.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.message || 'Failed to update reading');
      }
      const updatedReading = await response.json();
      setReadings(readings.map(item =>
        item.id === selectedReading.id ? updatedReading : item
      ));
      closeEditModal();
    } catch (err) {
      console.error('Failed to edit reading:', err);
    }
  };

  const handleDateFilterChange = (startDate: string | null, endDate: string | null) => {
    setColumnFilters((prev) => [
      ...prev.filter((filter) => filter.id !== 'date'),
      ...(startDate || endDate ? [{ 
        id: 'date', 
        value: { start: startDate, end: endDate } 
      }] : []),
    ]);
  };

  const handleUserFilterChange = (values: string[]) => {
    setColumnFilters((prev) => [
      ...prev.filter((filter) => filter.id !== 'userName'),
      ...(values.length > 0 ? [{ id: 'userName', value: values }] : []),
    ]);
  };

  if (loading) {
    return <LoadingOverlay visible />;
  }

  return (
    <Box p="md">
      <Button
        fullWidth
        mt="xl"
        size="md"
        onClick={() => {
          setReadingForm({
            date: dayjs().format('YYYY-MM-DDTHH:mm'),
            counter: 0,
          });
          openCreateModal();
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
              value={(columnFilters.find(filter => filter.id === 'date')?.value as DateFilter)?.start ?? ''}
              onChange={(e) => handleDateFilterChange(e.target.value, (columnFilters.find(filter => filter.id === 'date')?.value as DateFilter)?.end ?? null)}
              style={{ width: '200px' }}
            />
            <TextInput
              type="date"
              label="Фильтр по дате (конец)"
              placeholder="Выберите конечную дату"
              value={(columnFilters.find(filter => filter.id === 'date')?.value as DateFilter)?.end ?? ''}
              onChange={(e) => handleDateFilterChange((columnFilters.find(filter => filter.id === 'date')?.value as DateFilter)?.start ?? null, e.target.value)}
              style={{ width: '200px' }}
            />

            <MultiSelect
              label="Фильтр по пользователю"
              placeholder="Выберите пользователей"
              data={[...new Set(readings.map(reading => formatName(reading.user.name)))].map(name => ({ value: name, label: name }))}
              value={columnFilters.find(filter => filter.id === 'userName')?.value as string[] || []}
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
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                }}
              >
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          style={{
                            position: 'relative',
                            width: header.getSize(),
                            padding: '8px 16px',
                            textAlign: 'left',
                            cursor: header.column.getCanSort() ? 'pointer' : 'default',
                            backgroundColor: '#f8f9fa',
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
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              height: '100%',
                              width: '4px',
                              backgroundColor: header.column.getIsResizing() ? '#228be6' : '#ddd',
                              cursor: 'col-resize',
                              userSelect: 'none',
                              touchAction: 'none',
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
                        openViewModal();
                      }}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #dee2e6'
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          style={{
                            padding: '12px 16px',
                            width: cell.column.getSize(),
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
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
                data={[
                  { value: '5', label: '5 строк' },
                  { value: '10', label: '10 строк' },
                  { value: '20', label: '20 строк' },
                  { value: '50', label: '50 строк' },
                ]}
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
                    formatter={(value, name) => {
                      if (name === 'consumption') return [`${value} м³`, 'Расход'];
                      return [value, name];
                    }}
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
        onClose={closeViewModal}
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
        onClose={closeEditModal}
        title="Редактировать показание"
        size="sm"
        radius="md"
      >
        <form onSubmit={handleEditReadingSubmit}>
          <TextInput
            type="datetime-local"
            label="Дата"
            value={readingForm.date}
            onChange={(e) => setReadingForm({...readingForm, date: e.target.value})}
            required
            mb="md"
          />
          <NumberInput
            label="Показание (м³)"
            value={readingForm.counter}
            onChange={(value) => setReadingForm({...readingForm, counter: Number(value)})}
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
        onClose={closeCreateModal}
        title="Добавить показание"
        size="sm"
        radius="md"
      >
        <form onSubmit={handleCreateReading}>
          <TextInput
            type="datetime-local"
            label="Дата"
            value={readingForm.date}
            onChange={(e) => setReadingForm({...readingForm, date: e.target.value})}
            required
            mb="md"
          />
          <NumberInput
            label="Показание (м³)"
            value={readingForm.counter}
            onChange={(value) => setReadingForm({...readingForm, counter: Number(value)})}
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
        onClose={closeDeleteModal}
        title="Подтверждение удаления"
        size="sm"
        radius="md"
      >
        <Text mb="xl">Вы уверены, что хотите удалить показание от {selectedReading && dayjs(selectedReading.date).format('DD.MM.YYYY')}?</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeDeleteModal}>
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