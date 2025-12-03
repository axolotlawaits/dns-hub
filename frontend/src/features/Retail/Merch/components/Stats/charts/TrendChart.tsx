import { ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Paper, SegmentedControl, Text } from '@mantine/core';
import { useState } from 'react';

interface TrendDataPoint {
  period: string;
  displayPeriod: string;
  current: number;
  previous?: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  title?: string;
  currentLabel?: string;
  previousLabel?: string;
}

export function TrendChart({ 
  data, 
  title = 'Тренды метрик',
  currentLabel = 'Текущий период',
  previousLabel = 'Предыдущий период'
}: TrendChartProps) {
  const [chartType, setChartType] = useState<'line' | 'area'>('line');

  return (
    <Paper withBorder p="md" radius="md">
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text fw={600} size="lg">{title}</Text>
        <SegmentedControl
          value={chartType}
          onChange={(value) => setChartType(value as 'line' | 'area')}
          data={[
            { label: 'Линия', value: 'line' },
            { label: 'Область', value: 'area' }
          ]}
          size="xs"
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        {chartType === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-secondary)" opacity={0.3} />
            <XAxis 
              dataKey="displayPeriod" 
              tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <YAxis 
              tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--theme-bg-elevated)',
                border: '1px solid var(--theme-border-primary)',
                borderRadius: '8px',
                color: 'var(--theme-text-primary)'
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="current" 
              stroke="var(--color-primary-500)" 
              strokeWidth={2}
              name={currentLabel}
              dot={{ r: 4 }}
            />
            {data[0]?.previous !== undefined && (
              <Line 
                type="monotone" 
                dataKey="previous" 
                stroke="var(--color-gray-500)" 
                strokeWidth={2}
                strokeDasharray="5 5"
                name={previousLabel}
                dot={{ r: 4 }}
              />
            )}
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-secondary)" opacity={0.3} />
            <XAxis 
              dataKey="displayPeriod" 
              tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <YAxis 
              tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--theme-bg-elevated)',
                border: '1px solid var(--theme-border-primary)',
                borderRadius: '8px',
                color: 'var(--theme-text-primary)'
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="current" 
              stroke="var(--color-primary-500)" 
              fill="var(--color-primary-500)"
              fillOpacity={0.3}
              name={currentLabel}
            />
            {data[0]?.previous !== undefined && (
              <Area 
                type="monotone" 
                dataKey="previous" 
                stroke="var(--color-gray-500)" 
                fill="var(--color-gray-500)"
                fillOpacity={0.2}
                name={previousLabel}
              />
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </Paper>
  );
}

