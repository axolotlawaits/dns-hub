import { useState, useEffect } from 'react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { Avatar, Card, Text, Group, Badge, Skeleton, Stack, Box } from '@mantine/core';


interface UserData {
  fio: string;
  birthday: string;
  code: string;
  email: string;
  status: string;
  branch: {
    rrs: string;
    division: string;
    name: string;
    city: string;
    address: string;
  };
    position: {
      name:string;
  };
}

const ProfileInfo = () => {
  const { user } = useUserContext();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`${API}/profile/user-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ email: user.email })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const data: UserData = await response.json();
        setUserData(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user?.email]);

  if (loading) {
    return (
      <Stack>
        <Skeleton height={50} circle mb="xl" />
        <Skeleton height={8} radius="xl" />
        <Skeleton height={8} mt={6} radius="xl" />
        <Skeleton height={8} mt={6} width="70%" radius="xl" />
      </Stack>
    );
  }

  if (error) {
    return <Text c="red">Ошибка: {error}</Text>;
  }

  if (!userData) {
    return <Text>Нет данных пользователя</Text>;
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group align="flex-start" wrap="nowrap">
        <Avatar
          src={`data:image/jpeg;base64,${user?.image}`}
          size={120}
          radius={60}
        />
        <Box style={{ flex: 1 }}>
          <Group justify="space-between">
            <Text size="lg" fw={500}>
              {userData.fio}
            </Text>
            <Badge color={userData.status === 'active' ? 'green' : 'red'} variant="light">
              {userData.status}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            {userData.position.name || 'Не указано'}
          </Text>
          <Group gap="xl" mt="md">
            <Stack gap="xs">
              <Group gap="md">
                <Text size="sm" c="dimmed">РРС:</Text>
                <Text size="sm">{userData.branch.rrs || 'Не указано'}</Text>
              </Group>
              <Group gap="md">
                <Text size="sm" c="dimmed">Отдел:</Text>
                <Text size="sm">{userData.branch.name || 'Не указано'}</Text>
              </Group>
            </Stack>
            <Stack gap="xs">
              <Group gap="md">
                <Text size="sm" c="dimmed">Дата рождения:</Text>
                <Text size="sm">{new Date(userData.birthday).toLocaleDateString()}</Text>
              </Group>
              <Group gap="md">
                <Text size="sm" c="dimmed">Email:</Text>
                <Text size="sm">{userData.email}</Text>
              </Group>
            </Stack>
          </Group>
        </Box>
      </Group>

      {/* Код сотрудника внизу слева */}

        

    </Card>
  );
};

export default ProfileInfo;