import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {Container,Title,Paper,Text,Button,Group,Stack,Modal,LoadingOverlay, TextInput} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {  IconUpload,  IconMusic,  IconClock,  IconDeviceMobile,  IconBuilding, IconEdit, IconCheck, IconRefresh, IconPower, IconBattery, IconWifi, IconCalendar, IconPlayerPlay, IconPlayerPause, IconWifiOff, IconX } from '@tabler/icons-react';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import { DynamicFormModal, FormField } from '../../../utils/formModal';
import './Radio.css';


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

// Интерфейсы для системы радио потоков
interface RadioStream {
  id: string;
  name: string;
  branchTypeOfDist: string;
  frequencySongs: number;
  fadeInDuration: number;
  volumeLevel: number;
  startDate: string;
  endDate?: string;
  attachment?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  // Состояние для радио потоков
  const [radioStreams, setRadioStreams] = useState<RadioStream[]>([]);
  
  // Состояния для нового модального окна
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [streamModalMode, setStreamModalMode] = useState<'create' | 'edit' | 'view' | 'delete'>('create');
  const [selectedStream, setSelectedStream] = useState<RadioStream | null>(null);

  
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
    const currentMonthFolder = `${currentMonth}-${currentYear}`;
    
    // Проверяем, есть ли музыка за текущий месяц
    // TODO: В будущем нужно проверять конкретную папку текущего месяца
    // Пока что используем общее количество файлов как индикатор
    const hasCurrentMonthMusic = stats?.totalMusicFiles && stats.totalMusicFiles > 0;
    
    // Вычисляем дату через 5 дней
    const fiveDaysFromNow = new Date(now.getTime() + (5 * 24 * 60 * 60 * 1000));
    const nextMonth = fiveDaysFromNow.getMonth() + 1;
    const nextYear = fiveDaysFromNow.getFullYear();
    const nextMonthFolder = `${String(nextMonth).padStart(2, '0')}-${nextYear}`;
    
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




  const handleCreateStream = useCallback(() => {
    setSelectedStream(null);
    setStreamModalMode('create');
    setStreamModalOpen(true);
  }, []);




  // Конфигурация полей для формы радио потока
  const streamFormFields: FormField[] = [
    {
      name: 'name',
      label: 'Название потока',
      type: 'text',
      required: true,
      placeholder: 'Введите название потока'
    },
    {
      name: 'branchTypeOfDist',
      label: 'Тип филиала',
      type: 'select',
      required: true,
      options: [
        { value: 'Магазин', label: 'Магазин' },
        { value: 'Самообслуживание', label: 'Самообслуживание' },
        { value: 'Конвеер', label: 'Конвеер' },
        { value: 'Технопоинт', label: 'Технопоинт' }
      ]
    },
    {
      name: 'frequencySongs',
      label: 'Каждые N песен',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
      step: '1'
    },
    {
      name: 'volumeLevel',
      label: 'Уровень громкости (%)',
      type: 'number',
      required: true,
      min: 0,
      max: 100,
      step: '1'
    },
    {
      name: 'fadeInDuration',
      label: 'Плавное появление (сек)',
      type: 'number',
      required: true,
      min: 0,
      max: 10,
      step: '0.1'
    },
    {
      name: 'startDate',
      label: 'Дата начала',
      type: 'date',
      required: true
    },
    {
      name: 'endDate',
      label: 'Дата окончания',
      type: 'date',
      required: false
    },
    {
      name: 'isActive',
      label: 'Активен',
      type: 'boolean',
      required: false
    }
  ];

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
      console.log('Stats response:', statsResponse.data);
      console.log('Stats data:', sd);
      setStats({
        totalDevices: sd.totalDevices ?? 0,
        activeDevices: sd.activeDevices ?? 0,
        totalBranches: sd.totalBranches ?? 0,
        totalMusicFiles: sd.totalMusicFiles ?? 0
      });

      // Загружаем данные о радио потоках
      try {
        const streamsResponse = await axios.get(`${API_BASE}/streams`);
        const streamsData = (streamsResponse.data && streamsResponse.data.data) ? streamsResponse.data.data : [];
        setRadioStreams(streamsData);
      } catch (e) {
        console.error('Error loading radio streams:', e);
        setRadioStreams([]);
      }

    } catch (err) {
      console.error('Error loading data:', err);

      try { notificationSystem.addNotification('Ошибка', 'Ошибка загрузки данных', 'error'); } catch {}
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  const handleStreamSubmit = useCallback(async (values: Record<string, any>) => {
    try {
      if (streamModalMode === 'create') {
        const response = await axios.post(`${API_BASE}/streams`, values);
        console.log('Поток создан:', response.data);
        loadData();
      } else if (streamModalMode === 'edit' && selectedStream) {
        const response = await axios.put(`${API_BASE}/streams/${selectedStream.id}`, values);
        console.log('Поток обновлен:', response.data);
        loadData();
      }
      setStreamModalOpen(false);
    } catch (error) {
      console.error('Ошибка сохранения потока:', error);
    }
  }, [streamModalMode, selectedStream, loadData, API_BASE]);

  const handleStreamDelete = useCallback(async () => {
    if (selectedStream) {
      try {
        await axios.delete(`${API_BASE}/streams/${selectedStream.id}`);
        console.log('Поток удален:', selectedStream.id);
        loadData();
        setStreamModalOpen(false);
      } catch (error) {
        console.error('Ошибка удаления потока:', error);
      }
    }
  }, [selectedStream, loadData, API_BASE]);

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


  const handleUpload = async (values: Record<string, any>) => {
    const files = values.files || selectedFiles;
    if (files.length === 0) return;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('music', file);

        await axios.post(`${API_BASE}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setSelectedFiles([]);
      setUploadModalOpen(false);
      
      setTimeout(loadData, 1000);
    } catch (err) {
      console.error('Error uploading files:', err);

      try { notificationSystem.addNotification('Ошибка', 'Ошибка загрузки файлов', 'error'); } catch {}
    } finally {
      // Upload completed
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

            {/* Radio Streams */}
            <div style={{
              padding: '24px',
              backgroundColor: 'var(--layer)',
              borderRadius: '16px',
              boxShadow: 'var(--soft-shadow)',
              border: '1px solid var(--outline-shadow)'
            }}>
              <Group justify="space-between" mb="md">
                <Title order={2} size="h3" style={{ color: 'var(--font)', fontSize: '20px' }}>
                  <IconMusic size={24} style={{ marginRight: 8, color: 'var(--font-info)' }} />
                  Радио потоки
                </Title>
                <Button 
                  onClick={handleCreateStream}
                  leftSection={<IconMusic size={16} />}
                  variant="outline"
                  style={{
                    borderColor: 'var(--select)',
                    color: 'var(--font)',
                    borderRadius: '8px',
                    transition: 'var(--hover-transition)'
                  }}
                >
                  Добавить поток
                </Button>
              </Group>
              
              {radioStreams.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  {radioStreams.map((stream) => (
                    <Paper key={stream.id} p="md" withBorder style={{
                      backgroundColor: 'var(--theme-bg-elevated)',
                      border: '1px solid var(--theme-border)',
                      borderRadius: '12px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                      transition: 'all 0.2s ease'
                    }}>
                      <Group justify="space-between" mb="sm">
                        <Text fw={600} size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                          {stream.name}
                        </Text>
                        <Group gap="xs">
                          {stream.isActive ? (
                            <div style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#10b981'
                            }} />
                          ) : (
                            <div style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#ef4444'
                            }} />
                          )}
                          <Text size="xs" style={{ color: stream.isActive ? '#10b981' : '#ef4444' }}>
                            {stream.isActive ? 'Активен' : 'Неактивен'}
                          </Text>
                        </Group>
                      </Group>
                      
                      <Stack gap="xs">
                        <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                          Тип филиала: <Text span fw={500} style={{ color: 'var(--theme-text-primary)' }}>{stream.branchTypeOfDist}</Text>
                        </Text>
                        <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                          Частота: <Text span fw={500} style={{ color: 'var(--theme-text-primary)' }}>каждые {stream.frequencySongs} песен</Text>
                        </Text>
                        <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                          Громкость: <Text span fw={500} style={{ color: 'var(--theme-text-primary)' }}>{stream.volumeLevel}%</Text>
                        </Text>
                        <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                          Плавность: <Text span fw={500} style={{ color: 'var(--theme-text-primary)' }}>{stream.fadeInDuration}с</Text>
                        </Text>
                        {stream.attachment && (
                          <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                            Файл: <Text span fw={500} style={{ color: 'var(--theme-text-primary)' }}>{stream.attachment}</Text>
                          </Text>
                        )}
                        <Text size="xs" style={{ color: 'var(--theme-text-tertiary)' }}>
                          Создан: {new Date(stream.createdAt).toLocaleDateString('ru-RU')}
                        </Text>
                      </Stack>
                    </Paper>
                  ))}
                </div>
              ) : (
                <Text size="sm" style={{ color: 'var(--theme-text-secondary)', textAlign: 'center', padding: '40px' }}>
                  Радио потоки не найдены. Создайте первый поток для начала работы.
                </Text>
              )}
            </div>

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
                <Group gap="sm">
                  <Button 
                    onClick={handleCreateStream}
                    leftSection={<IconMusic size={16} />}
                    variant="outline"
                    style={{
                      borderColor: 'var(--select)',
                      color: 'var(--font)',
                      borderRadius: '8px',
                      transition: 'var(--hover-transition)'
                    }}
                  >
                    Радио потоки
                  </Button>
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
              </Group>
              <Text style={{ color: 'var(--font-aux)', fontSize: '14px' }}>
                Загружайте MP3 файлы для воспроизведения в филиалах. Файлы автоматически сохраняются в папку retail/music/{musicStatus?.currentMonthFolder || 'текущий месяц'}.
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

      {/* Upload Modal using DynamicFormModal */}
      <DynamicFormModal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Загрузка музыкальных файлов"
        mode="create"
        fields={[
          {
            name: 'files',
            label: 'Выберите MP3 файлы',
            type: 'file',
            required: true,
            multiple: true,
            accept: 'audio/mpeg',
            placeholder: 'Нажмите для выбора файлов'
          }
        ]}
        initialValues={{ files: selectedFiles }}
        onSubmit={handleUpload}
        submitButtonText="Загрузить"
        cancelButtonText="Отмена"
        size="md"
      />





      {/* Device Management Modal - Info View Only */}
      <Modal 
        opened={deviceModalOpen} 
        onClose={() => setDeviceModalOpen(false)} 
        title={`Информация об устройстве: ${selectedDevice?.name || ''}`} 
        size="lg"
        classNames={{
          content: 'device-modal-content',
          header: 'device-modal-header',
          title: 'device-modal-title',
          body: 'device-modal-body'
        }}
      >
        {selectedDevice && (
          <Stack gap="md">
            {/* Device Info */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                📱 Информация об устройстве
              </Text>
              <Group justify="space-between" wrap="wrap">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Text size="sm" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>IP адрес</Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                    {selectedDevice.network}{selectedDevice.number}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Text size="sm" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>Операционная система</Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>{selectedDevice.os}</Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Text size="sm" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>Версия приложения</Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>{selectedDevice.app}</Text>
                </div>
              </Group>
            </Paper>

            {/* Device Status */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                ⚙️ Статус устройства
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
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                🕐 Управление временем
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
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '500',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
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
                    style={{ 
                      alignSelf: 'end',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '500',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Установить
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {/* Playback Time Settings */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                🎵 Время воспроизведения
              </Text>
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
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Обновить время воспроизведения
                </Button>
              </Stack>
            </Paper>
            {/* Device Actions */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                🔧 Действия с устройством
              </Text>
              <Group grow>
                <Button 
                  variant="light" 
                  color="blue"
                  onClick={restartApp}
                  loading={loadingDeviceAction === 'restart-app'}
                  leftSection={<IconRefresh size={16} />}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Перезапустить приложение
                </Button>
                <Button 
                  variant="light" 
                  color="red"
                  onClick={rebootDevice}
                  loading={loadingDeviceAction === 'reboot'}
                  leftSection={<IconPower size={16} />}
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Перезагрузить устройство
                </Button>
              </Group>
            </Paper>
          </Stack>
        )}
      </Modal>


      {/* Новое модальное окно для радио потоков */}
      <DynamicFormModal
        opened={streamModalOpen}
        onClose={() => setStreamModalOpen(false)}
        title={
          streamModalMode === 'create' ? 'Создание радио потока' :
          streamModalMode === 'edit' ? 'Редактирование радио потока' :
          streamModalMode === 'view' ? 'Просмотр радио потока' :
          'Удаление радио потока'
        }
        mode={streamModalMode}
        fields={streamFormFields}
        initialValues={selectedStream || {
          name: '',
          branchTypeOfDist: '',
          frequencySongs: 5,
          volumeLevel: 80,
          fadeInDuration: 2,
          startDate: new Date().toISOString().split('T')[0],
          endDate: '',
          isActive: true
        }}
        onSubmit={streamModalMode === 'delete' ? undefined : handleStreamSubmit}
        onConfirm={streamModalMode === 'delete' ? handleStreamDelete : undefined}
        submitButtonText={
          streamModalMode === 'create' ? 'Создать поток' :
          streamModalMode === 'edit' ? 'Сохранить изменения' :
          undefined
        }
        cancelButtonText="Отмена"
        size="lg"
      />
    </div>
  );
};

export default RadioAdmin;
