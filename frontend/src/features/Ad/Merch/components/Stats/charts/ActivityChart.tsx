import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Paper, SegmentedControl, Text } from '@mantine/core';
import { useState } from 'react';

interface ActivityDataPoint {
  date: string;
  displayDate: string;
  actions: number;
  users: number;
  actionsDetails?: Record<string, number>;
}

interface ActivityChartProps {
  data: ActivityDataPoint[];
  title?: string;
  onDateClick?: (date: string, actionsDetails?: Record<string, number>) => void;
}

export function ActivityChart({ data, title = 'Активность по дням', onDateClick }: ActivityChartProps) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  
  const handleClick = (data: any) => {
    if (onDateClick && data && data.activePayload) {
      const clickedData = data.activePayload[0]?.payload;
      if (clickedData) {
        onDateClick(clickedData.date, clickedData.actionsDetails);
      }
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text fw={600} size="lg">{title}</Text>
        <SegmentedControl
          value={chartType}
          onChange={(value) => setChartType(value as 'line' | 'bar')}
          data={[
            { label: 'Линейный', value: 'line' },
            { label: 'Столбчатый', value: 'bar' }
          ]}
          size="xs"
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        {chartType === 'line' ? (
          <LineChart 
            data={data} 
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onClick={handleClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-secondary)" opacity={0.3} />
            <XAxis 
              dataKey="displayDate" 
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
                color: 'var(--theme-text-primary)',
                cursor: onDateClick ? 'pointer' : 'default'
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="actions" 
              stroke="var(--color-primary-500)" 
              strokeWidth={2}
              name="Действия"
              dot={{ r: 4, cursor: onDateClick ? 'pointer' : 'default' }}
              activeDot={{ r: 6, cursor: onDateClick ? 'pointer' : 'default' }}
            />
            <Line 
              type="monotone" 
              dataKey="users" 
              stroke="var(--color-green-500)" 
              strokeWidth={2}
              name="Пользователи"
              dot={{ r: 4, cursor: onDateClick ? 'pointer' : 'default' }}
              activeDot={{ r: 6, cursor: onDateClick ? 'pointer' : 'default' }}
            />
          </LineChart>
        ) : (
          <BarChart 
            data={data} 
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            onClick={handleClick}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-secondary)" opacity={0.3} />
            <XAxis 
              dataKey="displayDate" 
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
                color: 'var(--theme-text-primary)',
                cursor: onDateClick ? 'pointer' : 'default'
              }}
            />
            <Legend />
            <Bar 
              dataKey="actions" 
              fill="var(--color-primary-500)" 
              name="Действия"
              style={{ cursor: onDateClick ? 'pointer' : 'default' }}
            />
            <Bar 
              dataKey="users" 
              fill="var(--color-green-500)" 
              name="Пользователи"
              style={{ cursor: onDateClick ? 'pointer' : 'default' }}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </Paper>
  );
}

