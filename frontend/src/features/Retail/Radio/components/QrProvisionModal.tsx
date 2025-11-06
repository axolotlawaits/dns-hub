import { useEffect, useState } from 'react';
import { Modal, Stack, Group, Text, Button, Paper, Textarea, Badge, Code, Title } from '@mantine/core';
import { IconQrcode, IconAlertCircle, IconCopy, IconRefresh } from '@tabler/icons-react';
import { API } from '../../../../config/constants';
import axios from 'axios';

interface QrProvisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string | null;
  deviceName?: string;
  appId?: string; // ID приложения из AppStore (например, Radio)
}

export default function QrProvisionModal({ isOpen, onClose, deviceId, deviceName, appId }: QrProvisionModalProps) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrJson, setQrJson] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [apkChecksum, setApkChecksum] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [currentApiIndex, setCurrentApiIndex] = useState(0);

  // Функция для добавления отладочных логов
  const addDebugLog = (message: string) => {
    setDebugLogs(prev => [...prev.slice(-49), `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  // Загрузка APK информации при открытии модалки
  useEffect(() => {
    if (isOpen && appId) {
      const prepareQrProvisioning = async () => {
        setIsLoading(true);
        setDebugLogs([]);
        addDebugLog('📱 Подготовка QR provisioning для Device Owner...');
        
        try {
          // Получаем информацию о последней версии приложения
          addDebugLog(`📦 Получение информации о приложении: ${appId}`);
          const appResponse = await axios.get(`${API}/retail/app-store/${appId}`);
          
          if (!appResponse.data.success || !appResponse.data.app) {
            addDebugLog('❌ Ошибка: Приложение не найдено');
            setIsLoading(false);
            return;
          }

          const app = appResponse.data.app;
          
          // Получаем последнюю активную версию
          if (!app.versions || app.versions.length === 0) {
            addDebugLog('❌ Ошибка: Версии приложения не найдены');
            setIsLoading(false);
            return;
          }

          const latestVersion = app.versions[0]; // Уже отсортированы по дате
          addDebugLog(`✅ Найдена версия: ${latestVersion.version}`);
          addDebugLog(`📁 Файл: ${latestVersion.fileName}`);
          addDebugLog(`📏 Размер: ${(latestVersion.fileSize / 1024 / 1024).toFixed(2)} MB`);

          // Формируем URL для скачивания APK
          const downloadUrl = `${API}/retail/app-store/${appId}/download`;
          setApkUrl(downloadUrl);
          addDebugLog(`📥 URL для QR provisioning: ${downloadUrl}`);

          // Получаем SHA-256 checksum сертификата APK через backend endpoint
          addDebugLog('🔐 Получение SHA-256 checksum сертификата APK...');
          try {
            const checksumResponse = await axios.get(`${API}/retail/app-store/${appId}/checksum`);
            if (checksumResponse.data.success && checksumResponse.data.checksum) {
              setApkChecksum(checksumResponse.data.checksum);
              addDebugLog(`✅ Checksum получен (метод: ${checksumResponse.data.method || 'unknown'})`);
              addDebugLog(`📏 Checksum длина: ${checksumResponse.data.checksum.length} символов (base64)`);
            } else {
              addDebugLog(`❌ Ошибка получения checksum: ${checksumResponse.data.message || 'Unknown error'}`);
              setApkChecksum(null);
            }
          } catch (error: any) {
            addDebugLog(`❌ Ошибка получения checksum: ${error?.response?.data?.message || error?.message || error}`);
            addDebugLog(`💡 Убедитесь, что установлены Android SDK (apksigner) или Java JDK (keytool) на сервере`);
            setApkChecksum(null);
          }
          
        } catch (error: any) {
          addDebugLog(`❌ Ошибка подготовки QR provisioning: ${error?.message || error}`);
          if (error?.stack) {
            console.error('QR provisioning error stack:', error.stack);
          }
        } finally {
          setIsLoading(false);
        }
      };

      prepareQrProvisioning();
    }
  }, [isOpen, appId]);

  // Генерация QR-кода при наличии URL и checksum
  useEffect(() => {
    if (isOpen && apkUrl && apkChecksum) {
      // Формируем JSON для QR provisioning согласно документации Android Enterprise
      const componentName = 'com.dns.radio/.receiver.AdminReceiver';
      
      const provisioningData: Record<string, string | boolean> = {
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': componentName,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': apkUrl,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM': apkChecksum,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': apkChecksum,
        'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_NAME': 'com.dns.radio',
      };

      const jsonStr = JSON.stringify(provisioningData);
      setQrJson(jsonStr);
      addDebugLog(`📋 QR JSON сформирован (длина: ${jsonStr.length} символов)`);

      // Генерируем QR-код через внешний API
      const encodedJson = encodeURIComponent(jsonStr);
      const qrApis = [
        `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodedJson}`,
        `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&ecc=M&data=${encodedJson}`,
        `https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodedJson}`
      ];

      setCurrentApiIndex(0);
      setQrData(qrApis[0]);
      setQrError(null);
    } else if (isOpen && apkUrl && !apkChecksum) {
      setQrData(null);
      setQrJson(null);
      setQrError('Checksum не вычислен - требуется backend endpoint');
    } else {
      setQrData(null);
      setQrJson(null);
      setQrError(null);
    }
  }, [isOpen, apkUrl, apkChecksum]);

  // Обработка ошибок загрузки QR
  useEffect(() => {
    if (!qrData || !qrJson) return;

    const encodedJson = encodeURIComponent(qrJson);
    const qrApis = [
      `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodedJson}`,
      `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&ecc=M&data=${encodedJson}`,
      `https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodedJson}`
    ];

    const tryNextApi = () => {
      const nextIndex = currentApiIndex + 1;
      if (nextIndex < qrApis.length) {
        addDebugLog(`Попытка загрузки QR через API ${nextIndex + 1}/${qrApis.length}...`);
        setCurrentApiIndex(nextIndex);
        setQrData(qrApis[nextIndex]);
      } else {
        addDebugLog('❌ Все QR API не сработали');
        setQrError('Не удалось загрузить QR-код с внешних сервисов');
        setQrData(null);
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => {
      addDebugLog(`⚠️ QR API ${currentApiIndex + 1} не сработал, пробуем следующий...`);
      tryNextApi();
    };
    img.onload = () => {
      addDebugLog(`✅ QR API ${currentApiIndex + 1} успешно загружен`);
      setQrError(null);
    };
    
    const timeoutId = setTimeout(() => {
      img.src = qrData;
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [qrData, qrJson, currentApiIndex]);

  const handleCopyJson = () => {
    if (qrJson) {
      navigator.clipboard.writeText(qrJson).then(() => {
        addDebugLog('✅ JSON скопирован в буфер обмена');
      }).catch(err => {
        addDebugLog(`❌ Ошибка копирования: ${err?.message || err}`);
      });
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconQrcode size={20} />
          <Text fw={600}>QR Provisioning для Device Owner</Text>
        </Group>
      }
      size="xl"
      centered
      styles={{
        content: {
          maxWidth: '1200px'
        }
      }}
    >
      <Stack gap="md">
        {deviceId && deviceName && (
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--theme-bg-elevated)' }}>
            <Group gap="xs">
              <Text size="sm" fw={500}>Устройство:</Text>
              <Badge color="blue">{deviceName}</Badge>
              <Code style={{ fontSize: '11px' }}>{deviceId}</Code>
            </Group>
          </Paper>
        )}

        {isLoading && (
          <Paper p="md" withBorder style={{ backgroundColor: 'rgba(52, 152, 219, 0.1)' }}>
            <Group gap="xs">
              <IconRefresh size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <Text size="sm" c="blue">Подготовка QR provisioning...</Text>
            </Group>
          </Paper>
        )}

        {debugLogs.length > 0 && (
          <Paper p="md" withBorder style={{ 
            backgroundColor: 'var(--theme-bg-elevated)', 
            maxHeight: '200px', 
            overflow: 'auto' 
          }}>
            <Text size="sm" fw={600} mb="xs">🔍 Отладочные логи:</Text>
            <Code block style={{ fontSize: '11px', lineHeight: '1.5' }}>
              {debugLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </Code>
          </Paper>
        )}

        {qrError && (
          <Paper p="md" withBorder style={{ backgroundColor: 'rgba(231, 76, 60, 0.1)' }}>
            <Group gap="xs" mb="xs">
              <IconAlertCircle size={16} color="red" />
              <Text size="sm" fw={600} c="red">Ошибка</Text>
            </Group>
            <Text size="sm">{qrError}</Text>
            {!apkChecksum && (
              <Text size="xs" mt="xs" c="dimmed">
                💡 Для работы QR provisioning требуется вычисление SHA-256 checksum сертификата APK на backend
              </Text>
            )}
          </Paper>
        )}

        {qrData && !qrError && (
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--theme-bg-elevated)' }}>
            <Title order={4} mb="md">QR-код для сканирования:</Title>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '300px',
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px'
            }}>
              <img
                key={qrData}
                src={qrData}
                alt="QR Code for Device Owner Provisioning"
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '400px',
                  borderRadius: '8px'
                }}
                crossOrigin="anonymous"
                onError={() => {
                  setQrError('Не удалось загрузить QR-код');
                }}
              />
            </div>
          </Paper>
        )}

        {qrJson && (
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--theme-bg-elevated)' }}>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>JSON данные (для отладки):</Text>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconCopy size={14} />}
                onClick={handleCopyJson}
              >
                Копировать
              </Button>
            </Group>
            <Textarea
              value={qrJson}
              readOnly
              minRows={4}
              style={{
                fontFamily: 'monospace',
                fontSize: '11px'
              }}
            />
          </Paper>
        )}

        {apkUrl && (
          <Paper p="md" withBorder style={{ backgroundColor: 'var(--theme-bg-elevated)' }}>
            <Text size="sm" fw={600} mb="xs">📥 URL APK:</Text>
            <Code block style={{ fontSize: '11px', wordBreak: 'break-all', display: 'block' }}>
              {apkUrl}
            </Code>
          </Paper>
        )}

        <Paper p="md" withBorder style={{ backgroundColor: 'rgba(241, 196, 15, 0.1)' }}>
          <Group gap="xs" mb="xs">
            <IconAlertCircle size={16} color="orange" />
            <Text size="sm" fw={600} c="orange">⚠️ Важно:</Text>
          </Group>
          <Text size="sm" mb="xs">
            Для QR provisioning требуется <strong>сброс устройства до заводских настроек</strong>. 
            Все данные будут удалены!
          </Text>
          <Text size="xs" c="dimmed">
            После сброса устройства отсканируйте QR-код камерой устройства на экране Welcome.
          </Text>
        </Paper>

        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Закрыть
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

