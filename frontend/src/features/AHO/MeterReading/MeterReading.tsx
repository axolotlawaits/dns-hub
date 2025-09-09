import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API } from '../../../config/constants';
import { useUserContext } from '../../../hooks/useUserContext';
import { notificationSystem } from '../../../utils/Push';
import { formatName, formatValue } from '../../../utils/format';
import { FilterGroup } from '../../../utils/filter';
import { Button, Title, Box, LoadingOverlay, Group, ActionIcon, Text, Stack, Pagination, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { IconPencil, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { ColumnFiltersState } from '@tanstack/react-table';
import { DynamicFormModal } from '../../../utils/formModal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isBetween from 'dayjs/plugin/isBetween';
import 'dayjs/locale/ru';

// Setup dayjs plugins and locale
dayjs.locale('ru');
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);

// Constants and types
const COLORS = ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948'];
const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZE_OPTIONS = ['5', '10', '20'].map(value => ({ value, label: value }));

interface User {
  id: string;
  name: string;
  organization?: string;
}

type MeterData = Record<string, number | undefined> & {
  'Офис - Холодная вода'?: number;
  'ProДвери - Электричество'?: number;
  'КакДома - Электричество'?: number;
  'КакДома - Холодная вода'?: number;
  'КакДома - Горячая вода'?: number;
};

interface MeterReading {
  id: string;
  date: Date;
  indications: MeterData;
  userId: string;
  createdAt: Date;
  user: User;
}

interface MeterReadingWithFormattedData extends MeterReading {
  consumption: number;
  formattedDate: string;
  displayDate: string;
  formattedData: MeterData;
  diffs: MeterData; // разница по каждому показателю с предыдущим месяцем
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
  date: dayjs().format('YYYY-MM-DD'),
  officeColdWater: 0,
  proDveriElectricity: 0,
  kakDomaElectricity: 0,
  kakDomaColdWater: 0,
  kakDomaHotWater: 0,
};

// Utility functions
const formatReadingData = (data: MeterReading[]): MeterReadingWithFormattedData[] => {
  return [...data].map((reading, index, array) => {
    const prevReading = array[index - 1];
    const currentData = reading.indications;
    const prevData = prevReading?.indications || {};

    const allKeys = Array.from(new Set([...Object.keys(currentData), ...Object.keys(prevData)]));

    const diffs: MeterData = {};
    const consumption = allKeys.reduce((sum, key) => {
      const currentValue = (currentData as any)[key] ?? 0;
      const prevValue = (prevData as any)[key] ?? 0;
      const delta = Number(currentValue) - Number(prevValue);
      (diffs as any)[key] = delta;
      return sum + delta;
    }, 0);

    return {
      ...reading,
      consumption,
      formattedDate: dayjs(reading.date).format('MMMM YYYY'),
      displayDate: dayjs(reading.date).format('MMMM YYYY'),
      formattedData: currentData,
      diffs,
      formattedConsumption: consumption.toFixed(2),
      userName: reading.user?.name ? formatName(reading.user.name) : 'Unknown',
    };
  });
};

const calculateTotals = (readings: MeterReadingWithFormattedData[]) => {
  if (readings.length === 0) {
    return {
      officeColdWater: 0,
      proDveriElectricity: 0,
      kakDomaElectricity: 0,
      kakDomaColdWater: 0,
      kakDomaHotWater: 0,
    };
  }
  const lastReading = readings[readings.length - 1];
  const indications = lastReading.formattedData;
  return {
    officeColdWater: indications['Офис - Холодная вода'] ?? 0,
    proDveriElectricity: indications['ProДвери - Электричество'] ?? 0,
    kakDomaElectricity: indications['КакДома - Электричество'] ?? 0,
    kakDomaColdWater: indications['КакДома - Холодная вода'] ?? 0,
    kakDomaHotWater: indications['КакДома - Горячая вода'] ?? 0,
  };
};

// Optimized components
const ReadingsChart = React.memo(({ data }: { data: MeterReadingWithFormattedData[] }) => {
  const chartData = useMemo(() => data.map(reading => ({
    date: reading.formattedDate,
    displayDate: reading.displayDate,
    // Используем расчетные данные (разности) вместо абсолютных показаний
    'Офис - Холодная вода': reading.diffs['Офис - Холодная вода'] || 0,
    'ProДвери - Электричество': reading.diffs['ProДвери - Электричество'] || 0,
    'КакДома - Электричество': reading.diffs['КакДома - Электричество'] || 0,
    'КакДома - Холодная вода': reading.diffs['КакДома - Холодная вода'] || 0,
    'КакДома - Горячая вода': reading.diffs['КакДома - Горячая вода'] || 0,
  })), [data]);

  const meterTypes = useMemo(() => {
    const types = new Set<string>();
    data.forEach(reading => Object.keys(reading.diffs).forEach(type => types.add(type)));
    return Array.from(types);
  }, [data]);

  return (
    <Box style={{
      background: 'var(--theme-bg-elevated)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid var(--theme-border-primary)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Градиентный фон */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px 16px 0 0'
      }} />
      
      <Group gap="md" mb="lg">
        <Box style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text size="xl" fw={700} c="white">
            📊
          </Text>
        </Box>
        <Box>
          <Title order={3} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
            График потребления
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
            Динамика потребления по месяцам
          </Text>
        </Box>
      </Group>

      <Box style={{
        background: 'var(--theme-bg-primary)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid var(--theme-border-secondary)'
      }}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="var(--theme-border-secondary)" 
              opacity={0.5}
            />
            <XAxis 
              dataKey="displayDate" 
              tick={{ 
                fill: 'var(--theme-text-secondary)',
                fontSize: 12
              }} 
              tickMargin={10}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <YAxis 
              tick={{ 
                fill: 'var(--theme-text-secondary)',
                fontSize: 12
              }} 
              tickMargin={10}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--theme-bg-elevated)',
                border: '1px solid var(--theme-border-primary)',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                color: 'var(--theme-text-primary)'
              }}
              formatter={(value: number, name: string) => [
                `${value} ${name.includes('Электричество') ? 'кВт·ч/м' : 'м³/м'}`, 
                name
              ]}
              labelFormatter={(label) => `Дата: ${label}`}
            />
            <Legend 
              wrapperStyle={{ 
                paddingTop: '20px',
                color: 'var(--theme-text-primary)'
              }} 
            />
            {meterTypes.map((type, index) => (
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                name={type}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={3}
                activeDot={{ 
                  r: 8, 
                  strokeWidth: 2,
                  stroke: COLORS[index % COLORS.length],
                  fill: 'var(--theme-bg-elevated)'
                }}
                dot={{ 
                  r: 4,
                  fill: COLORS[index % COLORS.length],
                  stroke: 'var(--theme-bg-elevated)',
                  strokeWidth: 2
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
});

const ReadingRow = React.memo(({
  reading,
  onEdit,
  onDelete
}: {
  reading: MeterReadingWithFormattedData;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const formattedData = useMemo(() => ({
    ...reading.formattedData
  }), [reading.formattedData]);

  const unitSuffix = useCallback((key: string) => (
    key.includes('Электричество') ? 'кВт·ч/м' : 'м³/м'
  ), []);

  const formatDelta = useCallback((key: string) => {
    const diffsAny = reading.diffs as Record<string, number | undefined>;
    const raw = diffsAny[key] ?? 0;
    const value = Number(raw) || 0;
    const sign = value > 0 ? '' : '';
    return `${sign}${value.toFixed(2)} ${unitSuffix(key)}`;
  }, [reading.diffs, unitSuffix]);

  const hasKakDomaData = useMemo(() =>
    ['КакДома - Электричество', 'КакДома - Холодная вода', 'КакДома - Горячая вода'].some(
      key => formattedData[key] !== undefined
    ),
    [formattedData]
  );

  return (
    <Box style={{
      background: 'var(--theme-bg-elevated)',
      borderRadius: '16px',
      padding: '20px',
      border: '1px solid var(--theme-border-primary)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    }}
    >
      {/* Градиентная полоса сверху */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px 16px 0 0'
      }} />
      
      {/* Заголовок с датой */}
      <Group justify="space-between" align="center" mb="md">
        <Box>
          <Text size="lg" fw={600} c="var(--theme-text-primary)">
            {reading.displayDate}
          </Text>
          <Text size="sm" c="var(--theme-text-secondary)">
            Автор: {reading.userName}
          </Text>
        </Box>
        <Group gap="xs">
          <ActionIcon 
            color="blue" 
            variant="light" 
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            style={{ 
              background: 'var(--theme-bg-secondary)',
              border: '1px solid var(--theme-border-primary)'
            }}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon 
            color="red" 
            variant="light" 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ 
              background: 'var(--theme-bg-secondary)',
              border: '1px solid var(--theme-border-primary)'
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Показания по объектам */}
      <Box style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        {/* Офис */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <Group gap="sm" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="white">🏢</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">Офис</Text>
          </Group>
          {formattedData['Офис - Холодная вода'] !== undefined ? (
            <Box>
              <Text size="sm" c="var(--theme-text-secondary)" mb={4}>Холодная вода</Text>
              <Text size="lg" fw={600} c="var(--theme-text-primary)" mb={2}>
                {formatValue('Холодная вода', formattedData['Офис - Холодная вода'])}
              </Text>
              <Text size="xs" c="var(--theme-text-secondary)">
                {formatDelta('Офис - Холодная вода')}
              </Text>
            </Box>
          ) : (
            <Text size="sm" c="var(--theme-text-secondary)">Нет данных</Text>
          )}
        </Box>

        {/* ProДвери */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <Group gap="sm" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="white">⚡</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">ProДвери</Text>
          </Group>
          {formattedData['ProДвери - Электричество'] !== undefined ? (
            <Box>
              <Text size="sm" c="var(--theme-text-secondary)" mb={4}>Электричество</Text>
              <Text size="lg" fw={600} c="var(--theme-text-primary)" mb={2}>
                {formatValue('Электричество', formattedData['ProДвери - Электричество'])}
              </Text>
              <Text size="xs" c="var(--theme-text-secondary)">
                {formatDelta('ProДвери - Электричество')}
              </Text>
            </Box>
          ) : (
            <Text size="sm" c="var(--theme-text-secondary)">Нет данных</Text>
          )}
        </Box>

        {/* Как дома */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <Group gap="sm" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">🏠</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">Как дома</Text>
          </Group>
          <Stack gap="sm">
            {formattedData['КакДома - Электричество'] !== undefined && (
              <Box>
                <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Электричество</Text>
                <Text size="md" fw={500} c="var(--theme-text-primary)" mb={1}>
                  {formatValue('Электричество', formattedData['КакДома - Электричество'])}
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)">
                  {formatDelta('КакДома - Электричество')}
                </Text>
              </Box>
            )}
            {formattedData['КакДома - Холодная вода'] !== undefined && (
              <Box>
                <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Холодная вода</Text>
                <Text size="md" fw={500} c="var(--theme-text-primary)" mb={1}>
                  {formatValue('Холодная вода', formattedData['КакДома - Холодная вода'])}
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)">
                  {formatDelta('КакДома - Холодная вода')}
                </Text>
              </Box>
            )}
            {formattedData['КакДома - Горячая вода'] !== undefined && (
              <Box>
                <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Горячая вода</Text>
                <Text size="md" fw={500} c="var(--theme-text-primary)" mb={1}>
                  {formatValue('Горячая вода', formattedData['КакДома - Горячая вода'])}
                </Text>
                <Text size="xs" c="var(--theme-text-secondary)">
                  {formatDelta('КакДома - Горячая вода')}
                </Text>
              </Box>
            )}
            {!hasKakDomaData && (
              <Text size="sm" c="var(--theme-text-secondary)">Нет данных</Text>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
});

const TotalsBlock = React.memo(({ totals }: { totals: ReturnType<typeof calculateTotals> }) => {
  return (
    <Box style={{
      background: 'var(--theme-bg-elevated)',
      borderRadius: '16px',
      padding: '24px',
      border: '1px solid var(--theme-border-primary)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Градиентный фон */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px 16px 0 0'
      }} />
      
      <Group gap="md" mb="lg">
        <Box style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          padding: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text size="xl" fw={700} c="white">
            📈
          </Text>
        </Box>
        <Box>
          <Title order={3} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
            Общие итоги
          </Title>
          <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
            Текущие показания по всем объектам
          </Text>
        </Box>
      </Group>

      <Box style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        {/* Офис */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)',
          textAlign: 'center'
        }}>
          <Group gap="sm" justify="center" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="white">🏢</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">Офис</Text>
          </Group>
          <Text size="sm" c="var(--theme-text-secondary)" mb={4}>Холодная вода</Text>
          <Text size="xl" fw={700} c="var(--theme-text-primary)">
            {formatValue('Холодная вода', totals.officeColdWater)}
          </Text>
        </Box>

        {/* ProДвери */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)',
          textAlign: 'center'
        }}>
          <Group gap="sm" justify="center" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="white">⚡</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">ProДвери</Text>
          </Group>
          <Text size="sm" c="var(--theme-text-secondary)" mb={4}>Электричество</Text>
          <Text size="xl" fw={700} c="var(--theme-text-primary)">
            {formatValue('Электричество', totals.proDveriElectricity)}
          </Text>
        </Box>

        {/* Как дома */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)',
          textAlign: 'center'
        }}>
          <Group gap="sm" justify="center" mb="sm">
            <Box style={{
              background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="sm" fw={600} c="var(--theme-text-primary)">🏠</Text>
            </Box>
            <Text size="sm" fw={600} c="var(--theme-text-primary)">Как дома</Text>
          </Group>
          <Stack gap="sm">
            <Box>
              <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Электричество</Text>
              <Text size="lg" fw={600} c="var(--theme-text-primary)">
                {formatValue('Электричество', totals.kakDomaElectricity)}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Холодная вода</Text>
              <Text size="lg" fw={600} c="var(--theme-text-primary)">
                {formatValue('Холодная вода', totals.kakDomaColdWater)}
              </Text>
            </Box>
            <Box>
              <Text size="xs" c="var(--theme-text-secondary)" mb={2}>Горячая вода</Text>
              <Text size="lg" fw={600} c="var(--theme-text-primary)">
                {formatValue('Горячая вода', totals.kakDomaHotWater)}
              </Text>
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
});

// Custom hook for meter readings logic
const useMeterReadings = () => {
  const { user } = useUserContext();
  const [state, setState] = useState({
    readings: [] as MeterReading[],
    loading: true,
    selectedReading: null as MeterReading | null,
    readingForm: DEFAULT_READING_FORM,
    columnFilters: [] as ColumnFiltersState,
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE
  });

  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  // ВАЖНО: считаем помесячные разницы на базе хронологически возрастающего списка,
  // чтобы дельта относится к текущему месяцу (current - previous)
  const tableBaseAsc = useMemo(() => {
    return [...state.readings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [state.readings]);

  const tableData = useMemo(() => formatReadingData(tableBaseAsc), [tableBaseAsc]);

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

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [filteredData, sortOrder]);

  const paginatedData = useMemo(() => {
    const startIndex = (state.currentPage - 1) * state.pageSize;
    return sortedData.slice(startIndex, startIndex + state.pageSize);
  }, [sortedData, state.currentPage, state.pageSize]);

  const userFilterOptions = useMemo(() => {
    const uniqueNames = Array.from(new Set(state.readings.map(r => r.user?.name ? formatName(r.user.name) : 'Unknown')));
    return uniqueNames.map(name => ({ value: name, label: name }));
  }, [state.readings]);

  const toggleSortOrder = () => {
    const newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newSortOrder);
  };

  const handleTableAction = useCallback((action: 'view' | 'edit' | 'delete', reading: MeterReading) => {
    setState(prev => ({ ...prev, selectedReading: reading }));
    if (action === 'edit') {
      const readingData = reading.indications;
      setState(prev => ({
        ...prev,
        readingForm: {
          date: dayjs(reading.date).format('YYYY-MM-DD'),
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
      const indications = {
        'Офис - Холодная вода': Number(values.officeColdWater),
        'ProДвери - Электричество': Number(values.proDveriElectricity),
        'КакДома - Электричество': Number(values.kakDomaElectricity),
        'КакДома - Холодная вода': Number(values.kakDomaColdWater),
        'КакДома - Горячая вода': Number(values.kakDomaHotWater),
      };
      const formattedDate = dayjs(values.date).format('YYYY-MM-DD');
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          date: formattedDate,
          indications,
          userId: user.id,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
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
      showNotification(
        'error',
        `Ошибка при ${mode === 'create' ? 'добавлении' : 'обновлении'} показания: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      );
    }
  }, [user, state.selectedReading, state.readings, modals, showNotification]);

  const handleFilterChange = useCallback((columnId: string, value: any) => {
    setState(prev => ({
      ...prev,
      columnFilters: [
        ...prev.columnFilters.filter(f => f.id !== columnId),
        ...(value !== undefined ? [{ id: columnId, value }] : [])
      ],
      currentPage: 1 // Reset to first page when filters change
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
    sortedData,
    paginatedData,
    userFilterOptions,
    columnFilters: state.columnFilters,
    readingForm: state.readingForm,
    selectedReading: state.selectedReading,
    modals,
    currentPage: state.currentPage,
    pageSize: state.pageSize,
    sortOrder,
    toggleSortOrder,
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

const MeterReadingsList = () => {
  const {
    loading,
    filteredData,
    sortedData,
    paginatedData,
    userFilterOptions,
    columnFilters,
    readingForm,
    selectedReading,
    modals,
    currentPage,
    pageSize,
    sortOrder,
    toggleSortOrder,
    setCurrentPage,
    setPageSize,
    handleTableAction,
    handleDeleteConfirm,
    handleFormSubmit,
    handleFilterChange,
    setReadingForm,
    setColumnFilters,
  } = useMeterReadings();

  const totals = useMemo(() => calculateTotals(filteredData), [filteredData]);

  const viewFieldsConfig = useMemo(() => [
    { label: 'Дата', value: (item: MeterReading) => item?.date ? dayjs(item.date).format('MMMM YYYY') : 'N/A' },
    {
      label: 'Показания',
      value: (item: MeterReading) => {
        const data = item.indications || {};
        return Object.entries(data)
          .map(([key, value]) => `${key}: ${value} ${key.includes('Электричество') ? 'кВт·ч' : 'м³'}`)
          .join(', ');
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
    <Box p="md" style={{ background: 'var(--theme-bg-primary)', minHeight: '100vh' }}>
      {/* Заголовок и навигация */}
      <Box mb="xl" style={{ 
        background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--theme-border-primary)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <Group justify="space-between" mb="md">
          <Group gap="md">
            <Box style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text size="xl" fw={700} c="white">
                📊
              </Text>
            </Box>
            <Box>
              <Title order={1} style={{ color: 'var(--theme-text-primary)', margin: 0 }}>
                Показания счётчиков
              </Title>
              <Text size="sm" c="var(--theme-text-secondary)" mt={4}>
                Управление показаниями коммунальных услуг
              </Text>
            </Box>
          </Group>
          <Group gap="sm">
            <Button
              variant="outline"
              onClick={() => setColumnFilters([])}
              size="sm"
            >
              Сбросить фильтры
            </Button>
            <Button
              size="md"
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan' }}
              onClick={() => {
                setReadingForm(DEFAULT_READING_FORM);
                modals.create[1].open();
              }}
            >
              + Добавить показание
            </Button>
          </Group>
        </Group>
        
        {/* Фильтры */}
        <Box style={{
          background: 'var(--theme-bg-primary)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid var(--theme-border-secondary)'
        }}>
          <FilterGroup
            filters={filters}
            columnFilters={columnFilters}
            onColumnFiltersChange={handleFilterChange}
          />
        </Box>
      </Box>
      {/* Основной контент с адаптивной сеткой */}
      <Box style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        alignItems: 'start'
      }}>
        {/* Левая колонка - Список показаний */}
        <Box>
          <Box mb="md" style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-primary)'
          }}>
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <Text size="lg" fw={600} c="var(--theme-text-primary)">
                  Показания по месяцам
                </Text>
                <ActionIcon
                  variant="subtle"
                  onClick={toggleSortOrder}
                  style={{ 
                    background: 'var(--theme-bg-secondary)',
                    border: '1px solid var(--theme-border-primary)'
                  }}
                >
                  {sortOrder === 'asc' ? <IconArrowUp size={16} /> : <IconArrowDown size={16} />}
                </ActionIcon>
              </Group>
              <Text size="sm" c="var(--theme-text-secondary)">
                {paginatedData.length} из {sortedData.length}
              </Text>
            </Group>
          </Box>

          <Stack gap="md" mb="md">
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
              <Box style={{
                background: 'var(--theme-bg-elevated)',
                borderRadius: '16px',
                padding: '48px 24px',
                textAlign: 'center',
                border: '2px dashed var(--theme-border-secondary)'
              }}>
                <Text size="xl" mb="md">📊</Text>
                <Text size="lg" fw={500} c="var(--theme-text-primary)" mb="sm">
                  Нет данных для отображения
                </Text>
                <Text size="sm" c="var(--theme-text-secondary)">
                  Добавьте первое показание, чтобы начать работу
                </Text>
              </Box>
            )}
          </Stack>

          {/* Пагинация */}
          <Box style={{
            background: 'var(--theme-bg-elevated)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid var(--theme-border-primary)'
          }}>
            <Group justify="space-between" align="center">
              <Group gap="sm" align="center">
                <Text size="sm" c="var(--theme-text-secondary)">
                  Показать:
                </Text>
                <Select
                  value={pageSize.toString()}
                  onChange={(value) => {
                    setPageSize(Number(value));
                    setCurrentPage(1);
                  }}
                  data={PAGE_SIZE_OPTIONS}
                  size="sm"
                  style={{ width: '80px' }}
                />
                <Text size="sm" c="var(--theme-text-secondary)">
                  записей
                </Text>
              </Group>
              <Pagination
                value={currentPage}
                onChange={setCurrentPage}
                total={Math.ceil(sortedData.length / pageSize)}
                size="sm"
              />
            </Group>
          </Box>
        </Box>

        {/* Правая колонка - Статистика и график */}
        <Box>
          <Stack gap="md">
            <TotalsBlock totals={totals} />
            <ReadingsChart data={filteredData} />
          </Stack>
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
        onSubmit={(values) => handleFormSubmit(values as ReadingFormValues, 'edit')}
      />
      <DynamicFormModal
        opened={modals.create[0]}
        onClose={modals.create[1].close}
        title="Добавить показание"
        mode="create"
        fields={formConfig.fields}
        initialValues={DEFAULT_READING_FORM}
        onSubmit={(values) => handleFormSubmit(values as ReadingFormValues, 'create')}
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