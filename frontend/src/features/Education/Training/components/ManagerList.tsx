import { useState } from 'react';
import {
  Table,
  Text,
  Badge,
  ActionIcon,
  Group,
  Paper,
  Stack
} from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { CustomModal } from '../../../../utils/CustomModal';
import ManagerCard from './ManagerCard';

interface Manager {
  id: string;
  userId: string;
  name: string;
  email: string;
  position: string;
  category: string | null;
  branch: string;
  branchCode: string | null;
  rrs: string | null;
  city: string | null;
  status: 'ACTIVE' | 'DEMOTED' | 'FIRED';
  branchCount: number | null;
  employeeCount: number | null;
  trainingProgress: any[];
  homeworkStatuses: any[];
  employmentHistory: any[];
}

interface ManagerListProps {
  managers: Manager[];
  onRefresh: () => void;
}

function ManagerList({ managers, onRefresh }: ManagerListProps) {
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  const [detailsOpened, { open: openDetails, close: closeDetails }] = useDisclosure(false);

  const handleViewDetails = (manager: Manager) => {
    setSelectedManager(manager);
    openDetails();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'green';
      case 'DEMOTED':
        return 'orange';
      case 'FIRED':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Действующий';
      case 'DEMOTED':
        return 'Понижен';
      case 'FIRED':
        return 'Уволен';
      default:
        return status;
    }
  };

  if (managers.length === 0) {
    return (
      <Paper p="xl" style={{ textAlign: 'center' }}>
        <Text c="dimmed">Нет данных для отображения</Text>
      </Paper>
    );
  }

  return (
    <>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ФИО</Table.Th>
            <Table.Th>Должность</Table.Th>
            <Table.Th>Филиал</Table.Th>
            <Table.Th>РРС</Table.Th>
            <Table.Th>Статус</Table.Th>
            <Table.Th>Модули</Table.Th>
            <Table.Th>Действия</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {managers.map((manager) => (
            <Table.Tr key={manager.id}>
              <Table.Td>
                <Text fw={500}>{manager.name}</Text>
                <Text size="xs" c="dimmed">{manager.email}</Text>
              </Table.Td>
              <Table.Td>
                <Text>{manager.position}</Text>
                {manager.category && (
                  <Text size="xs" c="dimmed">{manager.category}</Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text>{manager.branch}</Text>
                {manager.branchCode && (
                  <Text size="xs" c="dimmed">Код: {manager.branchCode}</Text>
                )}
              </Table.Td>
              <Table.Td>{manager.rrs || '-'}</Table.Td>
              <Table.Td>
                <Badge color={getStatusColor(manager.status)}>
                  {getStatusLabel(manager.status)}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap="xs">
                  {manager.trainingProgress
                    .filter(tp => tp.trainingProgram?.type?.name === 'ОБЯЗАТЕЛЬНЫЙ_МОДУЛЬ')
                    .map((tp, idx) => (
                      <Badge
                        key={idx}
                        size="xs"
                        color={
                          tp.status?.name === 'ЗАВЕРШЕНО' ? 'green' :
                          tp.status?.name === 'В_ПРОЦЕССЕ' ? 'blue' : 'gray'
                        }
                      >
                        {tp.status?.name || 'НЕ_НАЧАЛ'}
                      </Badge>
                    ))}
                </Group>
              </Table.Td>
              <Table.Td>
                <Group gap="xs">
                  <ActionIcon
                    variant="light"
                    onClick={() => handleViewDetails(manager)}
                  >
                    <IconEye size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <CustomModal
        opened={detailsOpened}
        onClose={closeDetails}
        title={selectedManager?.name || 'Детали управляющего'}
        size="xl"
      >
        {selectedManager && (
          <ManagerCard manager={selectedManager} onRefresh={onRefresh} />
        )}
      </CustomModal>
    </>
  );
}

export default ManagerList;
