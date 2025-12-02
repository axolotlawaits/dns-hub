import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { Paper, Text } from '@mantine/core';

interface FunnelDataPoint {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface FunnelChartProps {
  data: FunnelDataPoint[];
  title?: string;
}

export function FunnelChart({ data, title = 'Воронка конверсии' }: FunnelChartProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} size="lg" mb="md">{title}</Text>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart 
          data={data} 
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border-secondary)" opacity={0.3} />
          <XAxis 
            type="number"
            tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--theme-border-secondary)' }}
          />
          <YAxis 
            type="category"
            dataKey="name"
            tick={{ fill: 'var(--theme-text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--theme-border-secondary)' }}
            width={90}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--theme-bg-elevated)',
              border: '1px solid var(--theme-border-primary)',
              borderRadius: '8px',
              color: 'var(--theme-text-primary)'
            }}
            formatter={(value: number, _name: string, props: any) => [
              `${value} (${props.payload.percentage}%)`,
              'Количество'
            ]}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}

