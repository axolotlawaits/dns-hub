import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {Container,Title,Paper,Text,Button,Group,Stack,Modal,FileInput,Progress,Box,LoadingOverlay, TextInput} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {  IconUpload,  IconMusic,  IconClock,  IconDeviceMobile,  IconBuilding, IconEdit, IconCheck, IconRefresh, IconPower, IconBattery, IconWifi, IconCalendar, IconPlayerPlay, IconPlayerPause, IconSettings, IconWifiOff, IconX } from '@tabler/icons-react';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';


interface Device {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  timeFrom: string;
  timeUntil: string;
  activity: string;
  network: string;
  number: string;
  vendor: string;
  os: string;
  app: string;
  createdAt: string;
}

interface Branch {
  uuid: string;
  name: string;
  typeOfDist: string;
}

interface BranchWithDevices {
  branch: Branch;
  devices: Device[];
}

interface Stats {
  totalDevices: number;
  activeDevices: number;
  totalBranches: number;
  totalMusicFiles: number;
}

const RadioAdmin: React.FC = () => {
  const [branchesWithDevices, setBranchesWithDevices] = useState<BranchWithDevices[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  
  // Device Management Modal
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [deviceTime, setDeviceTime] = useState<string>('');
  const [manualTime, setManualTime] = useState<string>('');

  const [loadingDeviceAction, setLoadingDeviceAction] = useState<string | null>(null);
  const [editingPlaybackTime, setEditingPlaybackTime] = useState({ timeFrom: '', timeUntil: '' });

  const API_BASE = useMemo(() => `${API}/radio`, []);

  // Функция для форматирования месяца (09-2025 -> Сентябрь 2025)
  const formatMonth = useCallback((monthStr: string) => {
    if (!monthStr || monthStr === 'N/A') return 'N/A';
    
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    
    const parts = monthStr.split('-');
    if (parts.length === 2) {
      const monthIndex = parseInt(parts[0]) - 1;
      const year = parts[1];
      if (monthIndex >= 0 && monthIndex < 12) {
        return `${months[monthIndex]} ${year}`;
      }
    }
    
    return monthStr; // Возвращаем исходную строку, если формат не распознан
  }, []);

  // Мемоизация текущего филиала пользователя
  const currentBranchDevices = useMemo(() => {
    // Предполагаем, что первый филиал - это текущий пользователь
    return branchesWithDevices[0]?.devices || [];
  }, [branchesWithDevices]);

  // Мемоизация всех устройств
  const allDevices = useMemo(() => {
    return branchesWithDevices.flatMap(branch => branch.devices);
  }, [branchesWithDevices]);

  // Проверка состояния музыки
  const musicStatus = useMemo(() => {
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = now.getFullYear();
    const currentMonthFolder = `01-${currentMonth}-${currentYear}`;
    
    // Проверяем, есть ли музыка за текущий месяц
    // Предполагаем, что если есть общее количество файлов, то музыка загружена
    const hasCurrentMonthMusic = stats?.totalMusicFiles && stats.totalMusicFiles > 0;
    
    // Вычисляем дату через 5 дней
    const fiveDaysFromNow = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000));
    const nextMonth = fiveDaysFromNow.getMonth() + 1;
    const nextYear = fiveDaysFromNow.getFullYear();
    const nextMonthFolder = `01-${String(nextMonth).padStart(2, '0')}-${nextYear}`;
    
    // Проверяем, нужно ли предупреждение (через 5 дней будет новый месяц)
    const shouldWarn = fiveDaysFromNow.getMonth() !== now.getMonth();
    
    // Вычисляем точное количество дней до следующего месяца
    const nextMonthStart = new Date(nextYear, nextMonth - 1, 1);
    const daysUntilNextMonth = Math.ceil((nextMonthStart.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    return {
      hasCurrentMonthMusic,
      shouldWarn: shouldWarn && daysUntilNextMonth <= 5,
      currentMonthFolder,
      nextMonthFolder,
      daysUntilNextMonth: shouldWarn ? daysUntilNextMonth : 0
    };
  }, [stats]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      
      const [devicesResponse, statsResponse] = await Promise.all([
        axios.get(`${API_BASE}/devices`),
        axios.get(`${API_BASE}/stats`)
      ]);

      const groups = (devicesResponse.data && devicesResponse.data.data) ? devicesResponse.data.data : [];

      const mapped: BranchWithDevices[] = groups.map((g: any) => ({
        branch: {
          uuid: g.branch?.uuid ?? '',
          name: g.branch?.name ?? 'Неизвестный филиал',
          typeOfDist: g.branch?.typeOfDist ?? 'Неизвестно'
        },
        devices: (g.devices ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          branchId: d.branchId,
          branchName: g.branch?.name ?? 'Неизвестный филиал',
          timeFrom: d.timeFrom,
          timeUntil: d.timeUntil,
          activity: d.activity,
          network: d.network,
          number: d.number,
          vendor: d.vendor,
          os: d.os,
          app: d.app,
          createdAt: d.createdAt,
        }))
      }));

      setBranchesWithDevices(mapped);

      // Загружаем статусы устройств через ping
      try {
        const statusResp = await axios.get(`${API_BASE}/devices-status-ping`);
        const arr = (statusResp.data && statusResp.data.data) ? statusResp.data.data : [];
        const sm: Record<string, boolean> = {};
        for (const item of arr) {
          sm[item.deviceId] = !!item.online;
        }
        setStatusMap(sm);
      } catch (e) {
        console.error('Error loading device statuses:', e);
      }

      const sd = (statsResponse.data && statsResponse.data.data) ? statsResponse.data.data : {};
      setStats({
        totalDevices: sd.totalDevices ?? 0,
        activeDevices: sd.activeDevices ?? 0,
        totalBranches: sd.totalBranches ?? 0,
        totalMusicFiles: sd.totalMusicFiles ?? 0
      });
    } catch (err) {
      console.error('Error loading data:', err);

      try { notificationSystem.addNotification('Ошибка', 'Ошибка загрузки данных', 'error'); } catch {}
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Device Management Functions
  const openDeviceModal = useCallback(async (device: Device) => {
    setSelectedDevice(device);
    setDeviceModalOpen(true);
    setEditingPlaybackTime({ timeFrom: device.timeFrom, timeUntil: device.timeUntil });
    await loadDeviceStatus(device.id);
    await loadDeviceTime(device.id);
  }, [API_BASE]);

  const loadDeviceStatus = useCallback(async (deviceId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/devices/${deviceId}/get-status`);
      if (response.data.success) {
        setDeviceStatus(response.data.data);
      } else {
        setDeviceStatus(null);
      }
    } catch (error: any) {
      console.error('Error loading device status:', error);
      setDeviceStatus(null);
      // Не показываем ошибку, так как устройство может не поддерживать эту функцию
    }
  }, [API_BASE]);

  const loadDeviceTime = useCallback(async (deviceId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/devices/${deviceId}/get-time`);
      if (response.data.success && response.data.data.deviceTimeMs) {
        try {
          const date = new Date(response.data.data.deviceTimeMs);
          if (!isNaN(date.getTime())) {
            const deviceTime = date.toISOString();
            setDeviceTime(deviceTime);
            setManualTime(deviceTime);
          } else {
            setDeviceTime('');
            setManualTime('');
          }
        } catch (error) {
          console.error('Error parsing device time:', error);
          setDeviceTime('');
          setManualTime('');
        }
      } else {
        setDeviceTime('');
        setManualTime('');
      }
    } catch (error: any) {
      console.error('Error loading device time:', error);
      setDeviceTime('');
      setManualTime('');
      // Не показываем ошибку, так как устройство может быть офлайн
    }
  }, [API_BASE]);

  const syncTime = useCallback(async () => {
    if (!selectedDevice) return;
    
    setLoadingDeviceAction('sync-time');
    try {
      const response = await axios.post(`${API_BASE}/devices/${selectedDevice.id}/sync-time`);
      if (response.data.success) {
        try {
          const deviceTime = response.data.data.deviceTime;
          if (deviceTime) {
            const date = new Date(deviceTime);
            if (!isNaN(date.getTime())) {
              setDeviceTime(deviceTime);
              setManualTime(deviceTime);
              notificationSystem.addNotification('Успешно', 'Время синхронизировано с сервером', 'success');
            } else {
              console.error('Invalid device time from sync:', deviceTime);
              notificationSystem.addNotification('Ошибка', 'Получено некорректное время от устройства', 'error');
            }
          }
        } catch (error) {
          console.error('Error processing sync time:', error);
          notificationSystem.addNotification('Ошибка', 'Ошибка обработки времени синхронизации', 'error');
        }
      }
    } catch (error: any) {
      notificationSystem.addNotification('Ошибка', 'Ошибка синхронизации времени', 'error');
    } finally {
      setLoadingDeviceAction(null);
    }
  }, [selectedDevice, API_BASE]);

  const setTime = async () => {
    if (!selectedDevice || !manualTime) return;
    
    setLoadingDeviceAction('set-time');
    try {
      const response = await axios.post(`${API_BASE}/devices/${selectedDevice.id}/set-time`, {
        dateTime: manualTime
      });
      if (response.data.success) {
        setDeviceTime(manualTime);
        notificationSystem.addNotification('Успешно', 'Время установлено', 'success');
      }
    } catch (error: any) {
      notificationSystem.addNotification('Ошибка', 'Ошибка установки времени', 'error');
    } finally {
      setLoadingDeviceAction(null);
    }
  };

  const restartApp = async () => {
    if (!selectedDevice) return;
    
    setLoadingDeviceAction('restart-app');
    try {
      const response = await axios.post(`${API_BASE}/devices/${selectedDevice.id}/restart-app`);
      if (response.data.success) {
        notificationSystem.addNotification('Успешно', 'Приложение перезапущено', 'success');
      }
    } catch (error: any) {
      notificationSystem.addNotification('Ошибка', 'Ошибка перезапуска приложения', 'error');
    } finally {
      setLoadingDeviceAction(null);
    }
  };

  const rebootDevice = async () => {
    if (!selectedDevice) return;
    
    setLoadingDeviceAction('reboot');
    try {
      const response = await axios.post(`${API_BASE}/devices/${selectedDevice.id}/reboot`);
      if (response.data.success) {
        notificationSystem.addNotification('Успешно', 'Устройство перезагружается', 'success');
      }
    } catch (error: any) {
      notificationSystem.addNotification('Ошибка', 'Ошибка перезагрузки устройства', 'error');
    } finally {
      setLoadingDeviceAction(null);
    }
  };



  const updatePlaybackTime = async () => {
    if (!selectedDevice) return;
    
    setLoadingDeviceAction('update-playback-time');
    try {
      const response = await axios.put(`${API_BASE}/devices/${selectedDevice.id}/time`, {
        timeFrom: editingPlaybackTime.timeFrom,
        timeUntil: editingPlaybackTime.timeUntil
      });
      if (response.data.success) {
        notificationSystem.addNotification('Успешно', 'Время воспроизведения обновлено', 'success');
        // Обновляем данные устройства
        if (selectedDevice) {
          selectedDevice.timeFrom = editingPlaybackTime.timeFrom;
          selectedDevice.timeUntil = editingPlaybackTime.timeUntil;
        }
        // Перезагружаем данные
        setTimeout(loadData, 1000);
      }
    } catch (error: any) {
      notificationSystem.addNotification('Ошибка', 'Ошибка обновления времени воспроизведения', 'error');
    } finally {
      setLoadingDeviceAction(null);
    }
  };

  const handleFileSelect = (files: File[] | null) => {
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      setUploading(true);
      setUploadProgress(0);


      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const formData = new FormData();
        formData.append('music', file);

        await axios.post(`${API_BASE}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
            setUploadProgress(progress);
          }
        });

        setUploadProgress(((i + 1) / selectedFiles.length) * 100);
      }


      setSelectedFiles([]);
      setUploadModalOpen(false);
      setUploadProgress(0);
      
      setTimeout(loadData, 1000);
    } catch (err) {
      console.error('Error uploading files:', err);

      try { notificationSystem.addNotification('Ошибка', 'Ошибка загрузки файлов', 'error'); } catch {}
    } finally {
      setUploading(false);
    }
  };





  const formatTime = (time: string) => {
    if (!time) return 'Не установлено';
    return time;
  };



  if (loading) {
    return (
      <Container size="xl" py="xl">
        <LoadingOverlay visible={true} />
      </Container>
    );
  }

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      backgroundColor: 'var(--bg)',
      color: 'var(--font)'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 40px',
        backgroundColor: 'var(--layer)',
        borderBottom: '1px solid var(--outline-shadow)',
        boxShadow: 'var(--outline-bottom-shadow)',
        zIndex: 2
      }}>
        <Group justify="space-between" align="center">
          <Title order={1} style={{ color: 'var(--font-info)', fontSize: '28px', fontWeight: 'bold' }}>
            <IconMusic size={32} style={{ marginRight: 12, color: 'var(--font-info)' }} />
            Админ панель DNS Radio
          </Title>
          <Button 
            leftSection={<IconRefresh size={16} />}
            onClick={loadData}
            variant="light"
            style={{
              backgroundColor: 'var(--select)',
              color: 'var(--font-contrast)',
              border: 'none',
              transition: 'var(--hover-transition)'
            }}
          >
            Обновить
          </Button>
        </Group>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Column - 80% */}
        <div style={{ width: '80%', padding: '30px', overflow: 'auto' }}>
          <Stack gap="xl">




            {/* Statistics */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                <div style={{
                  padding: '24px',
                  backgroundColor: 'var(--layer)',
                  borderRadius: '12px',
                  boxShadow: 'var(--soft-shadow)',
                  border: '1px solid var(--outline-shadow)',
                  transition: 'var(--hover-transition)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--soft-shadow)'}>
                  <Group>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#339af0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconDeviceMobile size={24} color="white" />
                    </div>
                    <div>
                      <Text size="sm" style={{ color: 'var(--font-aux)', marginBottom: '4px' }}>Всего устройств</Text>
                      <Text size="xl" fw={700} style={{ color: 'var(--font)' }}>{stats.totalDevices}</Text>
                    </div>
                  </Group>
                </div>
                
                <div style={{
                  padding: '24px',
                  backgroundColor: 'var(--layer)',
                  borderRadius: '12px',
                  boxShadow: 'var(--soft-shadow)',
                  border: '1px solid var(--outline-shadow)',
                  transition: 'var(--hover-transition)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--soft-shadow)'}>
                  <Group>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#20c997',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconCheck size={24} color="white" />
                    </div>
                    <div>
                      <Text size="sm" style={{ color: 'var(--font-aux)', marginBottom: '4px' }}>Активных</Text>
                      <Text size="xl" fw={700} style={{ color: 'var(--font)' }}>{stats.activeDevices}</Text>
                    </div>
                  </Group>
                </div>
                
                <div style={{
                  padding: '24px',
                  backgroundColor: 'var(--layer)',
                  borderRadius: '12px',
                  boxShadow: 'var(--soft-shadow)',
                  border: '1px solid var(--outline-shadow)',
                  transition: 'var(--hover-transition)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--soft-shadow)'}>
                  <Group>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#fd7e14',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconBuilding size={24} color="white" />
                    </div>
                    <div>
                      <Text size="sm" style={{ color: 'var(--font-aux)', marginBottom: '4px' }}>Филиалов</Text>
                      <Text size="xl" fw={700} style={{ color: 'var(--font)' }}>{stats.totalBranches}</Text>
                    </div>
                  </Group>
                </div>
                
                <div style={{
                  padding: '24px',
                  backgroundColor: 'var(--layer)',
                  borderRadius: '12px',
                  boxShadow: 'var(--soft-shadow)',
                  border: '1px solid var(--outline-shadow)',
                  transition: 'var(--hover-transition)',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--soft-shadow)'}>
                  <Group>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: '#9775fa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <IconMusic size={24} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text size="sm" style={{ color: 'var(--font-aux)', marginBottom: '4px' }}>Музыкальных файлов</Text>
                      <Text size="xl" fw={700} style={{ color: 'var(--font)' }}>{stats.totalMusicFiles}</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {musicStatus?.hasCurrentMonthMusic ? (
                        <IconCheck size={20} color="#10b981" />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <IconX size={20} color="#ef4444" />
                          <Text size="xs" style={{ color: '#ef4444', fontWeight: '500' }}>
                            Пора загружать
                          </Text>
                        </div>
                      )}
                    </div>
                  </Group>
                </div>
              </div>
            )}

            {/* Music Upload */}
            <div style={{
              padding: '24px',
              backgroundColor: 'var(--layer)',
              borderRadius: '16px',
              boxShadow: 'var(--soft-shadow)',
              border: '1px solid var(--outline-shadow)'
            }}>
              <Group justify="space-between" mb="md">
                <Title order={2} size="h3" style={{ color: 'var(--font)', fontSize: '20px' }}>
                  <IconUpload size={24} style={{ marginRight: 8, color: 'var(--font-info)' }} />
                  Загрузка музыки
                </Title>
                <Button 
                  onClick={() => setUploadModalOpen(true)}
                  leftSection={<IconUpload size={16} />}
                  style={{
                    backgroundColor: 'var(--select)',
                    color: 'var(--font-contrast)',
                    border: 'none',
                    borderRadius: '8px',
                    transition: 'var(--hover-transition)'
                  }}
                >
                  Загрузить файлы
                </Button>
              </Group>
              <Text style={{ color: 'var(--font-aux)', fontSize: '14px' }}>
                Загружайте MP3 файлы для воспроизведения в филиалах. Файлы автоматически сохраняются в папку текущего месяца.
              </Text>
            </div>

            {/* Branch Devices */}
            <div style={{
              padding: '24px',
              backgroundColor: 'var(--layer)',
              borderRadius: '16px',
              boxShadow: 'var(--soft-shadow)',
              border: '1px solid var(--outline-shadow)'
            }}>
              <Title order={2} size="h3" mb="lg" style={{ color: 'var(--font)', fontSize: '20px' }}>
                <IconDeviceMobile size={24} style={{ marginRight: 8, color: 'var(--font-info)' }} />
                Устройства вашего филиала
              </Title>
              
              <Stack gap="lg">
                {branchesWithDevices.map((branchData) => (
                  <div key={branchData.branch.uuid} style={{
                    padding: '20px',
                    backgroundColor: 'var(--bg)',
                    borderRadius: '12px',
                    border: '1px solid var(--outline-shadow)',
                    boxShadow: 'var(--soft-shadow)'
                  }}>
                    <Group justify="space-between" mb="md">
                      <div>
                        <Title order={3} size="h4" style={{ color: 'var(--font)', fontSize: '18px' }}>{branchData.branch.name}</Title>
                        <Text style={{ color: 'var(--font-aux)', fontSize: '14px' }}>{branchData.branch.typeOfDist}</Text>
                      </div>
                      <div style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--select)',
                        borderRadius: '20px',
                        color: 'var(--font-contrast)',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {currentBranchDevices.length} устройств
                      </div>
                    </Group>

                    <Stack gap="sm">
                      {currentBranchDevices.map((device) => {
                        const online = !!statusMap[device.id];
                        return (
                          <div 
                            key={device.id} 
                            style={{ 
                              padding: '16px',
                              backgroundColor: 'var(--layer)',
                              borderRadius: '8px',
                              border: '1px solid var(--outline-shadow)',
                              cursor: 'pointer',
                              transition: 'var(--hover-transition)'
                            }}
                            onClick={() => openDeviceModal(device)}
                            onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                          >
                            <Group justify="space-between" align="center">
                              <div>
                                <Text fw={500} style={{ color: 'var(--font)', fontSize: '16px' }}>{device.name}</Text>
                                <Text size="sm" style={{ color: 'var(--font-aux)', fontSize: '13px' }}>
                                  {device.network}{device.number} • {device.os} • {device.app}
                                </Text>
                              </div>
                              
                              <Group gap="xs">
                                <div style={{
                                  padding: '4px 8px',
                                  backgroundColor: online ? '#20c997' : '#6c757d',
                                  borderRadius: '12px',
                                  color: 'white',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}>
                                  {online ? 'Онлайн' : 'Оффлайн'}
                                </div>
                                
                                <Text size="sm" style={{ color: 'var(--font-aux)', fontSize: '12px' }}>
                                  {formatTime(device.timeFrom)} - {formatTime(device.timeUntil)}
                                </Text>
                                
                                <IconEdit size={16} style={{ color: 'var(--font-aux)' }} />
                              </Group>
                            </Group>
                          </div>
                        )
                      })}
                    </Stack>
                  </div>
                ))}
              </Stack>
            </div>
          </Stack>
        </div>

        {/* Right Column - 20% */}
        <div style={{ 
          width: '20%', 
          padding: '24px', 
          borderLeft: '1px solid var(--outline-shadow)', 
          overflow: 'auto',
          backgroundColor: 'var(--layer)'
        }}>
          <Stack gap="md">
            <Title order={3} size="h4" style={{ color: 'var(--font)', fontSize: '18px' }}>
              <IconDeviceMobile size={20} style={{ marginRight: 8, color: 'var(--font-info)' }} />
              Все устройства
            </Title>
            
            {branchesWithDevices.map((branchData) => (
              <div key={branchData.branch.uuid}>
                <Text fw={500} size="sm" mb="xs" style={{ color: 'var(--font-info)', fontSize: '14px' }}>
                  {branchData.branch.name}
                </Text>
                <Stack gap="xs">
                  {allDevices.map((device) => {
                    const online = !!statusMap[device.id];
                    return (
                      <div 
                        key={device.id} 
                        style={{ 
                          padding: '12px',
                          backgroundColor: 'var(--bg)',
                          borderRadius: '8px',
                          border: '1px solid var(--outline-shadow)',
                          cursor: 'pointer',
                          transition: 'var(--hover-transition)'
                        }}
                        onClick={() => openDeviceModal(device)}
                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--outline-shadow)'}
                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                      >
                        <Group justify="space-between" align="center">
                          <div>
                            <Text size="sm" fw={500} style={{ color: 'var(--font)', fontSize: '13px' }}>{device.name}</Text>
                            <Text size="xs" style={{ color: 'var(--font-aux)', fontSize: '11px' }}>
                              {device.network}{device.number}
                            </Text>
                          </div>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: online ? '#20c997' : '#6c757d'
                          }} />
                        </Group>
                      </div>
                    )
                  })}
                </Stack>
              </div>
            ))}
          </Stack>
        </div>
      </div>

      <Modal 
        opened={uploadModalOpen} 
        onClose={() => setUploadModalOpen(false)}
        title="Загрузка музыкальных файлов"
        size="md"
      >
        <Stack gap="md">
          <FileInput
            label="Выберите MP3 файлы"
            placeholder="Нажмите для выбора файлов"
            accept="audio/mpeg"
            multiple
            value={selectedFiles}
            onChange={handleFileSelect}
            leftSection={<IconMusic size={16} />}
          />
          
          {selectedFiles.length > 0 && (
            <Text size="sm" c="dimmed">
              Выбрано файлов: {selectedFiles.length}
            </Text>
          )}
          
          {uploading && (
            <Box>
              <Text size="sm" mb="xs">Загрузка...</Text>
              <Progress value={uploadProgress} size="sm" />
            </Box>
          )}
          
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setUploadModalOpen(false)}>
              Отмена
            </Button>
            <Button 
              onClick={handleUpload}
              loading={uploading}
              disabled={selectedFiles.length === 0}
              leftSection={<IconUpload size={16} />}
            >
              Загрузить
            </Button>
          </Group>
        </Stack>
      </Modal>





      {/* Device Management Modal */}
      <Modal 
        opened={deviceModalOpen} 
        onClose={() => setDeviceModalOpen(false)} 
        title={`Управление устройством: ${selectedDevice?.name || ''}`} 
        size="lg"
      >
        {selectedDevice && (
          <Stack gap="md">
            {/* Device Info */}
            <Paper p="md" withBorder>
              <Text fw={500} mb="sm">Информация об устройстве</Text>
              <Group justify="space-between">
                <Text size="sm">IP: {selectedDevice.network}{selectedDevice.number}</Text>
                <Text size="sm">OS: {selectedDevice.os}</Text>
                <Text size="sm">App: {selectedDevice.app}</Text>
              </Group>
            </Paper>

            {/* Device Status */}
            <Paper p="md" withBorder>
              <Text fw={500} mb="sm">
                <IconSettings size={16} style={{ marginRight: 8 }} />
                Статус устройства
              </Text>
              {deviceStatus ? (
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <IconBattery size={16} color="green" />
                      <Text size="sm">Батарея: {deviceStatus.batteryLevel || 'N/A'}%</Text>
                    </Group>
                    <Group gap="xs">
                      {deviceStatus.isPlaying ? <IconPlayerPlay size={16} color="green" /> : <IconPlayerPause size={16} color="gray" />}
                      <Text size="sm">{deviceStatus.isPlaying ? 'Играет' : 'Остановлено'}</Text>
                    </Group>
                  </Group>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <IconCalendar size={16} color="blue" />
                      <Text size="sm">Месяц: {formatMonth(deviceStatus.currentMonth || 'N/A')}</Text>
                    </Group>
                    <Group gap="xs">
                      {deviceStatus.currentWifiSSID && deviceStatus.currentWifiSSID !== 'Не подключено' ? 
                        <IconWifi size={16} color="green" /> : 
                        <IconWifiOff size={16} color="gray" />
                      }
                      <Text size="sm">WiFi: {deviceStatus.currentWifiSSID || 'Не подключено'}</Text>
                    </Group>
                  </Group>
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">Статус недоступен (устройство не поддерживает эту функцию)</Text>
              )}
            </Paper>

            {/* Time Management */}
            <Paper p="md" withBorder>
              <Text fw={500} mb="sm">
                <IconClock size={16} style={{ marginRight: 8 }} />
                Управление временем
              </Text>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm">Текущее время устройства:</Text>
                  <Text size="sm" fw={500}>
                    {deviceTime ? new Date(deviceTime).toLocaleString('ru-RU') : 'Время недоступно'}
                  </Text>
                </Group>
                
                <Group grow>
                  <Button 
                    variant="light" 
                    onClick={syncTime}
                    loading={loadingDeviceAction === 'sync-time'}
                    leftSection={<IconClock size={16} />}
                  >
                    Синхронизировать с сервером
                  </Button>
                </Group>

                <Group grow>
                  <TextInput
                    label="Установить время вручную"
                    type="datetime-local"
                    value={manualTime ? (() => {
                      try {
                        const date = new Date(manualTime);
                        return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
                      } catch {
                        return '';
                      }
                    })() : ''}
                    onChange={(e) => {
                      if (e.currentTarget?.value) {
                        try {
                          const date = new Date(e.currentTarget.value);
                          if (!isNaN(date.getTime())) {
                            setManualTime(date.toISOString());
                          }
                        } catch {
                          setManualTime('');
                        }
                      } else {
                        setManualTime('');
                      }
                    }}
                  />
                  <Button 
                    variant="light" 
                    onClick={setTime}
                    loading={loadingDeviceAction === 'set-time'}
                    style={{ alignSelf: 'end' }}
                  >
                    Установить
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {/* Playback Time Settings */}
            <Paper p="md" withBorder>
              <Text fw={500} mb="sm">Время воспроизведения</Text>
              <Stack gap="sm">
                <Group grow>
                  <TimeInput
                    label="Время начала"
                    placeholder="08:00"
                    value={editingPlaybackTime.timeFrom}
                    onChange={(value: any) => {
                      let v = '';
                      if (typeof value === 'string') v = value;
                      else if (value instanceof Date) v = value.toTimeString().slice(0, 5);
                      else if (value?.currentTarget?.value != null) v = value.currentTarget.value;
                      setEditingPlaybackTime(prev => ({ ...prev, timeFrom: v }));
                    }}
                    leftSection={<IconClock size={16} />}
                  />
                  <TimeInput
                    label="Время окончания"
                    placeholder="22:00"
                    value={editingPlaybackTime.timeUntil}
                    onChange={(value: any) => {
                      let v = '';
                      if (typeof value === 'string') v = value;
                      else if (value instanceof Date) v = value.toTimeString().slice(0, 5);
                      else if (value?.currentTarget?.value != null) v = value.currentTarget.value;
                      setEditingPlaybackTime(prev => ({ ...prev, timeUntil: v }));
                    }}
                    leftSection={<IconClock size={16} />}
                  />
                </Group>
                <Button 
                  onClick={updatePlaybackTime}
                  loading={loadingDeviceAction === 'update-playback-time'}
                  leftSection={<IconClock size={16} />}
                >
                  Обновить время воспроизведения
                </Button>
              </Stack>
            </Paper>
            {/* Device Actions */}
            <Paper p="md" withBorder>
              <Text fw={500} mb="sm">Действия с устройством</Text>
              <Group grow>
                <Button 
                  variant="light" 
                  color="blue"
                  onClick={restartApp}
                  loading={loadingDeviceAction === 'restart-app'}
                  leftSection={<IconRefresh size={16} />}
                >
                  Перезапустить приложение
                </Button>
                <Button 
                  variant="light" 
                  color="red"
                  onClick={rebootDevice}
                  loading={loadingDeviceAction === 'reboot'}
                  leftSection={<IconPower size={16} />}
                >
                  Перезагрузить устройство
                </Button>
              </Group>
            </Paper>
          </Stack>
        )}
      </Modal>
    </div>
  );
};

export default RadioAdmin;
