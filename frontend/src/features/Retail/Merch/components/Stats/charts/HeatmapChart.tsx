import { Paper, Text, Tooltip as MantineTooltip } from '@mantine/core';
import { useMemo } from 'react';

interface HeatmapDataPoint {
  day: number; // 0-6 (понедельник-воскресенье)
  hour: number; // 0-23
  count: number;
}

interface HeatmapChartProps {
  data: HeatmapDataPoint[];
  title?: string;
}

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColorIntensity(value: number, max: number): string {
  if (max === 0) return 'var(--theme-bg-secondary)';
  const intensity = value / max;
  if (intensity === 0) return 'var(--theme-bg-secondary)';
  if (intensity < 0.2) return 'rgba(56, 189, 248, 0.2)'; // light-blue-200
  if (intensity < 0.4) return 'rgba(56, 189, 248, 0.4)'; // light-blue-400
  if (intensity < 0.6) return 'rgba(56, 189, 248, 0.6)'; // light-blue-600
  if (intensity < 0.8) return 'rgba(56, 189, 248, 0.8)'; // light-blue-800
  return 'rgba(56, 189, 248, 1)'; // light-blue-900
}

export function HeatmapChart({ data, title = 'Активность по дням недели и часам' }: HeatmapChartProps) {
  const heatmapData = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(point => {
      const key = `${point.day}_${point.hour}`;
      map.set(key, (map.get(key) || 0) + point.count);
    });

    const result: Array<Array<{ day: number; hour: number; count: number }>> = [];
    for (let day = 0; day < 7; day++) {
      const row: Array<{ day: number; hour: number; count: number }> = [];
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}_${hour}`;
        row.push({ day, hour, count: map.get(key) || 0 });
      }
      result.push(row);
    }
    return result;
  }, [data]);

  const maxValue = useMemo(() => {
    return Math.max(...heatmapData.flat().map(cell => cell.count));
  }, [heatmapData]);

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} size="lg" mb="md">{title}</Text>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(24, 1fr)', gap: '4px', minWidth: '1200px' }}>
          {/* Заголовок часов */}
          <div></div>
          {HOURS.map(hour => (
            <div key={hour} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--theme-text-secondary)' }}>
              {hour}
            </div>
          ))}
          
          {/* Строки для каждого дня */}
          {heatmapData.map((row, dayIndex) => (
            <div key={dayIndex} style={{ display: 'contents' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                fontSize: '12px', 
                fontWeight: 500,
                color: 'var(--theme-text-primary)'
              }}>
                {DAYS[dayIndex]}
              </div>
              {row.map((cell, hourIndex) => (
                <MantineTooltip
                  key={`${dayIndex}_${hourIndex}`}
                  label={`${DAYS[dayIndex]}, ${hourIndex}:00 - ${cell.count} действий`}
                  withArrow
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      backgroundColor: getColorIntensity(cell.count, maxValue),
                      border: '1px solid var(--theme-border-primary)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)';
                      e.currentTarget.style.zIndex = '10';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.zIndex = '1';
                    }}
                  />
                </MantineTooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--theme-text-secondary)' }}>
        <span>Меньше</span>
        <div style={{ display: 'flex', gap: '2px', flex: 1, maxWidth: '200px' }}>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity) => (
            <div
              key={intensity}
              style={{
                flex: 1,
                height: '12px',
                backgroundColor: getColorIntensity(intensity * maxValue, maxValue),
                border: '1px solid var(--theme-border-primary)',
                borderRadius: '2px'
              }}
            />
          ))}
        </div>
        <span>Больше</span>
      </div>
    </Paper>
  );
}

