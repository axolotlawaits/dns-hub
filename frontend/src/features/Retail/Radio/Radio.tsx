import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {Container,Title,Paper,Text,Button,Group,Stack,Modal,LoadingOverlay, Tabs, Card, Box, Progress} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {  IconUpload,  IconMusic,  IconClock,  IconDeviceMobile,  IconBuilding, IconEdit, IconCheck, IconRefresh, IconPower, IconBattery, IconWifi, IconCalendar, IconPlayerPlay, IconPlayerPause, IconWifiOff, IconX, IconRadio, IconDownload, IconAlertCircle } from '@tabler/icons-react';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import { DynamicFormModal, FormField } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import './Radio.css';
import '../../../app/styles/DesignSystem.css';


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

// Интерфейсы для системы обновлений
interface AppVersion {
  id: string;
  version: string;
  fileName: string;
  fileSize: number;
  description?: string;
  isActive: boolean;
  downloadCount: number;
  createdAt: string;
}

interface App {
  id: string;
  name: string;
  category: 'MOBILE' | 'DESKTOP' | 'UTILITY' | 'TOOL';
  appType: 'ANDROID_APK' | 'WINDOWS_EXE' | 'WINDOWS_MSI' | 'MACOS_DMG' | 'LINUX_DEB' | 'LINUX_RPM' | 'ARCHIVE';
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  versions: AppVersion[];
}

const RadioAdmin: React.FC = () => {
  const { setHeader, clearHeader } = usePageHeader();
  const { user } = useUserContext();
  const { access } = useAccessContext();
  const [branchesWithDevices, setBranchesWithDevices] = useState<BranchWithDevices[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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

  
  // Состояния для обновления устройства
  const [deviceUpdateAvailable, setDeviceUpdateAvailable] = useState<App | null>(null);
  const [updatingDevice, setUpdatingDevice] = useState(false);
  const [deviceAppVersion, setDeviceAppVersion] = useState<string>('');
  const [deviceUpdates, setDeviceUpdates] = useState<Record<string, App | null>>({});

  const API_BASE = useMemo(() => `${API}/radio`, []);

  // Определяем права доступа на основе роли пользователя
  const isAdminOrDeveloper = useMemo(() => {
    return user ? ['DEVELOPER', 'ADMIN'].includes(user.role) : false;
  }, [user]);

  const isSupervisorOrEmployee = useMemo(() => {
    return user ? ['SUPERVISOR', 'EMPLOYEE'].includes(user.role) : false;
  }, [user]);

  // Определяем доступ к Radio на основе групп доступа
  const radioAccess = useMemo(() => {
    if (!access || access.length === 0) return null;
    
    // Ищем доступ к Radio (toolId: dd6ec264-4e8c-477a-b2d6-c62a956422c0)
    const radioToolAccess = access.find(tool => 
      tool.link === '/radio' || tool.toolId === 'dd6ec264-4e8c-477a-b2d6-c62a956422c0'
    );
    
    return radioToolAccess?.accessLevel || null;
  }, [access]);

  // Определяем финальные права доступа с учетом ролей и групп доступа
  const hasFullAccess = useMemo(() => {
    // Если есть полный доступ через группы доступа
    if (radioAccess === 'FULL') return true;
    // Если админ или разработчик
    if (isAdminOrDeveloper) return true;
    return false;
  }, [radioAccess, isAdminOrDeveloper]);

  const hasReadOnlyAccess = useMemo(() => {
    // Если есть доступ только для чтения через группы доступа
    if (radioAccess === 'READONLY') return true;
    // Если супервизор или сотрудник без полного доступа
    if (isSupervisorOrEmployee && radioAccess !== 'FULL') return true;
    return false;
  }, [radioAccess, isSupervisorOrEmployee]);

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

  // Мемоизация устройств в зависимости от роли пользователя и групп доступа
  const currentBranchDevices = useMemo(() => {
    if (hasFullAccess) {
      // Полный доступ - видим все устройства всех филиалов
      return branchesWithDevices.flatMap(branch => branch.devices);
    } else if (hasReadOnlyAccess && user) {
      // Доступ только для чтения - видим только устройства своего филиала
      const userBranch = branchesWithDevices.find(branch => 
        branch.branch.name === user.branch || 
        branch.branch.uuid === user.branch
      );
      return userBranch?.devices || [];
    }
    return [];
  }, [branchesWithDevices, hasFullAccess, hasReadOnlyAccess, user]);


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
    },
    {
      name: 'attachment',
      label: 'Файл потока',
      type: 'file',
      required: false,
      accept: 'audio/mpeg,audio/mp3,.mp3',
      multiple: false,
      withDnd: true
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


  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // Функция для проверки обновлений для всех устройств
  const checkAllDevicesUpdates = useCallback(async () => {
    try {
      // Получаем все приложения из AppStore
      const response = await fetch(`${API}/retail/app-store`);
      const data = await response.json();
      
      if (data.success && data.apps) {
        // Ищем приложения для Android
        const androidApps = data.apps.filter((app: App) => 
          app.appType === 'ANDROID_APK' && 
          app.isActive && 
          app.versions && 
          app.versions.length > 0
        );
        
        // Проверяем обновления для каждого устройства
        const updates: Record<string, App | null> = {};
        
        for (const branchWithDevices of branchesWithDevices) {
          for (const device of branchWithDevices.devices) {
            // Проверяем, что устройство онлайн
            const isOnline = !!statusMap[device.id];
            
            if (!isOnline) {
              // Если устройство офлайн, не предлагаем обновления
              updates[device.id] = null;
              continue;
            }
            
            // Ищем доступное обновление для устройства
            const availableApp = androidApps.find((app: App) => {
              const latestVersion = app.versions[0]?.version;
              const currentVersion = device.app;
              if (!latestVersion || !currentVersion) return false;
              
              // Правильное сравнение версий: обновление доступно, если версия в AppStore больше текущей
              return compareVersions(latestVersion, currentVersion) > 0;
            });
            
            updates[device.id] = availableApp || null;
          }
        }
        
        setDeviceUpdates(updates);
      }
    } catch (error) {
      console.error('Ошибка при проверке обновлений для всех устройств:', error);
    }
  }, [branchesWithDevices, statusMap]);

  // Функция для сравнения версий
  const compareVersions = (version1: string, version2: string): number => {
    // Убираем суффиксы типа -DEBUG, -RELEASE и т.д.
    const cleanVersion1 = version1.replace(/[-_].*$/, '');
    const cleanVersion2 = version2.replace(/[-_].*$/, '');
    
    const v1Parts = cleanVersion1.split('.').map(Number);
    const v2Parts = cleanVersion2.split('.').map(Number);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  };

  // Функции для обновления устройства
  const checkDeviceUpdate = useCallback(async (device: Device) => {
    try {
      // Проверяем, что устройство онлайн
      const isOnline = !!statusMap[device.id];
      
      if (!isOnline) {
        // Если устройство офлайн, не предлагаем обновления
        setDeviceUpdateAvailable(null);
        setDeviceUpdates(prev => ({ ...prev, [device.id]: null }));
        return null;
      }
      
      // Получаем все приложения из AppStore
      const response = await fetch(`${API}/retail/app-store`);
      const data = await response.json();
      
      if (data.success && data.apps) {
        // Ищем приложения для Android (предполагаем, что устройство Android)
        const androidApps = data.apps.filter((app: App) => 
          app.appType === 'ANDROID_APK' && 
          app.isActive && 
          app.versions && 
          app.versions.length > 0
        );
        
        // Используем реальную версию приложения с устройства, если она доступна
        const currentAppVersion = deviceAppVersion || device.app;
        const availableApp = androidApps.find((app: App) => {
          const latestVersion = app.versions[0]?.version;
          if (!latestVersion || !currentAppVersion) return false;
          
          // Правильное сравнение версий: обновление доступно, если версия в AppStore больше текущей
          return compareVersions(latestVersion, currentAppVersion) > 0;
        });
        
        if (availableApp) {
          setDeviceUpdateAvailable(availableApp);
          // Обновляем состояние для конкретного устройства
          setDeviceUpdates(prev => ({ ...prev, [device.id]: availableApp }));
          return availableApp;
        } else {
          setDeviceUpdateAvailable(null);
          // Обновляем состояние для конкретного устройства
          setDeviceUpdates(prev => ({ ...prev, [device.id]: null }));
          return null;
        }
      }
    } catch (error) {
      console.error('Ошибка при проверке обновлений для устройства:', error);
      notificationSystem.addNotification(
        'Ошибка', 
        'Не удалось проверить обновления для устройства', 
        'error'
      );
    }
    return null;
  }, [deviceAppVersion, statusMap]);

  const sendUpdateToDevice = useCallback(async (device: Device, app: App) => {
    try {
      setUpdatingDevice(true);
      
      // Отправляем запрос на устройство для скачивания и установки обновления
      const response = await axios.post(`${API_BASE}/devices/${device.id}/update-app`, {
        apkUrl: `${API}/retail/app-store/${app.id}/download`,
        version: app.versions[0]?.version
      });
      
      if (response.data.success) {
        notificationSystem.addNotification(
          'Успех', 
          `Запрос на обновление отправлен на устройство ${device.name}`, 
          'success'
        );
        setDeviceUpdateAvailable(null);
      } else {
        notificationSystem.addNotification(
          'Ошибка', 
          response.data.error || 'Ошибка при отправке запроса на обновление', 
          'error'
        );
      }
    } catch (error) {
      console.error('Ошибка при отправке обновления на устройство:', error);
      notificationSystem.addNotification(
        'Ошибка', 
        'Не удалось отправить запрос на обновление', 
        'error'
      );
    } finally {
      setUpdatingDevice(false);
    }
  }, [API_BASE]);

  const handleStreamSubmit = useCallback(async (values: Record<string, any>) => {
    try {
      console.log('Form values:', values);
      
      const formData = new FormData();
      
      // Добавляем все поля кроме файла
      Object.keys(values).forEach(key => {
        if (key !== 'attachment' && values[key] !== undefined && values[key] !== null) {
          formData.append(key, values[key]);
        }
      });
      
      // Добавляем файл если он есть в values.attachment
      if (values.attachment && Array.isArray(values.attachment) && values.attachment.length > 0) {
        console.log('Adding file to FormData:', values.attachment[0]);
        formData.append('attachment', values.attachment[0].source);
      } else {
        console.log('No file to add to FormData');
      }
      
      if (streamModalMode === 'create') {
        const response = await axios.post(`${API_BASE}/streams`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log('Поток создан:', response.data);
        loadData();
      } else if (streamModalMode === 'edit' && selectedStream) {
        const response = await axios.put(`${API_BASE}/streams/${selectedStream.id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
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

  // Обработчики для редактирования и удаления потоков
  const handleEditStream = useCallback((stream: RadioStream) => {
    setSelectedStream(stream);
    setStreamModalMode('edit');
    setStreamModalOpen(true);
  }, []);

  const handleDeleteStream = useCallback((stream: RadioStream) => {
    setSelectedStream(stream);
    setStreamModalMode('delete');
    setStreamModalOpen(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Проверяем обновления для всех устройств после загрузки данных
  useEffect(() => {
    if (branchesWithDevices.length > 0) {
      checkAllDevicesUpdates();
    }
  }, [branchesWithDevices, checkAllDevicesUpdates]);

  // Устанавливаем заголовок страницы
  useEffect(() => {
    let accessType = '';
    if (hasFullAccess) {
      accessType = ' (Полный доступ)';
    } else if (hasReadOnlyAccess) {
      accessType = ' (Только чтение)';
    }
    
    setHeader({
      title: `Админ панель DNS Radio${accessType}`,
      subtitle: hasFullAccess 
        ? 'Управление радио потоками и устройствами' 
        : 'Просмотр устройств вашего филиала'
    });

    return () => clearHeader();
  }, [setHeader, clearHeader, hasFullAccess, hasReadOnlyAccess]);

  // Device Management Functions
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

  const loadDeviceAppVersion = useCallback(async (deviceId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/devices/${deviceId}/get-app-version`);
      if (response.data.success && response.data.data.appVersion) {
        setDeviceAppVersion(response.data.data.appVersion);
      } else {
        setDeviceAppVersion('');
      }
    } catch (error: any) {
      console.error('Error loading device app version:', error);
      setDeviceAppVersion('');
      // Не показываем ошибку, так как устройство может не поддерживать эту функцию
    }
  }, [API_BASE]);

  const openDeviceModal = useCallback(async (device: Device) => {
    setSelectedDevice(device);
    setDeviceModalOpen(true);
    setEditingPlaybackTime({ timeFrom: device.timeFrom, timeUntil: device.timeUntil });
    await loadDeviceStatus(device.id);
    await loadDeviceTime(device.id);
    await loadDeviceAppVersion(device.id);
    // Проверяем обновления для устройства
    await checkDeviceUpdate(device);
  }, [API_BASE, checkDeviceUpdate, loadDeviceAppVersion, loadDeviceStatus, loadDeviceTime]);

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
    console.log('handleUpload values:', values);
    
    const files = values.files || selectedFiles;
    console.log('Files to upload:', files);
    
    if (!files || files.length === 0) {
      console.log('No files to upload');
      return;
    }

    // Извлекаем файлы из структуры FileAttachment
    const extractedFiles = files.map((item: any) => {
      if (item && item.source) {
        return item.source; // Это File объект
      }
      return item; // Возможно, это уже File объект
    });

    console.log('Extracted files:', extractedFiles);
    console.log('First few extracted files:', extractedFiles.slice(0, 3));
    
    // Фильтруем только валидные файлы
    const validFiles = extractedFiles.filter((file: any) => {
      console.log('Checking file:', file, 'has name:', file?.name, 'is file:', file instanceof File);
      return file && file.name;
    });
    console.log('Valid files to upload:', validFiles.length);

    if (validFiles.length === 0) {
      console.log('No valid files to upload');
      return;
    }

    console.log('Uploading files:', validFiles);
    console.log('API_BASE:', API_BASE);

    setIsUploading(true);
      setUploadProgress(0);

    try {
      // Загружаем файлы последовательно, а не параллельно
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];

        const formData = new FormData();
        formData.append('music', file);

        console.log(`Sending file ${i + 1}/${validFiles.length}:`, file.name, 'to:', `${API_BASE}/upload`);

        const response = await axios.post(`${API_BASE}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        console.log('Upload response:', response.data);
        
        // Обновляем прогресс
        setUploadProgress(Math.round(((i + 1) / validFiles.length) * 100));
        
        // Небольшая задержка между загрузками для стабильности
        if (i < validFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setSelectedFiles([]);
      setUploadModalOpen(false);
      
      setTimeout(loadData, 1000);
    } catch (err) {
      console.error('Error uploading files:', err);

      try { notificationSystem.addNotification('Ошибка', 'Ошибка загрузки файлов', 'error'); } catch {}
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
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
    <DndProviderWrapper>
      <Box className="radio-container" style={{ paddingRight: 'var(--mantine-spacing-md)' }}>
        <Stack gap="lg">

          {/* Навигация и контент вкладок */}
          <Card shadow="sm" radius="lg" p="md" className="radio-navigation">
            <Tabs 
              defaultValue="music"
              variant="pills"
              classNames={{
                list: 'radio-tabs-list',
                tab: 'radio-tab'
              }}
            >
              <Tabs.List grow>
                {hasFullAccess && (
                <Tabs.Tab 
                  value="music" 
                  leftSection={<IconMusic size={18} />}
                  className="radio-tab-item"
                >
                  Музыка
                  {stats && (
                    <Text span size="xs" c="dimmed" ml="xs">
                      ({stats.totalMusicFiles})
                    </Text>
                  )}
                </Tabs.Tab>
                )}
                {hasFullAccess && (
                <Tabs.Tab 
                  value="streams" 
                  leftSection={<IconRadio size={18} />}
                  className="radio-tab-item"
                >
                  Потоки
                  <Text span size="xs" c="dimmed" ml="xs">
                    ({radioStreams.length})
                  </Text>
                </Tabs.Tab>
                )}
                <Tabs.Tab 
                  value="devices" 
                  leftSection={<IconDeviceMobile size={18} />}
                  className="radio-tab-item"
                >
                  Устройства
                  {stats && (
                    <Text span size="xs" c="dimmed" ml="xs">
                      ({stats.activeDevices}/{stats.totalDevices})
                    </Text>
                  )}
                </Tabs.Tab>
              </Tabs.List>

              {/* Контент вкладок */}
              <Box className="radio-content" mt="md">

              {hasFullAccess && (
              <Tabs.Panel value="music">
              <Stack gap="lg">
                {/* Статистика музыки */}
            {stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <Paper p="md" withBorder className="radio-stats-card">
                  <Group>
                    <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-primary-500)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                          <IconMusic size={20} color="white" />
                    </div>
                    <div>
                          <Text 
                            size="sm" 
                            fw={500}
                            style={{ color: 'var(--theme-text-tertiary)' }}
                          >
                            Музыкальных файлов
                          </Text>
                          <Text 
                            size="lg" 
                            fw={700}
                            style={{ color: 'var(--theme-text-primary)' }}
                          >
                            {stats.totalMusicFiles}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
                    
                    <Paper p="md" withBorder>
                  <Group>
                    <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                      backgroundColor: 'var(--color-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                          <IconBuilding size={20} color="white" />
                    </div>
                    <div>
                          <Text 
                            size="sm" 
                            fw={500}
                            style={{ color: 'var(--theme-text-tertiary)' }}
                          >
                            Филиалов
                          </Text>
                          <Text 
                            size="lg" 
                            fw={700}
                            style={{ color: 'var(--theme-text-primary)' }}
                          >
                            {stats.totalBranches}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
                </div>
                )}

                {/* Загрузка музыки */}
                <Paper p="lg" withBorder className="radio-stats-card">
                  <Group justify="space-between" mb="md">
                    <Title 
                      order={3} 
                      size="h4"
                      style={{ 
                        color: 'var(--theme-text-primary)',
                        fontWeight: 'var(--font-weight-semibold)',
                        fontSize: 'var(--font-size-lg)'
                      }}
                    >
                      <IconUpload size={20} style={{ marginRight: 8 }} />
                      Загрузка музыкальных файлов
                    </Title>
                    <Button 
                      onClick={() => setUploadModalOpen(true)}
                      leftSection={<IconUpload size={16} />}
                      className="radio-action-button"
                    >
                      Загрузить файлы
                    </Button>
                  </Group>
                  <Text 
                    size="sm"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    Загружайте MP3 файлы для воспроизведения в филиалах. 
                    Файлы автоматически сохраняются в папку retail/music/{musicStatus?.currentMonthFolder || 'текущий месяц'}.
                  </Text>
                </Paper>
              </Stack>
              </Tabs.Panel>
              )}

              {hasFullAccess && (
              <Tabs.Panel value="streams">
              <Stack gap="lg">
                <Group justify="space-between">
                  <Title 
                    order={3} 
                    size="h4"
                    style={{ 
                      color: 'var(--theme-text-primary)',
                      fontWeight: 'var(--font-weight-semibold)',
                      fontSize: 'var(--font-size-lg)'
                    }}
                  >
                    <IconRadio size={20} style={{ marginRight: 8 }} />
                    Радио потоки
                  </Title>
                  <Button 
                    onClick={handleCreateStream}
                    leftSection={<IconMusic size={16} />}
                    variant="outline"
                  >
                    Добавить поток
                  </Button>
                </Group>
                
                {radioStreams.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                    {radioStreams.map((stream) => (
                      <Paper key={stream.id} p="md" withBorder className="radio-stream-card">
                        <Group justify="space-between" mb="sm">
                          <Text fw={600} size="lg">
                            {stream.name}
                          </Text>
                          <Group gap="xs">
                            {stream.isActive ? (
                <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-success)'
                              }} />
                            ) : (
                              <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-error)'
                              }} />
                            )}
                            <Text size="xs" c={stream.isActive ? 'green' : 'red'}>
                              {stream.isActive ? 'Активен' : 'Неактивен'}
                            </Text>
                          </Group>
                        </Group>
                        
                        <Stack gap="xs">
                          <Text size="sm" c="dimmed">
                            Тип филиала: <Text span fw={500}>{stream.branchTypeOfDist}</Text>
                          </Text>
                          <Text size="sm" c="dimmed">
                            Частота: <Text span fw={500}>каждые {stream.frequencySongs} песен</Text>
                          </Text>
                          <Text size="sm" c="dimmed">
                            Громкость: <Text span fw={500}>{stream.volumeLevel}%</Text>
                          </Text>
                          <Text size="sm" c="dimmed">
                            Плавность: <Text span fw={500}>{stream.fadeInDuration}с</Text>
                          </Text>
                          {stream.attachment && (
                            <Text size="sm" c="dimmed">
                              Файл: <Text span fw={500}>{stream.attachment}</Text>
                            </Text>
                          )}
                          <Text size="xs" c="dimmed">
                            Создан: {new Date(stream.createdAt).toLocaleDateString('ru-RU')}
                          </Text>
                        </Stack>
                        
                        <Group justify="flex-end" mt="md">
                          <Button
                            variant="light"
                            size="xs"
                            leftSection={<IconEdit size={14} />}
                            onClick={() => handleEditStream(stream)}
                          >
                            Редактировать
                          </Button>
                          <Button
                            variant="light"
                            color="red"
                            size="xs"
                            leftSection={<IconX size={14} />}
                            onClick={() => handleDeleteStream(stream)}
                          >
                            Удалить
                          </Button>
                        </Group>
                      </Paper>
                    ))}
                  </div>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Радио потоки не найдены. Создайте первый поток для начала работы.
                  </Text>
                )}
              </Stack>
              </Tabs.Panel>
              )}

              <Tabs.Panel value="devices">
              <Stack gap="lg">
                {/* Статистика устройств */}
                {stats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <Paper p="md" withBorder className="radio-stats-card">
                  <Group>
                    <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-primary-500)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                          <IconDeviceMobile size={20} color="white" />
                    </div>
                    <div>
                          <Text 
                            size="sm" 
                            fw={500}
                            style={{ color: 'var(--theme-text-tertiary)' }}
                          >
                            Всего устройств
                          </Text>
                          <Text 
                            size="lg" 
                            fw={700}
                            style={{ color: 'var(--theme-text-primary)' }}
                          >
                            {stats.totalDevices}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
                    
                    <Paper p="md" withBorder>
                  <Group>
                    <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                          <IconCheck size={20} color="white" />
                    </div>
                        <div>
                          <Text 
                            size="sm" 
                            fw={500}
                            style={{ color: 'var(--theme-text-tertiary)' }}
                          >
                            Активных
                          </Text>
                          <Text 
                            size="lg" 
                            fw={700}
                            style={{ color: 'var(--theme-text-primary)' }}
                          >
                            {stats.activeDevices}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
              </div>
            )}

                {/* Устройства по филиалам */}
              <Stack gap="lg">
                {hasFullAccess ? (
                  // Полный доступ - видим все филиалы
                  branchesWithDevices.map((branchData) => (
                    <Paper key={branchData.branch.uuid} p="lg" withBorder className="radio-device-card">
                    <Group justify="space-between" mb="md">
                      <div>
                          <Title order={4} size="h5">{branchData.branch.name}</Title>
                          <Text size="sm" c="dimmed">{branchData.branch.typeOfDist}</Text>
                      </div>
                      <div style={{
                        padding: '6px 12px',
                          backgroundColor: 'var(--color-primary-500)',
                        borderRadius: '20px',
                          color: 'white',
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
                              backgroundColor: 'var(--theme-bg-elevated)',
                              borderRadius: '8px',
                              border: '1px solid var(--theme-border)',
                              cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onClick={() => openDeviceModal(device)}
                              onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)'}
                            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                          >
                            <Group justify="space-between" align="center">
                              <div>
                                  <Group gap="xs" align="center">
                                    <Text fw={500} size="sm" style={{ color: 'var(--theme-text-primary)' }}>{device.name}</Text>
                                    {deviceUpdates[device.id] && (
                                      <IconAlertCircle 
                                        size={16} 
                                        color="var(--mantine-color-orange-6)"
                                        title={`Доступно обновление до версии ${deviceUpdates[device.id]?.versions[0]?.version}`}
                                      />
                                    )}
                                  </Group>
                                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                  {device.network}{device.number} • {device.os} • {device.app}
                                </Text>
                              </div>
                              
                              <Group gap="xs">
                                <div style={{
                                  padding: '4px 8px',
                                  backgroundColor: online ? 'var(--color-success)' : 'var(--color-gray-500)',
                                  borderRadius: '12px',
                                  color: 'white',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}>
                                  {online ? 'Онлайн' : 'Оффлайн'}
                                </div>
                                
                                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                  {formatTime(device.timeFrom)} - {formatTime(device.timeUntil)}
                                </Text>
                                
                                  <IconEdit size={16} style={{ color: 'var(--theme-text-secondary)' }} />
                              </Group>
                            </Group>
                          </div>
                        )
                      })}
                    </Stack>
                    </Paper>
                ))
                ) : (
                  // Доступ только для чтения - видим только свой филиал
                  hasReadOnlyAccess && user && (
                    <Paper p="lg" withBorder className="radio-device-card">
                      <Group justify="space-between" mb="md">
                        <div>
                          <Title order={4} size="h5">{user.branch}</Title>
                          <Text size="sm" c="dimmed">Ваш филиал</Text>
                        </div>
                        <div style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--color-primary-500)',
                          borderRadius: '20px',
                          color: 'white',
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
                                backgroundColor: 'var(--theme-bg-elevated)',
                                borderRadius: '8px',
                                border: '1px solid var(--theme-border)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => openDeviceModal(device)}
                              onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)'}
                              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                            >
                              <Group justify="space-between" align="center">
                                <div>
                                  <Group gap="xs" align="center">
                                    <Text fw={500} size="sm" style={{ color: 'var(--theme-text-primary)' }}>{device.name}</Text>
                                    {deviceUpdates[device.id] && (
                                      <IconAlertCircle 
                                        size={16} 
                                        color="var(--mantine-color-orange-6)"
                                        title={`Доступно обновление до версии ${deviceUpdates[device.id]?.versions[0]?.version}`}
                                      />
                                    )}
                                  </Group>
                                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                  {device.network}{device.number} • {device.os} • {device.app}
                                </Text>
                                </div>
                                
                                <Group gap="xs">
                                  <div style={{
                                    padding: '4px 8px',
                                    backgroundColor: online ? 'var(--color-success)' : 'var(--color-gray-500)',
                                    borderRadius: '12px',
                                    color: 'white',
                                    fontSize: '11px',
                                    fontWeight: '500'
                                  }}>
                                    {online ? 'Онлайн' : 'Оффлайн'}
                                  </div>
                                  
                                    <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                    {formatTime(device.timeFrom)} - {formatTime(device.timeUntil)}
                                  </Text>
                                  
                                    <IconEdit size={16} style={{ color: 'var(--theme-text-secondary)' }} />
                                </Group>
                              </Group>
                            </div>
                          )
                        })}
                      </Stack>
                    </Paper>
                  )
                )}
              </Stack>
          </Stack>
              </Tabs.Panel>

              </Box>
            </Tabs>
          </Card>
        </Stack>
      </Box>

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
        initialValues={{ files: selectedFiles.map(file => ({
          id: Math.random().toString(36).substr(2, 9),
          userAdd: 'user',
          source: file,
          meta: {}
        })) }}
        onSubmit={handleUpload}
        submitButtonText={isUploading ? `Загрузка... ${uploadProgress}%` : "Загрузить"}
        cancelButtonText="Отмена"
        size="md"
      />
      
      {/* Progress Bar */}
      {isUploading && (
        <Modal
          opened={isUploading}
          onClose={() => {}}
          title="Загрузка файлов"
          size="md"
          closeOnClickOutside={false}
          closeOnEscape={false}
          withCloseButton={false}
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Загружается {uploadProgress}% файлов...
            </Text>
            <Progress 
              value={uploadProgress} 
              size="lg" 
              radius="md"
              color="blue"
              animated
            />
            <Text size="xs" c="dimmed" ta="center">
              Пожалуйста, не закрывайте браузер до завершения загрузки
            </Text>
        </Stack>
      </Modal>
      )}





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
                  <Text size="sm" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>Имя устройства</Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                    {selectedDevice.name}
                  </Text>
                </div>
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
                  <Text size="sm" fw={500} style={{ color: 'var(--theme-text-secondary)' }}>
                    Версия приложения {deviceAppVersion ? '(с устройства)' : '(из БД)'}
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-primary)' }}>
                    {deviceAppVersion || selectedDevice.app}
                    {deviceAppVersion && deviceAppVersion !== selectedDevice.app && (
                      <Text span size="xs" c="dimmed" ml="xs">
                        (в БД: {selectedDevice.app})
                      </Text>
                    )}
                  </Text>
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

            {/* Time Management - Закомментировано */}
            {/* 
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
            */}

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

            {/* App Update Section */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                📱 Обновление приложения
              </Text>
              
              {!selectedDevice || !statusMap[selectedDevice.id] ? (
                <Stack gap="sm" align="center">
                  <IconWifiOff size={32} color="var(--mantine-color-gray-6)" />
                  <Text size="md" fw={500} c="dimmed">
                    Устройство офлайн
                  </Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Проверка обновлений доступна только для онлайн устройств
                  </Text>
                </Stack>
              ) : deviceUpdateAvailable ? (
                <Stack gap="md">
                  <Paper p="md" withBorder radius="md" style={{ 
                    backgroundColor: 'var(--mantine-color-blue-0)',
                    border: '1px solid var(--mantine-color-blue-3)'
                  }}>
                    <Group justify="space-between" mb="sm">
                      <div>
                        <Text fw={600} size="md" c="blue">
                          Доступно обновление!
                        </Text>
                        <Text size="sm" c="dimmed">
                          Текущая версия: {deviceAppVersion || selectedDevice?.app}
                        </Text>
                      </div>
                      <IconAlertCircle size={24} color="var(--mantine-color-blue-6)" />
                    </Group>
                    
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="sm" fw={500}>
                          {deviceUpdateAvailable.name}
                        </Text>
                        <Text size="sm" c="blue" fw={500}>
                          v{deviceUpdateAvailable.versions[0]?.version}
                        </Text>
                      </Group>
                      
                      {deviceUpdateAvailable.versions[0]?.description && (
                        <Paper p="sm" withBorder radius="md" style={{ backgroundColor: 'white' }}>
                          <Text size="sm" c="dimmed">
                            {deviceUpdateAvailable.versions[0].description}
                          </Text>
                        </Paper>
                      )}
                      
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">
                          Размер: {formatFileSize(deviceUpdateAvailable.versions[0]?.fileSize || 0)}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {new Date(deviceUpdateAvailable.versions[0]?.createdAt || '').toLocaleDateString('ru-RU')}
                        </Text>
                      </Group>
                    </Stack>
                  </Paper>
                  
                  <Button
                    fullWidth
                    size="md"
                    leftSection={<IconDownload size={16} />}
                    onClick={() => selectedDevice && sendUpdateToDevice(selectedDevice, deviceUpdateAvailable)}
                    loading={updatingDevice}
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
                    {updatingDevice ? 'Отправка запроса...' : 'Обновить приложение на устройстве'}
                  </Button>
                  
                  <Text size="xs" c="dimmed" ta="center">
                    Устройство автоматически скачает и установит обновление
                  </Text>
                </Stack>
              ) : (
                <Stack gap="sm" align="center">
                  <IconCheck size={32} color="var(--mantine-color-green-6)" />
                  <Text size="md" fw={500} c="green">
                    Приложение актуально
                  </Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Текущая версия: {deviceAppVersion || selectedDevice?.app}
                  </Text>
                  <Button
                    variant="outline"
                    size="sm"
                    leftSection={<IconRefresh size={14} />}
                    disabled={!selectedDevice || !statusMap[selectedDevice.id]}
                    onClick={() => selectedDevice && checkDeviceUpdate(selectedDevice)}
                  >
                    Проверить обновления
                  </Button>
                </Stack>
              )}
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

    </DndProviderWrapper>
  );
};

export default RadioAdmin;
