import { useState, useCallback, useMemo, useEffect } from 'react';
import { API } from '../../config/constants';
import { 
  Button, 
  Title, 
  Box, 
  LoadingOverlay, 
  Group, 
  TextInput, 
  Card, 
  Stack, 
  Text, 
  Badge, 
  Alert, 
  Progress, 
  Table, 
  ActionIcon, 
  Modal,
  Divider,
  Grid,
  Paper
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notificationSystem } from '../../utils/Push';
import { IconRefresh, IconSearch, IconInfoCircle } from '@tabler/icons-react';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

interface PrinterInfo {
  ip: string;
  port: number;
  status: 'online' | 'offline';
  responseTime?: number;
  vendor?: string;
  model?: string;
  hasScanner?: boolean;
  scannerType?: string;
  lastSeen: string;
}

interface NetworkScanResult {
  printers: PrinterInfo[];
  totalScanned: number;
  scanDuration: number;
  errors: string[];
}

const Scanner = () => {
  const { setHeader, clearHeader } = usePageHeader();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanResult, setScanResult] = useState<NetworkScanResult | null>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterInfo | null>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Поиск принтеров со сканерами',
      subtitle: 'Сканирование сети и поиск устройств с возможностью сканирования'
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);
  
  // Параметры сканирования
  const [scanParams, setScanParams] = useState({
    ports: [9100, 631, 515, 80, 443],
    customPorts: ''
  });

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    notificationSystem.addNotification(
      type === 'success' ? 'Успех' : 'Ошибка',
      message,
      type
    );
  }, []);

  // Сканирование сети
  const scanNetwork = useCallback(async () => {
    try {
      setLoading(true);
      setScanProgress(0);
      setScanResult(null);

      const ports = scanParams.customPorts 
        ? scanParams.customPorts.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p))
        : scanParams.ports;

      const requestBody = { ports };

      const response = await fetch(`${API}/scanner/scan-network`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Ошибка сканирования сети');
      }

      const data = await response.json();
      if (data.success && data.result) {
        setScanResult(data.result);
        setPrinters(data.result.printers);
        showNotification('success', `Найдено ${data.result.printers.length} принтеров`);
      } else {
        showNotification('error', 'Ошибка сканирования сети');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
      setScanProgress(0);
    }
  }, [scanParams, showNotification]);

  // Загрузка известных принтеров
  const loadKnownPrinters = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/scanner/printers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки принтеров');
      }

      const data = await response.json();
      if (data.success) {
        setPrinters(data.printers || []);
        showNotification('success', 'Список принтеров обновлен');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  // Обработка выбора принтера
  const handlePrinterSelect = useCallback((printer: PrinterInfo) => {
    setSelectedPrinter(printer);
    openModal();
  }, [openModal]);

  // Статистика принтеров
  const printerStats = useMemo(() => {
    const online = printers.filter(p => p.status === 'online').length;
    const offline = printers.filter(p => p.status === 'offline').length;
    const withScanner = printers.filter(p => p.hasScanner === true).length;
    
    return { online, offline, withScanner, total: printers.length };
  }, [printers]);

  // Строки таблицы принтеров
  const printerRows = printers.map((printer) => (
    <Table.Tr key={`${printer.ip}:${printer.port}`}>
      <Table.Td>
        <Group gap="xs">
          <Badge 
            color={printer.status === 'online' ? 'green' : printer.status === 'offline' ? 'red' : 'gray'}
            variant="light"
          >
            {printer.status === 'online' ? 'Онлайн' : printer.status === 'offline' ? 'Офлайн' : 'Неизвестно'}
          </Badge>
          <Text fw={500}>{printer.ip}:{printer.port}</Text>
        </Group>
      </Table.Td>
      <Table.Td>
        {printer.vendor && printer.model ? `${printer.vendor} ${printer.model}` : 'Неизвестно'}
      </Table.Td>
      <Table.Td>
        {printer.responseTime ? `${printer.responseTime}мс` : '-'}
      </Table.Td>
      <Table.Td>
        <Badge 
          color={printer.hasScanner ? 'green' : 'gray'}
          variant="light"
        >
          {printer.scannerType || (printer.hasScanner ? 'Со сканером' : 'Только принтер')}
        </Badge>
      </Table.Td>
      <Table.Td>
        {dayjs(printer.lastSeen).format('DD.MM.YYYY HH:mm:ss')}
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <ActionIcon
            variant="light"
            color="blue"
            onClick={() => handlePrinterSelect(printer)}
            title="Подробности"
          >
            <IconInfoCircle size="1rem" />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Box p="md">
      
      {/* Статистика */}
      <Grid mb="xl">
        <Grid.Col span={3}>
          <Paper p="md" withBorder>
            <Text size="sm" c="dimmed">Всего найдено</Text>
            <Text size="xl" fw={700}>{printerStats.total}</Text>
          </Paper>
        </Grid.Col>
        <Grid.Col span={3}>
          <Paper p="md" withBorder>
            <Text size="sm" c="dimmed">Онлайн</Text>
            <Text size="xl" fw={700} c="green">{printerStats.online}</Text>
          </Paper>
        </Grid.Col>
        <Grid.Col span={3}>
          <Paper p="md" withBorder>
            <Text size="sm" c="dimmed">Офлайн</Text>
            <Text size="xl" fw={700} c="red">{printerStats.offline}</Text>
          </Paper>
        </Grid.Col>
        <Grid.Col span={3}>
          <Paper p="md" withBorder>
            <Text size="sm" c="dimmed">Со сканером</Text>
            <Text size="xl" fw={700} c="green">{printerStats.withScanner}</Text>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Панель управления */}
      <Card withBorder shadow="sm" radius="md" p="md" mb="xl">
        <Title order={4} mb="md">Сканирование локальной сети</Title>
        
        <Alert variant="light" color="blue" title="Автоматическое сканирование" mb="md">
          <Text size="sm">
            Сканер автоматически определит все подсети сервера и найдет принтеры со сканерами.
            Сканирование может занять несколько минут в зависимости от размера сети.
          </Text>
        </Alert>

        <Grid>
          <Grid.Col span={6}>
            <TextInput
              label="Порты для сканирования (через запятую)"
              placeholder="9100, 631, 515, 80, 443"
              value={scanParams.customPorts}
              onChange={(event) => setScanParams(prev => ({ 
                ...prev, 
                customPorts: event.currentTarget.value 
              }))}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Group align="flex-end">
              <Button
                onClick={scanNetwork}
                loading={loading}
                leftSection={<IconSearch size="1rem" />}
                color="blue"
                size="lg"
              >
                Сканировать локальную сеть
              </Button>
              <Button
                onClick={loadKnownPrinters}
                loading={loading}
                leftSection={<IconRefresh size="1rem" />}
                variant="outline"
              >
                Обновить
              </Button>
            </Group>
          </Grid.Col>
        </Grid>

        {scanProgress > 0 && (
          <Box mt="md">
            <Text size="sm" mb="xs">Прогресс сканирования: {scanProgress}%</Text>
            <Progress value={scanProgress} size="sm" />
          </Box>
        )}
      </Card>

      {/* Результаты сканирования */}
      {scanResult && (
        <Alert variant="light" color="blue" title="Результаты сканирования" mb="md">
          <Text size="sm">
            Просканировано: {scanResult.totalScanned} адресов за {scanResult.scanDuration}мс
          </Text>
          {scanResult.errors.length > 0 && (
            <Text size="sm" c="red" mt="xs">
              Ошибок: {scanResult.errors.length}
            </Text>
          )}
        </Alert>
      )}

      {/* Таблица принтеров */}
      <Card withBorder shadow="sm" radius="md" p={0}>
        <Box p="md">
          <Group justify="space-between" align="center">
            <Title order={4}>Найденные принтеры</Title>
            <Badge variant="light" size="lg">
              {printers.length} устройств
            </Badge>
          </Group>
        </Box>
        
        <Divider />
        
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Адрес</Table.Th>
              <Table.Th>Модель</Table.Th>
              <Table.Th>Время отклика</Table.Th>
              <Table.Th>Тип устройства</Table.Th>
              <Table.Th>Последняя проверка</Table.Th>
              <Table.Th>Действия</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {printerRows.length > 0 ? printerRows : (
              <Table.Tr>
                <Table.Td colSpan={6} ta="center" py="xl">
                  <Text c="dimmed">Принтеры не найдены</Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Модальное окно с деталями принтера */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title="Детали принтера"
        size="md"
      >
        {selectedPrinter && (
          <Stack gap="md">
            <Group>
              <Text fw={500}>IP адрес:</Text>
              <Text>{selectedPrinter.ip}:{selectedPrinter.port}</Text>
            </Group>
            
            <Group>
              <Text fw={500}>Статус:</Text>
              <Badge 
                color={selectedPrinter.status === 'online' ? 'green' : 'red'}
                variant="light"
              >
                {selectedPrinter.status === 'online' ? 'Онлайн' : 'Офлайн'}
              </Badge>
            </Group>
            
            {selectedPrinter.vendor && (
              <Group>
                <Text fw={500}>Производитель:</Text>
                <Text>{selectedPrinter.vendor}</Text>
              </Group>
            )}
            
            {selectedPrinter.model && (
              <Group>
                <Text fw={500}>Модель:</Text>
                <Text>{selectedPrinter.model}</Text>
              </Group>
            )}
            
            {selectedPrinter.responseTime && (
              <Group>
                <Text fw={500}>Время отклика:</Text>
                <Text>{selectedPrinter.responseTime}мс</Text>
              </Group>
            )}
            
            <Group>
              <Text fw={500}>Тип устройства:</Text>
              <Badge 
                color={selectedPrinter.hasScanner ? 'green' : 'gray'}
                variant="light"
              >
                {selectedPrinter.scannerType || (selectedPrinter.hasScanner ? 'Принтер со сканером' : 'Только принтер')}
              </Badge>
            </Group>
            
            <Group>
              <Text fw={500}>Последняя проверка:</Text>
              <Text>{dayjs(selectedPrinter.lastSeen).format('DD.MM.YYYY HH:mm:ss')}</Text>
            </Group>
          </Stack>
        )}
      </Modal>

      <LoadingOverlay visible={loading} />
    </Box>
  );
};

export default Scanner;
