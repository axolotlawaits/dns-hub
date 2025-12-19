import { useState, useCallback, useEffect } from 'react';
import { API } from '../../config/constants';
import { useUserContext } from '../../hooks/useUserContext';
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
  Alert, 
  Modal,
  NumberInput,
  Switch,
  Table,
  Badge,
  ActionIcon,
  Divider,
  Select
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notificationSystem } from '../../utils/Push';
import { IconSettings, IconPlayerPlay, IconPlayerStop, IconDownload, IconFileZip } from '@tabler/icons-react';
import { usePageHeader } from '../../contexts/PageHeaderContext';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

const Scanner = () => {
  const { setHeader, clearHeader } = usePageHeader();
  const { user, token } = useUserContext();
  
  // Используем token из контекста или fallback на localStorage
  const authToken = token || localStorage.getItem('token');
  
  const [loading, setLoading] = useState(false);
  
  // Настройки сканирования
  const [settingsModalOpened, { open: openSettingsModal, close: closeSettingsModal }] = useDisclosure(false);
  const [selectedPrinterForScanning, setSelectedPrinterForScanning] = useState<string>('');
  const [pages, setPages] = useState<number>(1);
  const [unlimitedPages, setUnlimitedPages] = useState<boolean>(false);
  const [delaySeconds, setDelaySeconds] = useState<number>(5);
  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentFiles, setCurrentFiles] = useState<any[]>([]);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [knownPrinters, setKnownPrinters] = useState<any[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [folderSelectModalOpened, setFolderSelectModalOpened] = useState(false);
  const [tempFolderName, setTempFolderName] = useState<string>('');

  // Устанавливаем заголовок страницы
  useEffect(() => {
    setHeader({
      title: 'Сканирование документов',
      subtitle: 'Настройка и управление автоматическим сканированием документов'
    });

    return () => clearHeader();
  }, [setHeader, clearHeader]);

  // Сохранение настроек сканирования в UserSettings
  const saveUserSetting = useCallback(async (parameter: string, value: string) => {
    if (!user?.id) return;

    try {
      const response = await fetch(`${API}/user/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: user.id,
          parameter: parameter,
          value: value
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка сохранения настройки');
      }
    } catch (err) {
      console.error(`Error saving scanner setting ${parameter}:`, err);
      throw err; // Пробрасываем ошибку для обработки выше
    }
  }, [user?.id]);

  // Загрузка настроек сканирования
  const loadUserSetting = async (parameter: string) => {
    if (!user?.id) return null;
    
    try {
      const response = await fetch(`${API}/user/settings/${user.id}/${parameter}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.value;
    } catch (err) {
      console.error('Error loading scanner setting:', err);
      return null;
    }
  };

  // Загрузка настроек из UserSettings
  const loadSettings = useCallback(async () => {
    if (!user?.id) return;

    const savedPrinter = await loadUserSetting('scanner_printer');
    const savedPages = await loadUserSetting('scanner_pages');
    const savedUnlimited = await loadUserSetting('scanner_unlimited_pages');
    const savedDelay = await loadUserSetting('scanner_delay_seconds');
    // Не загружаем folderName из настроек, так как она выбирается при каждом запуске

    if (savedPrinter) {
      setSelectedPrinterForScanning(savedPrinter);
    }
    if (savedPages) setPages(parseInt(savedPages) || 1);
    if (savedUnlimited !== null) setUnlimitedPages(savedUnlimited === 'true');
    if (savedDelay) setDelaySeconds(parseInt(savedDelay) || 5);
    // folderName не загружаем из настроек - будет запрашиваться при каждом запуске
  }, [user?.id, knownPrinters, token]);

  // Загрузка списка известных принтеров
  const loadKnownPrinters = useCallback(async () => {
    try {
      setPrintersLoading(true);
      const response = await fetch(`${API}/scanner/printers`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.printers) {
          setKnownPrinters(data.printers);
        }
      }
    } catch (error) {
      console.error('Error loading known printers:', error);
    } finally {
      setPrintersLoading(false);
    }
  }, [selectedPrinterForScanning]);

  // Загрузка настроек при монтировании компонента
  useEffect(() => {
    if (user?.id) {
      loadSettings();
      loadKnownPrinters();
    }
  }, [user?.id, loadSettings, loadKnownPrinters]);

  // Загрузка настроек при открытии модального окна (только списка принтеров)
  useEffect(() => {
    if (settingsModalOpened && user?.id) {
      // Загружаем только список принтеров, не перезагружаем настройки (чтобы не сбрасывать режим ввода)
      loadKnownPrinters();
    }
  }, [settingsModalOpened, user?.id, loadKnownPrinters]);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    notificationSystem.addNotification(
      type === 'success' ? 'Успех' : 'Ошибка',
      message,
      type
    );
  }, []);

  // Сохранение всех настроек в UserSettings (кроме folderName)
  const saveAllSettings = useCallback(async () => {
    if (!user?.id) return;

    try {
      await Promise.all([
        saveUserSetting('scanner_printer', selectedPrinterForScanning || ''),
        saveUserSetting('scanner_pages', pages.toString()),
        saveUserSetting('scanner_unlimited_pages', unlimitedPages.toString()),
        saveUserSetting('scanner_delay_seconds', delaySeconds.toString())
        // folderName не сохраняем - выбирается при каждом запуске
      ]);
      console.log('[Scanner] Все настройки сохранены в UserSettings');
    } catch (error) {
      console.error('[Scanner] Ошибка сохранения настроек:', error);
      showNotification('error', 'Не удалось сохранить некоторые настройки');
    }
  }, [user?.id, selectedPrinterForScanning, pages, unlimitedPages, delaySeconds, saveUserSetting, showNotification]);

  // Сохранение настроек при закрытии модального окна
  const handleSaveSettings = async () => {
    await saveAllSettings();
    showNotification('success', 'Настройки сохранены');
    closeSettingsModal();
  };

  // Запуск сканирования
  const handleStartScanning = async () => {
    // Используем сохраненные настройки или текущие значения
    const printerToUse = selectedPrinterForScanning;
    
    if (!printerToUse) {
      showNotification('error', 'Выберите принтер для сканирования в настройках');
      return;
    }

    // Открываем модальное окно для выбора папки
    setTempFolderName('scanned_documents');
    setFolderSelectModalOpened(true);
  };

  // Подтверждение запуска сканирования с выбранной папкой
  const handleConfirmStartScanning = async () => {
    if (!tempFolderName || tempFolderName.trim() === '') {
      showNotification('error', 'Введите название папки');
      return;
    }

    const printerToUse = selectedPrinterForScanning;
    if (!printerToUse) {
      showNotification('error', 'Выберите принтер для сканирования в настройках');
      return;
    }

    // Сохраняем текущие настройки перед запуском (кроме папки)
    if (user?.id) {
      await Promise.all([
        saveUserSetting('scanner_printer', selectedPrinterForScanning || ''),
        saveUserSetting('scanner_pages', pages.toString()),
        saveUserSetting('scanner_unlimited_pages', unlimitedPages.toString()),
        saveUserSetting('scanner_delay_seconds', delaySeconds.toString())
        // Не сохраняем folderName в настройки, так как она выбирается каждый раз
      ]);
    }

    const [ip, port] = printerToUse.split(':');
    
    try {
      setLoading(true);
      setFolderSelectModalOpened(false);
      
      const printerPortNum = parseInt(port, 10);
    if (isNaN(printerPortNum) || printerPortNum < 1 || printerPortNum > 65535) {
      showNotification('error', 'Неверный формат порта принтера (должен быть от 1 до 65535)');
      setLoading(false);
      return;
    }

    const requestBody = {
      printerIp: ip.trim(),
      printerPort: printerPortNum,
      pages: unlimitedPages ? null : pages,
      unlimitedPages: unlimitedPages || false,
      delaySeconds: delaySeconds || 5,
      folderName: tempFolderName.trim() || 'scanned_documents'
    };

    console.log('[Scanner] Запуск сканирования с параметрами:', requestBody);

    const response = await fetch(`${API}/scanner/start-scanning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = 'Ошибка запуска сканирования';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        console.error('[Scanner] Ошибка от сервера:', errorData);
      } catch (e) {
        console.error('[Scanner] Не удалось распарсить ответ об ошибке:', e);
      }
      throw new Error(errorMessage);
    }

      const data = await response.json();
      if (data.success) {
        setIsScanningActive(true);
        setCurrentSessionId(data.sessionId || null);
        showNotification('success', 'Сканирование запущено');
        // Загружаем файлы текущей сессии
        if (data.sessionId) {
          loadCurrentFiles(data.sessionId);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Отмена выбора папки
  const handleCancelFolderSelect = useCallback(() => {
    setFolderSelectModalOpened(false);
    setTempFolderName('');
  }, []);

  // Остановка сканирования
  const handleStopScanning = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/scanner/stop-scanning`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Ошибка остановки сканирования');
      }

      const data = await response.json();
      if (data.success) {
        setIsScanningActive(false);
        showNotification('success', 'Сканирование остановлено');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка текущих файлов сессии
  const loadCurrentFiles = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${API}/scanner/session/${sessionId}/files`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          setCurrentFiles(data.files);
        }
      }
    } catch (error) {
      console.error('Error loading current files:', error);
    }
  }, []);

  // Загрузка истории сканирований
  const loadScanHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const response = await fetch(`${API}/scanner/history`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.sessions) {
          setScanHistory(data.sessions);
        }
      }
    } catch (error) {
      console.error('Error loading scan history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Скачивание отдельного файла
  const handleDownloadFile = useCallback(async (fileId: string, fileName: string) => {
    try {
      const response = await fetch(`${API}/scanner/file/${fileId}/download`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка скачивания файла');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showNotification('success', 'Файл скачан');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    }
  }, [showNotification]);

  // Скачивание zip архива сессии
  const handleDownloadZip = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${API}/scanner/session/${sessionId}/download-zip`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка создания архива');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan_session_${sessionId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showNotification('success', 'Архив скачан');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка';
      showNotification('error', errorMsg);
    }
  }, [showNotification]);

  // Проверка статуса сканирования
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API}/scanner/scanning-status`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setIsScanningActive(data.isActive || false);
          if (data.sessionId) {
            setCurrentSessionId(data.sessionId);
            if (data.files) {
              setCurrentFiles(data.files);
            } else if (data.sessionId) {
              loadCurrentFiles(data.sessionId);
            }
          }
        }
      } catch (error) {
        console.error('Error checking scanning status:', error);
      }
    };

    checkStatus();
    loadScanHistory(); // Загружаем историю при монтировании
    const interval = setInterval(() => {
      checkStatus();
      if (isScanningActive && currentSessionId) {
        loadCurrentFiles(currentSessionId);
      }
    }, 5000); // Проверяем каждые 5 секунд
    return () => clearInterval(interval);
  }, [isScanningActive, currentSessionId, loadCurrentFiles, loadScanHistory]);


  return (
    <Box p="md">
      {/* Панель управления сканированием документов */}
      <Card withBorder shadow="sm" radius="md" p="md" mb="xl">
        <Group justify="space-between" mb="md">
          <Title order={4}>Сканирование документов</Title>
          <Group>
            <Button
              onClick={openSettingsModal}
              leftSection={<IconSettings size="1rem" />}
              variant="light"
            >
              Настройки
            </Button>
            {isScanningActive ? (
              <Button
                onClick={handleStopScanning}
                leftSection={<IconPlayerStop size="1rem" />}
                color="red"
                loading={loading}
              >
                Остановить
              </Button>
            ) : (
              <Button
                onClick={handleStartScanning}
                leftSection={<IconPlayerPlay size="1rem" />}
                color="green"
                loading={loading}
                disabled={!selectedPrinterForScanning}
              >
                Запустить
              </Button>
            )}
          </Group>
        </Group>

        {isScanningActive && (
          <Alert variant="light" color="green" mb="md">
            <Text size="sm">Сканирование активно</Text>
          </Alert>
        )}
      </Card>

      {/* Текущие отсканированные файлы */}
      {currentFiles.length > 0 && (
        <Card withBorder shadow="sm" radius="md" p="md" mb="xl">
          <Group justify="space-between" mb="md">
            <Title order={4}>Отсканированные файлы</Title>
            {currentSessionId && (
              <Button
                onClick={() => handleDownloadZip(currentSessionId)}
                leftSection={<IconFileZip size="1rem" />}
                variant="light"
                size="sm"
              >
                Скачать все в ZIP
              </Button>
            )}
          </Group>
          
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Имя файла</Table.Th>
                <Table.Th>Размер</Table.Th>
                <Table.Th>Дата сканирования</Table.Th>
                <Table.Th>Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {currentFiles.map((file) => (
                <Table.Tr key={file.id}>
                  <Table.Td>
                    <Text fw={500}>{file.fileName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {(file.fileSize / 1024).toFixed(2)} KB
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {dayjs(file.scannedAt).format('DD.MM.YYYY HH:mm:ss')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleDownloadFile(file.id, file.fileName)}
                      title="Скачать файл"
                    >
                      <IconDownload size="1rem" />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* История сканирований */}
      <Card withBorder shadow="sm" radius="md" p="md">
        <Group justify="space-between" mb="md">
          <Title order={4}>История сканирований</Title>
          <Button
            onClick={loadScanHistory}
            loading={historyLoading}
            variant="light"
            size="sm"
          >
            Обновить
          </Button>
        </Group>

        {scanHistory.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            История сканирований пуста
          </Text>
        ) : (
          <Stack gap="md">
            {scanHistory.map((session) => (
              <Card key={session.id} withBorder p="md">
                <Group justify="space-between" mb="xs">
                  <Group>
                    <Text fw={500}>
                      {session.printerIp}:{session.printerPort}
                    </Text>
                    <Badge
                      color={
                        session.status === 'active' ? 'green' :
                        session.status === 'completed' ? 'blue' : 'gray'
                      }
                      variant="light"
                    >
                      {session.status === 'active' ? 'Активно' :
                       session.status === 'completed' ? 'Завершено' : 'Остановлено'}
                    </Badge>
                  </Group>
                  <Group>
                    <Text size="sm" c="dimmed">
                      {dayjs(session.startedAt).format('DD.MM.YYYY HH:mm:ss')}
                    </Text>
                    {session.files.length > 0 && (
                      <Button
                        onClick={() => handleDownloadZip(session.id)}
                        leftSection={<IconFileZip size="1rem" />}
                        variant="light"
                        size="xs"
                      >
                        ZIP
                      </Button>
                    )}
                  </Group>
                </Group>
                
                <Text size="sm" c="dimmed" mb="xs">
                  Файлов: {session.files.length} | Папка: {session.folderName}
                </Text>

                {session.files.length > 0 && (
                  <>
                    <Divider my="xs" />
                    <Table>
                      <Table.Tbody>
                        {session.files.map((file: any) => (
                          <Table.Tr key={file.id}>
                            <Table.Td>
                              <Text size="sm">{file.fileName}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {(file.fileSize / 1024).toFixed(2)} KB
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" c="dimmed">
                                {dayjs(file.scannedAt).format('DD.MM.YYYY HH:mm')}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => handleDownloadFile(file.id, file.fileName)}
                                title="Скачать файл"
                                size="sm"
                              >
                                <IconDownload size="0.875rem" />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </>
                )}
              </Card>
            ))}
          </Stack>
        )}
      </Card>

      {/* Модальное окно настроек сканирования */}
      <Modal
        opened={settingsModalOpened}
        onClose={async () => {
          // Автоматически сохраняем настройки при закрытии
          await saveAllSettings();
          closeSettingsModal();
        }}
        title="Настройки сканирования документов"
        size="md"
      >
        <Stack gap="md">
          <Select
            label="Выбор принтера или сканера"
            placeholder="Выберите из списка известных принтеров"
            description="Выберите принтер из списка найденных принтеров"
            data={knownPrinters.map(p => ({
              value: `${p.ip}:${p.port}`,
              label: p.displayName || `${p.ip}:${p.port}`
            }))}
            value={knownPrinters.some(p => `${p.ip}:${p.port}` === selectedPrinterForScanning) 
              ? selectedPrinterForScanning 
              : null}
            onChange={async (value) => {
              if (!value) {
                setSelectedPrinterForScanning('');
                return;
              }
              
              setSelectedPrinterForScanning(value);
              
              // Автоматически сохраняем при изменении
              if (user?.id && value) {
                await saveUserSetting('scanner_printer', value);
              }
            }}
            searchable
            clearable
            disabled={printersLoading}
            required
          />

          <Switch
            label="Без ограничения страниц"
            description="Настройка сохраняется в UserSettings"
            checked={unlimitedPages}
            onChange={async (event) => {
              const newValue = event.currentTarget.checked;
              setUnlimitedPages(newValue);
              // Автоматически сохраняем при изменении
              if (user?.id) {
                await saveUserSetting('scanner_unlimited_pages', newValue.toString());
              }
            }}
          />

          {!unlimitedPages && (
            <NumberInput
              label="Количество страниц"
              description="Настройка сохраняется в UserSettings"
              placeholder="Введите количество страниц"
              value={pages}
              onChange={async (value) => {
                const numValue = typeof value === 'number' ? value : 1;
                setPages(numValue);
                // Автоматически сохраняем при изменении
                if (user?.id) {
                  await saveUserSetting('scanner_pages', numValue.toString());
                }
              }}
              min={1}
              required
            />
          )}

          <NumberInput
            label="Интервал между сканированиями (секунды)"
            description="Настройка сохраняется в UserSettings"
            placeholder="Введите интервал в секундах"
            value={delaySeconds}
            onChange={async (value) => {
              const numValue = typeof value === 'number' ? value : 5;
              setDelaySeconds(numValue);
              // Автоматически сохраняем при изменении
              if (user?.id) {
                await saveUserSetting('scanner_delay_seconds', numValue.toString());
              }
            }}
            min={1}
            required
          />

          <Group justify="flex-end" mt="md">
            <Button 
              variant="outline" 
              onClick={async () => {
                // При отмене загружаем сохраненные настройки обратно
                await loadSettings();
                closeSettingsModal();
              }}
            >
              Отмена
            </Button>
            <Button onClick={handleSaveSettings}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Модальное окно выбора папки при запуске сканирования */}
      <Modal
        opened={folderSelectModalOpened}
        onClose={handleCancelFolderSelect}
        title="Выбор папки для сканирования"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Введите название папки, куда будут сохраняться отсканированные документы. 
            Папка будет создана автоматически.
          </Text>
          
          <TextInput
            label="Название папки"
            placeholder="scanned_documents"
            value={tempFolderName}
            onChange={(event) => setTempFolderName(event.currentTarget.value)}
            required
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tempFolderName.trim()) {
                handleConfirmStartScanning();
              }
            }}
          />

          <Group justify="flex-end" mt="md">
            <Button 
              variant="outline" 
              onClick={handleCancelFolderSelect}
            >
              Отмена
            </Button>
            <Button 
              onClick={handleConfirmStartScanning}
              disabled={!tempFolderName || tempFolderName.trim() === ''}
              loading={loading}
            >
              Запустить сканирование
            </Button>
          </Group>
        </Stack>
      </Modal>

      <LoadingOverlay visible={loading} />
    </Box>
  );
};

export default Scanner;
