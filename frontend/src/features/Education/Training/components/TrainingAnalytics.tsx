import { useState, useEffect } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  Card,
  RingProgress,
  Progress
} from '@mantine/core';
import { API } from '../../../../config/constants';

function TrainingAnalytics() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/training/analytics`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных');
      }

      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Ошибка при загрузке аналитики:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return <Text>Загрузка...</Text>;
  }

  return (
    <Stack>
      <Group>
        <Card>
          <Text size="lg" fw={600}>Всего управляющих</Text>
          <Text size="xl">{analytics.managers.total}</Text>
        </Card>
        <Card>
          <Text size="lg" fw={600}>Действующих</Text>
          <Text size="xl" c="green">{analytics.managers.active}</Text>
        </Card>
        <Card>
          <Text size="lg" fw={600}>Пониженных</Text>
          <Text size="xl" c="orange">{analytics.managers.demoted}</Text>
        </Card>
        <Card>
          <Text size="lg" fw={600}>Уволенных</Text>
          <Text size="xl" c="red">{analytics.managers.fired}</Text>
        </Card>
      </Group>

      <Paper p="md">
        <Text size="lg" fw={600} mb="md">Статистика по обучению</Text>
        <Stack>
          {analytics.progress.map((stat: any) => (
            <div key={stat.status}>
              <Group justify="space-between" mb="xs">
                <Text>{stat.status}</Text>
                <Text fw={600}>{stat.count}</Text>
              </Group>
              <Progress
                value={(stat.count / analytics.managers.total) * 100}
                size="sm"
              />
            </div>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

export default TrainingAnalytics;
