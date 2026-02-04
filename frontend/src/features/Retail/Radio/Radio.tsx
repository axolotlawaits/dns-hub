import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {Container,Title,Paper,Text,Button,Group,Stack,Modal,LoadingOverlay, Tabs, Box, Progress, Badge, TextInput, Select, SimpleGrid, ActionIcon, Loader} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {  IconUpload,  IconMusic,  IconClock,  IconDeviceMobile,  IconBuilding, IconEdit, IconCheck, IconRefresh, IconPower, IconBattery, IconWifi, IconCalendar, IconPlayerPlay, IconPlayerPause, IconWifiOff, IconX, IconRadio, IconDownload, IconAlertCircle, IconChevronDown, IconChevronRight, IconChevronsDown, IconChevronsUp, IconSearch, IconTrash, IconQrcode, IconFilter, IconPlus } from '@tabler/icons-react';
import { notificationSystem } from '../../../utils/Push';
import { API } from '../../../config/constants';
import { DynamicFormModal, FormField } from '../../../utils/formModal';
import { DndProviderWrapper } from '../../../utils/dnd';
import { usePageHeader } from '../../../contexts/PageHeaderContext';
import { decodeRussianFileName, formatMonthFolder } from '../../../utils/format';
import { useUserContext } from '../../../hooks/useUserContext';
import { useAccessContext } from '../../../hooks/useAccessContext';
import { FilterGroup } from '../../../utils/filter';
import WebRadioPlayer from './components/WebRadioPlayer';
import QrProvisionModal from './components/QrProvisionModal';

import './Radio.css';
import '../../../app/styles/DesignSystem.css';


interface Device {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  rrs?: string;
  timeFrom: string;
  timeUntil: string;
  activity: string;
  network: string;
  number: string;
  vendor: string;
  os: string;
  app: string;
  createdAt: string;
  user?: {
    id: string;
  name: string;
    login: string;
  };
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
  storesCount?: number;
  discountCentersCount?: number;
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
  
  // Настройки времени воспроизведения
  const [workingTimeSettings, setWorkingTimeSettings] = useState({
    start: "08:00",
    end: "22:00"
  });
  
  
  // Функция для изменения времени воспроизведения
  const handleTimeChange = useCallback((newTime: { start: string; end: string }) => {
    setWorkingTimeSettings(newTime);
    notificationSystem.addNotification('Настройки обновлены', `Время воспроизведения: ${newTime.start}-${newTime.end}`, 'success');
  }, []);

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUploadFolder, setSelectedUploadFolder] = useState<string | null>(null);

  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});

  // Состояние для радио потоков
  const [radioStreams, setRadioStreams] = useState<RadioStream[]>([]);
  
  // Состояния для нового модального окна
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [streamModalMode, setStreamModalMode] = useState<'create' | 'edit' | 'view' | 'delete'>('create');
  const [selectedStream, setSelectedStream] = useState<RadioStream | null>(null);

  // Состояние для фильтров устройств (для FilterGroup)
  const [deviceColumnFilters, setDeviceColumnFilters] = useState<any[]>([]);

  // Состояние для фильтров потоков
  const [streamSearchQuery, setStreamSearchQuery] = useState<string>('');
  const [streamFilterActive, setStreamFilterActive] = useState<string>('all'); // 'all', 'active', 'inactive'
  const [streamFilterType, setStreamFilterType] = useState<string>('all'); // 'all' или конкретный тип

  // Состояние для списка песен
  const [musicFilesCurrent, setMusicFilesCurrent] = useState<Array<{
    name: string;
    size: number;
    created: string;
    modified: string;
    path: string;
  }>>([]);
  const [musicFilesNext, setMusicFilesNext] = useState<Array<{
    name: string;
    size: number;
    created: string;
    modified: string;
    path: string;
  }>>([]);
  const [loadingMusicFiles, setLoadingMusicFiles] = useState(false);
  const [pastMonthFolders, setPastMonthFolders] = useState<Array<{
    name: string;
    path: string;
    created: Date;
  }>>([]);
  const [loadingPastFolders, setLoadingPastFolders] = useState(false);

  
  // Device Management Modal
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const [deviceStatus, setDeviceStatus] = useState<any>(null);

  const [loadingDeviceAction, setLoadingDeviceAction] = useState<string | null>(null);
  const [editingPlaybackTime, setEditingPlaybackTime] = useState({ timeFrom: '', timeUntil: '' });

  // QR Provision Modal
  const [qrProvisionModalOpen, setQrProvisionModalOpen] = useState(false);
  const [radioAppId, setRadioAppId] = useState<string | null>(null); // ID приложения Radio из AppStore

  
  // Состояния для обновления устройства
  const [deviceUpdateAvailable, setDeviceUpdateAvailable] = useState<App | null>(null);
  const [updatingDevice, setUpdatingDevice] = useState(false);
  const [deviceAppVersion, setDeviceAppVersion] = useState<string>('');
  const [deviceUpdates, setDeviceUpdates] = useState<Record<string, App | null>>({});

  // Состояние для управления раскрытием филиалов
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  const API_BASE = useMemo(() => `${API}/radio`, []);

  // Функции для управления раскрытием филиалов
  const toggleBranchExpansion = useCallback((branchId: string) => {
    setExpandedBranches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(branchId)) {
        newSet.delete(branchId);
      } else {
        newSet.add(branchId);
      }
      return newSet;
    });
  }, []);

  const expandAllBranches = useCallback(() => {
    const allBranchIds = branchesWithDevices.map(branch => branch.branch.uuid);
    setExpandedBranches(new Set(allBranchIds));
  }, [branchesWithDevices]);

  const collapseAllBranches = useCallback(() => {
    setExpandedBranches(new Set());
  }, []);

  // Функции для управления фильтрами устройств
  const clearDeviceFilters = useCallback(() => {
    setDeviceColumnFilters([]);
  }, []);

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

  // Состояние активной вкладки
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (hasReadOnlyAccess) {
      return "devices"; // Для пользователей с доступом только для чтения показываем устройства
    }
    if (hasFullAccess) {
      return "dashboard"; // Для полного доступа показываем дашборд
    }
    return "devices"; // По умолчанию показываем устройства
  });
  
  // Состояние для сохранения пресетов фильтров (будет использовано позже)
  // const [filterPresets, setFilterPresets] = useState<Array<{id: string, name: string, filters: any[]}>>(() => {
  //   const saved = localStorage.getItem('radio-filter-presets');
  //   return saved ? JSON.parse(saved) : [];
  // });

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

  // Получение уникальных РРС из всех устройств
  const rrsOptions = useMemo(() => {
    const rrsSet = new Set<string>();
    branchesWithDevices.forEach(branch => {
      branch.devices.forEach(device => {
        if (device.rrs) {
          rrsSet.add(device.rrs);
        }
      });
    });
    return Array.from(rrsSet).map(rrs => ({ value: rrs, label: rrs }));
  }, [branchesWithDevices]);

  // Конфигурация фильтров для FilterGroup
  const deviceFiltersConfig = useMemo(() => [
    {
      columnId: 'rrs',
      type: 'select' as const,
      label: 'РРС',
      placeholder: 'Выберите РРС',
      options: rrsOptions,
      icon: <IconBuilding size={16} />
    },
    {
      columnId: 'branchId',
      type: 'select' as const,
      label: 'Филиал',
      placeholder: 'Выберите филиал',
      options: branchesWithDevices.map(branch => ({
        value: branch.branch.uuid,
        label: branch.branch.name
      })),
      icon: <IconBuilding size={16} />
    },
    {
      columnId: 'status',
      type: 'select' as const,
      label: 'Статус',
      placeholder: 'Выберите статус',
      options: [
        { value: 'online', label: 'Онлайн' },
        { value: 'offline', label: 'Оффлайн' }
      ],
      icon: <IconWifi size={16} />
    },
    {
      columnId: 'search',
      type: 'text' as const,
      label: 'Поиск',
      placeholder: 'Поиск по названию...',
      icon: <IconSearch size={16} />
    }
  ], [rrsOptions, branchesWithDevices]);

  // Мемоизация устройств в зависимости от роли пользователя и групп доступа
  const currentBranchDevices = useMemo(() => {
    if (hasFullAccess) {
      // Полный доступ - видим все устройства всех филиалов (для статистики и других целей)
      const allDevices = branchesWithDevices.flatMap(branch => branch.devices);
      
      // Дедупликация устройств по ID (убираем дубли)
      const uniqueDevices = allDevices.filter((device, index, self) => 
        index === self.findIndex(d => d.id === device.id)
      );
      
      console.log('🔍 [Radio] Полный доступ - все устройства:', allDevices.length, 'уникальных:', uniqueDevices.length);
      return uniqueDevices;
    } else if (hasReadOnlyAccess && user) {
      // Доступ только для чтения - видим только устройства своего филиала
      console.log('🔍 [Radio] Поиск филиала пользователя по названию:', user.branch);
      const userBranch = branchesWithDevices.find(branch => 
        branch.branch.name === user.branch
      );
      console.log('🔍 [Radio] Найденный филиал:', userBranch?.branch.name, 'устройств:', userBranch?.devices.length);
      return userBranch?.devices || [];
    }
    return [];
  }, [branchesWithDevices, hasFullAccess, hasReadOnlyAccess, user]);

  // Фильтрация устройств для полного доступа
  const filteredDevices = useMemo(() => {
    if (!hasFullAccess) return currentBranchDevices;
    
    return currentBranchDevices.filter(device => {
      // Фильтр по РРС
      const rrsFilter = deviceColumnFilters.find(f => f.id === 'rrs')?.value as string[] | undefined;
      if (rrsFilter && rrsFilter.length > 0 && device.rrs && !rrsFilter.includes(device.rrs)) return false;
      
      // Фильтр по филиалу
      const branchFilter = deviceColumnFilters.find(f => f.id === 'branchId')?.value as string[] | undefined;
      if (branchFilter && branchFilter.length > 0 && !branchFilter.includes(device.branchId)) return false;
      
      // Фильтр по статусу онлайн/оффлайн
      const statusFilter = deviceColumnFilters.find(f => f.id === 'status')?.value as string[] | undefined;
      if (statusFilter && statusFilter.length > 0) {
        const isOnline = !!statusMap[device.id];
        const status = isOnline ? 'online' : 'offline';
        if (!statusFilter.includes(status)) return false;
      }
      
      // Фильтр по поиску
      const searchFilter = deviceColumnFilters.find(f => f.id === 'search')?.value as string | undefined;
      if (searchFilter && searchFilter.trim()) {
        const searchLower = searchFilter.toLowerCase();
        return device.name.toLowerCase().includes(searchLower) ||
               device.vendor.toLowerCase().includes(searchLower) ||
               device.branchName.toLowerCase().includes(searchLower);
      }
      
      return true;
    });
  }, [currentBranchDevices, deviceColumnFilters, statusMap, hasFullAccess]);

  // Фильтрация и группировка потоков
  const streamsByType = useMemo(() => {
    // Применяем фильтры
    let filtered = radioStreams.filter(stream => {
      // Поиск по названию
      if (streamSearchQuery) {
        const query = streamSearchQuery.toLowerCase();
        if (!stream.name.toLowerCase().includes(query) && 
            !stream.branchTypeOfDist.toLowerCase().includes(query)) {
          return false;
        }
      }
      
      // Фильтр по активности
      if (streamFilterActive === 'active' && !stream.isActive) return false;
      if (streamFilterActive === 'inactive' && stream.isActive) return false;
      
      // Фильтр по типу филиала
      if (streamFilterType !== 'all' && stream.branchTypeOfDist !== streamFilterType) {
        return false;
      }
      
      return true;
    });

    // Группируем по типам
    const grouped = filtered.reduce((acc, stream) => {
      const type = stream.branchTypeOfDist || 'Неизвестный тип';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(stream);
      return acc;
    }, {} as Record<string, RadioStream[]>);

    // Сортируем потоки внутри каждой группы по активности и названию
    Object.keys(grouped).forEach(type => {
      grouped[type].sort((a, b) => {
        // Сначала активные потоки
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }
        // Затем по названию
        return a.name.localeCompare(b.name);
      });
    });

    return grouped;
  }, [radioStreams, streamSearchQuery, streamFilterActive, streamFilterType]);

  // Уникальные типы филиалов для фильтра
  const uniqueBranchTypes = useMemo(() => {
    const types = new Set(radioStreams.map(s => s.branchTypeOfDist).filter(Boolean));
    return Array.from(types).sort();
  }, [radioStreams]);

  // Статистика потоков
  const streamsStats = useMemo(() => {
    const total = radioStreams.length;
    const active = radioStreams.filter(s => s.isActive).length;
    const inactive = total - active;
    const filtered = Object.values(streamsByType).flat().length;
    
    return { total, active, inactive, filtered };
  }, [radioStreams, streamsByType]);

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
    
    // Вычисляем следующий месяц правильно
    const currentMonthIndex = now.getMonth(); // Текущий месяц (0-11, где 0=январь)
    const nextMonthIndex = currentMonthIndex + 1; // Индекс следующего месяца (1-12)
    const nextYear = nextMonthIndex >= 12 ? currentYear + 1 : currentYear; // Если декабрь или больше, то следующий год
    const nextMonthNumber = nextMonthIndex >= 12 ? 1 : nextMonthIndex + 1; // Номер месяца (1-12)
    const nextMonth = String(nextMonthNumber).padStart(2, '0');
    const nextMonthFolder = `${nextMonth}-${nextYear}`;
    
    // Создаем объект Date для первого дня следующего месяца
    const nextMonthDate = new Date(nextYear, nextMonthNumber - 1, 1);
    
    // Вычисляем точное количество дней до следующего месяца
    const daysUntilNextMonth = Math.ceil((nextMonthDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    // Проверяем, нужно ли предупреждение (осталось 5 дней или меньше до следующего месяца)
    const shouldWarn = daysUntilNextMonth <= 5;
    
    return {
      hasCurrentMonthMusic,
      shouldWarn,
      currentMonthFolder,
      nextMonthFolder,
      daysUntilNextMonth: shouldWarn ? daysUntilNextMonth : 0
    };
  }, [stats]);

  // Загрузка списка песен для обоих месяцев
  const loadMusicFiles = useCallback(async () => {
    if (!musicStatus) return;
    
    setLoadingMusicFiles(true);
    
    // Загружаем оба месяца параллельно
    const loadFolder = async (folderName: string | undefined) => {
      if (!folderName) return [];
      
      try {
        const response = await axios.get(`${API_BASE}/folder/${folderName}/music`);
        if (response.data.success) {
          return response.data.files || [];
        }
        return [];
      } catch (error: any) {
        // Если папка не найдена, это нормально - просто нет файлов
        if (error.response?.status !== 404) {
          console.error('Ошибка загрузки списка песен:', error);
        }
        return [];
      }
    };

    try {
      const [currentFiles, nextFiles] = await Promise.all([
        loadFolder(musicStatus.currentMonthFolder),
        loadFolder(musicStatus.nextMonthFolder)
      ]);
      
      setMusicFilesCurrent(currentFiles);
      setMusicFilesNext(nextFiles);
    } catch (error: any) {
      console.error('Ошибка загрузки списка песен:', error);
      notificationSystem.addNotification('Ошибка', 'Не удалось загрузить список песен', 'error');
    } finally {
      setLoadingMusicFiles(false);
    }
  }, [musicStatus, API_BASE]);

  // Загрузка папок прошлых месяцев
  const loadPastMonthFolders = useCallback(async () => {
    if (!musicStatus) return;
    
    setLoadingPastFolders(true);
    try {
      const response = await axios.get(`${API_BASE}/folders`);
      if (response.data.success && response.data.folders) {
        // Фильтруем папки прошлых месяцев (не текущий и не следующий)
        const pastFolders = response.data.folders.filter((folder: any) => {
          return folder.name !== musicStatus.currentMonthFolder && 
                 folder.name !== musicStatus.nextMonthFolder;
        });
        setPastMonthFolders(pastFolders);
      }
    } catch (error: any) {
      console.error('Ошибка загрузки папок прошлых месяцев:', error);
    } finally {
      setLoadingPastFolders(false);
    }
  }, [musicStatus, API_BASE]);

  // Загружаем список песен при изменении месяца или открытии вкладки
  useEffect(() => {
    if (activeTab === 'music' && musicStatus) {
      loadMusicFiles();
      loadPastMonthFolders();
    }
  }, [activeTab, musicStatus, loadMusicFiles, loadPastMonthFolders]);




  const handleCreateStream = useCallback(() => {
    setSelectedStream(null);
    setStreamModalMode('create');
    setStreamModalOpen(true);
  }, []);




  // Конфигурация полей для создания радио потока
  const streamCreateFields: FormField[] = [
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

  // Конфигурация полей для редактирования радио потока (без поля файла)
  const streamEditFields: FormField[] = [
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

  // Функция для загрузки статусов устройств
  const loadDeviceStatuses = useCallback(async () => {
    try {
      // Используем devices-status-ping для реального статуса через WebSocket
      const statusResp = await axios.get(`${API_BASE}/devices-status-ping`);
      // console.log('📊 [Radio] Полный ответ статусов:', statusResp.data);
      const arr = (statusResp.data && statusResp.data.data) ? statusResp.data.data : [];
      // console.log('📊 [Radio] Массив статусов:', arr);
      // console.log('📊 [Radio] Размер массива:', arr.length);
      
      const sm: Record<string, boolean> = {};
      for (const item of arr) {
        sm[item.deviceId] = !!item.online;
        // Логируем первые 10 устройств
        // if (Object.keys(sm).length <= 10) {
        //   console.log(`📊 [Radio] Device ${item.deviceId}: online=${item.online}`);
        // }
      }
      
      setStatusMap(sm);
      // console.log('📊 [Radio] Статусы устройств обновлены:', Object.values(sm).filter(Boolean).length, 'онлайн из', Object.keys(sm).length);
      // console.log('📊 [Radio] Созданный statusMap:', sm);
    } catch (e) {
      console.error('❌ [Radio] Ошибка загрузки статусов устройств:', e);
    }
  }, []);

  // Функция для удаления устройства
  const deleteDevice = useCallback(async (deviceId: string) => {
    try {
      // Используем общий API для устройств, а не /radio/device
      await axios.delete(`${API}/device/${deviceId}`);
      notificationSystem.addNotification('Успешно', 'Устройство успешно удалено', 'success');
      // Перезагружаем данные - будет определена позже
      window.location.reload();
    } catch (error) {
      console.error('❌ [Radio] Ошибка удаления устройства:', error);
      notificationSystem.addNotification('Ошибка', 'Ошибка удаления устройства', 'error');
    }
  }, []);

  // Функция для обновления статуса устройства
  const refreshDeviceStatus = useCallback(async (deviceId: string) => {
    try {
      // Отправляем ping конкретному устройству
      await axios.post(`${API_BASE}/device/${deviceId}/ping`);
      notificationSystem.addNotification('Успешно', 'Статус устройства обновлен', 'success');
      // Перезагружаем статусы
      await loadDeviceStatuses();
    } catch (error) {
      console.error('❌ [Radio] Ошибка обновления статуса устройства:', error);
      notificationSystem.addNotification('Ошибка', 'Ошибка обновления статуса устройства', 'error');
    }
  }, [loadDeviceStatuses]);

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
          user: d.user ? {
            id: d.user.id,
            name: d.user.name,
            login: d.user.login
          } : undefined,
        }))
      }));

      console.log('🔍 [Radio] Загруженные данные branchesWithDevices:', mapped);
      console.log('🔍 [Radio] Общее количество устройств:', mapped.reduce((total, branch) => total + branch.devices.length, 0));
      
      // Проверим структуру первого устройства
      if (mapped.length > 0 && mapped[0].devices.length > 0) {
        console.log('🔍 [Radio] Пример устройства:', mapped[0].devices[0]);
        console.log('🔍 [Radio] Пользователь устройства:', mapped[0].devices[0].user);
      }

      setBranchesWithDevices(mapped);

          // Загружаем статусы устройств через ping
      await loadDeviceStatuses();
      
      // Логируем после загрузки статусов
      // console.log('🔍 [Radio] После загрузки статусов - branchesWithDevices.length:', mapped.length);
      // console.log('🔍 [Radio] После загрузки статусов - всего устройств:', mapped.reduce((total, branch) => total + branch.devices.length, 0));

      const sd = (statsResponse.data && statsResponse.data.data) ? statsResponse.data.data : {};
      // console.log('Stats response:', statsResponse.data);
      // console.log('Stats data:', sd);
      setStats({
        totalDevices: sd.totalDevices ?? 0,
        activeDevices: sd.activeDevices ?? 0,
        totalBranches: sd.totalBranches ?? 0,
        storesCount: sd.storesCount ?? 0,
        discountCentersCount: sd.discountCentersCount ?? 0,
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
    
    // Проверяем, что версии содержат хотя бы одну цифру
    if (!cleanVersion1 || !cleanVersion2 || 
        !/\d/.test(cleanVersion1) || !/\d/.test(cleanVersion2)) {
      return 0;
    }
    
    const v1Parts = cleanVersion1.split('.').map(Number);
    const v2Parts = cleanVersion2.split('.').map(Number);
    
    // Проверяем, что все части версий являются числами
    if (v1Parts.some(isNaN) || v2Parts.some(isNaN)) {
      return 0;
    }
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) {
        return 1;
      }
      if (v1Part < v2Part) {
        return -1;
      }
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
        // Если версия не указана, не предлагаем обновления
        const currentAppVersion = deviceAppVersion;
        console.log('Checking device update:', {
          deviceId: device.id,
          deviceAppVersion,
          deviceApp: device.app,
          currentAppVersion,
          androidAppsCount: androidApps.length
        });
        
        // Если версия приложения неизвестна, не предлагаем обновления
        if (!currentAppVersion || currentAppVersion.trim() === '') {
          console.log('Device app version unknown, skipping update check');
          return null;
        }
        
        const availableApp = androidApps.find((app: App) => {
          const latestVersion = app.versions[0]?.version;
          if (!latestVersion || !currentAppVersion) return false;
          
          const comparison = compareVersions(latestVersion, currentAppVersion);
          console.log('Version comparison:', {
            appName: app.name,
            latestVersion,
            currentAppVersion,
            comparison,
            shouldUpdate: comparison > 0
          });
          
          // Правильное сравнение версий: обновление доступно, если версия в AppStore больше текущей
          return comparison > 0;
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
        const fileAttachment = values.attachment[0];
        if (fileAttachment && fileAttachment.source) {
          console.log('Adding file to FormData:', fileAttachment);
          formData.append('attachment', fileAttachment.source);
      } else {
          console.log('File attachment is invalid:', fileAttachment);
        }
      } else {
        console.log('No file to add to FormData, attachment:', values.attachment);
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
   setHeader({
      title: `Админ панель DNS Radio`,
      subtitle: hasFullAccess 
        ? 'Управление радио потоками и устройствами' 
        : 'Просмотр устройств вашего филиала'
    });

    return () => clearHeader();
  }, [setHeader, clearHeader, hasFullAccess, hasReadOnlyAccess, workingTimeSettings]);

  // Периодическое обновление статусов устройств
  useEffect(() => {
    if (branchesWithDevices.length === 0) return;

    // Обновляем статусы сразу
    loadDeviceStatuses();

    // Устанавливаем интервал для периодического обновления (каждые 30 секунд)
    const interval = setInterval(() => {
      loadDeviceStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [branchesWithDevices.length, loadDeviceStatuses]);

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
            // Время устройства получено, но не сохраняем в состояние
          }
        } catch (error) {
          console.error('Error parsing device time:', error);
        }
      }
    } catch (error: any) {
      console.error('Error loading device time:', error);
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
    
    // Для веб-плеера не загружаем дополнительную информацию
    if (device.vendor === 'Web Browser') {
      return;
    }
    
    await loadDeviceStatus(device.id);
    await loadDeviceTime(device.id);
    await loadDeviceAppVersion(device.id);
    // Проверяем обновления для устройства
    await checkDeviceUpdate(device);
  }, [API_BASE, checkDeviceUpdate, loadDeviceAppVersion, loadDeviceStatus, loadDeviceTime]);



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
      
      if (!file || !file.name) {
        return false;
      }
      
      // Проверяем размер файла (максимум 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        console.warn(`File ${file.name} is too large: ${file.size} bytes (max: ${maxSize})`);
        return false;
      }
      
      // Проверяем тип файла (только MP3)
      const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mpeg3'];
      const fileExtension = file.name.toLowerCase().split('.').pop();
      if (!allowedTypes.includes(file.type) && fileExtension !== 'mp3') {
        console.warn(`File ${file.name} has unsupported type: ${file.type}`);
        return false;
      }
      
      return true;
    });
    console.log('Valid files to upload:', validFiles.length);

    // Показываем информацию о фильтрации файлов
    const filteredCount = extractedFiles.length - validFiles.length;
    if (filteredCount > 0) {
      notificationSystem.addNotification(
        'Информация', 
        `${filteredCount} файлов отфильтровано (неподдерживаемый формат или слишком большой размер)`, 
        'info'
      );
    }

    if (validFiles.length === 0) {
      console.log('No valid files to upload');
      notificationSystem.addNotification('Ошибка', 'Нет валидных файлов для загрузки', 'error');
      return;
    }

    console.log('Uploading files:', validFiles);
    console.log('API_BASE:', API_BASE);
    
    // Определяем эндпоинт для загрузки
    let uploadEndpoint: string;
    if (selectedUploadFolder) {
      // Загрузка в конкретную папку
      uploadEndpoint = `${API_BASE}/folder/${selectedUploadFolder}/upload`;
    } else {
      // Старая логика для обратной совместимости
      uploadEndpoint = musicStatus?.shouldWarn 
        ? `${API_BASE}/upload/next` 
        : `${API_BASE}/upload`;
    }

    setIsUploading(true);
      setUploadProgress(0);

    try {
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Загружаем файлы пакетами по 5 файлов для снижения нагрузки на сервер
      const batchSize = 5;
      const totalBatches = Math.ceil(validFiles.length / batchSize);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min(startIndex + batchSize, validFiles.length);
        const batchFiles = validFiles.slice(startIndex, endIndex);
        
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (files ${startIndex + 1}-${endIndex})`);
        
        // Загружаем файлы в пакете последовательно
        for (let i = 0; i < batchFiles.length; i++) {
          const file = batchFiles[i];
          const globalIndex = startIndex + i;

          try {
        const formData = new FormData();
        formData.append('music', file);

            console.log(`Sending file ${globalIndex + 1}/${validFiles.length}:`, file.name, 'to:', uploadEndpoint);

        const response = await axios.post(uploadEndpoint, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
              timeout: 30000, // 30 секунд таймаут
              maxContentLength: 100 * 1024 * 1024, // 100MB максимум
              maxBodyLength: 100 * 1024 * 1024 // 100MB максимум
        });
        
        console.log('Upload response:', response.data);
            
            if (response.data && response.data.success) {
              successCount++;
            } else {
              errorCount++;
              errors.push(`${file.name}: ${response.data?.message || 'Неизвестная ошибка'}`);
            }
            
          } catch (fileError: any) {
            errorCount++;
            console.error(`Error uploading file ${file.name}:`, fileError);
            
            if (fileError.response) {
              // Сервер ответил с ошибкой
              const errorMessage = fileError.response.data?.message || 
                                  fileError.response.data?.error || 
                                  `HTTP ${fileError.response.status}: ${fileError.response.statusText}`;
              errors.push(`${file.name}: ${errorMessage}`);
            } else if (fileError.request) {
              // Запрос был отправлен, но ответа не получено
              errors.push(`${file.name}: Нет ответа от сервера`);
            } else {
              // Ошибка при настройке запроса
              errors.push(`${file.name}: ${fileError.message}`);
            }
          }
        
        // Обновляем прогресс
          setUploadProgress(Math.round(((globalIndex + 1) / validFiles.length) * 100));
        
        // Небольшая задержка между загрузками для стабильности
          if (globalIndex < validFiles.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Задержка между пакетами
        if (batchIndex < totalBatches - 1) {
          console.log(`Waiting before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Показываем результат загрузки
      if (successCount > 0 && errorCount === 0) {
        notificationSystem.addNotification('Успех', `Все ${successCount} файлов загружены успешно`, 'success');
      setSelectedFiles([]);
      setUploadModalOpen(false);
      setSelectedUploadFolder(null);
      setTimeout(() => {
        loadData();
        if (activeTab === 'music' && musicStatus) {
          loadMusicFiles();
        }
      }, 1000);
      } else if (successCount > 0 && errorCount > 0) {
        notificationSystem.addNotification(
          'Частичный успех', 
          `Загружено ${successCount} из ${validFiles.length} файлов. Ошибок: ${errorCount}`, 
          'warning'
        );
        console.error('Upload errors:', errors);
        setTimeout(() => {
          loadData();
          if (activeTab === 'music' && musicStatus) {
            loadMusicFiles();
          }
        }, 1000);
      } else {
        notificationSystem.addNotification('Ошибка', `Не удалось загрузить ни одного файла. Ошибок: ${errorCount}`, 'error');
        console.error('All uploads failed:', errors);
      }

    } catch (err: any) {
      console.error('Critical error during upload process:', err);
      notificationSystem.addNotification('Критическая ошибка', 'Произошла критическая ошибка при загрузке файлов', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Не сбрасываем selectedUploadFolder здесь, так как это делается при закрытии модального окна
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
      <Box className="radio-container">
        <Stack gap="md">
          {/* Навигация без внутренней шапки */}
          <Paper 
            className="radio-navigation" 
            p="md" 
            radius="lg" 
            shadow="sm"
            style={{
              background: 'var(--theme-bg-elevated)',
              
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            }}
          >
            {/* Показываем вкладки всем пользователям */}
              <Tabs 
                value={activeTab}
                onChange={(value) => setActiveTab(value || "devices")}
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
                  leftSection={<IconMusic size={20} />}
                  className="radio-tab-item"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 'var(--font-weight-medium)',
                    transition: 'var(--transition-all)',
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--font-size-sm)'
                  }}
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
                  leftSection={<IconRadio size={20} />}
                  className="radio-tab-item"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 'var(--font-weight-medium)',
                    transition: 'var(--transition-all)',
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  Потоки
                  <Text span size="xs" c="dimmed" ml="xs">
                    ({radioStreams.length})
                  </Text>
                </Tabs.Tab>
                )}
                <Tabs.Tab 
                  value="devices" 
                  leftSection={<IconDeviceMobile size={20} />}
                  className="radio-tab-item"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 'var(--font-weight-medium)',
                    transition: 'var(--transition-all)',
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  Устройства
                  {stats && (
                    <Text span size="xs" c="dimmed" ml="xs">
                      ({currentBranchDevices.filter(device => statusMap[device.id]).length}/{currentBranchDevices.length})
                    </Text>
                  )}
                </Tabs.Tab>
                <Tabs.Tab 
                  value="webplayer" 
                  leftSection={<IconPlayerPlay size={20} />}
                  className="radio-tab-item"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    fontWeight: 'var(--font-weight-medium)',
                    transition: 'var(--transition-all)',
                    padding: 'var(--space-3) var(--space-4)',
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  Веб-плеер
                </Tabs.Tab>
              </Tabs.List>

              {/* Современный контент вкладок */}
              <Box 
                className="radio-content" 
                mt="md"
                p="md"
                style={{
                  background: 'var(--theme-bg-elevated)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--theme-shadow-sm)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Декоративная полоса сверху */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600), var(--color-primary-500))',
                  borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0'
                }} />



              {hasFullAccess && (
              <Tabs.Panel value="music">
              <Stack gap="md">
                {/* Список песен - текущий и следующий месяц */}
                <Group justify="space-between" mb="md" style={{ width: '100%' }}>
                  <Title order={4} c="var(--theme-text-primary)">
                    Список музыкальных файлов
                  </Title>
                  <Button
                    variant="subtle"
                    size="sm"
                    leftSection={<IconRefresh size={16} />}
                    onClick={loadMusicFiles}
                    loading={loadingMusicFiles}
                  >
                    Обновить
                  </Button>
                </Group>

                {loadingMusicFiles ? (
                  <Stack align="center" py="xl">
                    <LoadingOverlay visible={true} />
                    <Text size="sm" c="var(--theme-text-secondary)">
                      Загрузка списка песен...
                    </Text>
                  </Stack>
                ) : (
                  <>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    {/* Текущий месяц */}
                    <Paper 
                      p="md" 
                      radius="lg" 
                      shadow="sm"
                      style={{
                        background: 'var(--theme-bg-elevated)',
                        border: '1px solid var(--theme-border)'
                      }}
                    >
                      <Group justify="space-between" mb="md">
                        <div>
                          <Title order={5} c="var(--theme-text-primary)">
                            Текущий месяц
                          </Title>
                          <Text size="sm" c="var(--theme-text-secondary)" mt="xs">
                            {musicStatus && formatMonthFolder(musicStatus.currentMonthFolder || '')}
                          </Text>
                        </div>
                        <Group gap="xs">
                          <Badge variant="light" color="blue" size="lg">
                            {musicFilesCurrent.length}
                          </Badge>
                          {musicFilesCurrent.length > 0 && (
                            <Button
                              variant="light"
                              size="sm"
                              color="red"
                              leftSection={<IconTrash size={16} />}
                              onClick={async () => {
                                if (confirm(`Удалить все файлы из папки "${formatMonthFolder(musicStatus?.currentMonthFolder || '')}"?`)) {
                                  try {
                                    const response = await axios.delete(`${API_BASE}/folder/${musicStatus?.currentMonthFolder}`);
                                    if (response.data.success) {
                                      notificationSystem.addNotification('Успешно', 'Все файлы удалены', 'success');
                                      loadMusicFiles();
                                    }
                                  } catch (error: any) {
                                    notificationSystem.addNotification('Ошибка', error.response?.data?.error || 'Не удалось удалить файлы', 'error');
                                  }
                                }
                              }}
                            >
                              Удалить все
                            </Button>
                          )}
                          <Button
                            variant="light"
                            size="sm"
                            leftSection={<IconUpload size={16} />}
                            onClick={() => {
                              setSelectedUploadFolder(musicStatus?.currentMonthFolder || null);
                              setUploadModalOpen(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                              color: 'white',
                              border: 'none'
                            }}
                          >
                            {musicFilesCurrent.length > 0 ? 'Догрузить' : 'Загрузить'}
                          </Button>
                        </Group>
                      </Group>

                      {musicFilesCurrent.length > 0 ? (
                        <Stack gap="sm">
                          {musicFilesCurrent.map((file, index) => {
                            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                            const createdDate = new Date(file.created).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                            
                            return (
                              <Paper
                                key={index}
                                p="sm"
                                radius="md"
                                style={{
                                  background: 'var(--theme-bg-primary)',
                                  border: '1px solid var(--theme-border)',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateX(4px)';
                                  e.currentTarget.style.boxShadow = 'var(--theme-shadow-sm)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateX(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <Group justify="space-between" align="center">
                                  <Group gap="md" style={{ flex: 1 }}>
                                    <div style={{
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: 'var(--radius-md)',
                                      background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <IconMusic size={20} color="white" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <Text 
                                        fw={500} 
                                        size="sm" 
                                        c="var(--theme-text-primary)"
                                        style={{
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {decodeRussianFileName(file.name)}
                                      </Text>
                                      <Group gap="md" mt={4}>
                                        <Text size="xs" c="var(--theme-text-secondary)">
                                          {fileSizeMB} МБ
                                        </Text>
                                        <Text size="xs" c="var(--theme-text-tertiary)">
                                          {createdDate}
                                        </Text>
                                      </Group>
                                    </div>
                                  </Group>
                                  <Group gap="xs">
                                    <Badge variant="light" color="blue" size="sm">
                                      {file.name.split('.').pop()?.toUpperCase()}
                                    </Badge>
                                    <ActionIcon
                                      variant="light"
                                      color="red"
                                      size="sm"
                                      onClick={async () => {
                                        if (confirm(`Удалить файл "${decodeRussianFileName(file.name)}"?`)) {
                                          try {
                                            const response = await axios.delete(`${API_BASE}/folder/${musicStatus?.currentMonthFolder}/file/${encodeURIComponent(file.name)}`);
                                            if (response.data.success) {
                                              notificationSystem.addNotification('Успешно', 'Файл удален', 'success');
                                              loadMusicFiles();
                                            }
                                          } catch (error: any) {
                                            notificationSystem.addNotification('Ошибка', error.response?.data?.error || 'Не удалось удалить файл', 'error');
                                          }
                                        }
                                      }}
                                    >
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Group>
                                </Group>
                              </Paper>
                            );
                          })}
                        </Stack>
                      ) : (
                        <Stack align="center" py="xl">
                          <IconMusic size={32} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.5 }} />
                          <Text size="sm" c="var(--theme-text-secondary)" ta="center">
                            Нет файлов
                          </Text>
                        </Stack>
                      )}
                    </Paper>

                    {/* Следующий месяц */}
                    <Paper 
                      p="md" 
                      radius="lg" 
                      shadow="sm"
                      style={{
                        background: 'var(--theme-bg-elevated)',
                        border: '1px solid var(--theme-border)'
                      }}
                    >
                      <Group justify="space-between" mb="md">
                        <div>
                          <Title order={5} c="var(--theme-text-primary)">
                            Следующий месяц
                          </Title>
                          <Text size="sm" c="var(--theme-text-secondary)" mt="xs">
                            {musicStatus && formatMonthFolder(musicStatus.nextMonthFolder || '')}
                          </Text>
                        </div>
                        <Group gap="xs">
                          <Badge variant="light" color={musicFilesNext.length > 0 ? 'green' : 'gray'} size="lg">
                            {musicFilesNext.length}
                          </Badge>
                          {musicFilesNext.length > 0 && (
                            <Button
                              variant="light"
                              size="sm"
                              color="red"
                              leftSection={<IconTrash size={16} />}
                              onClick={async () => {
                                if (confirm(`Удалить все файлы из папки "${formatMonthFolder(musicStatus?.nextMonthFolder || '')}"?`)) {
                                  try {
                                    const response = await axios.delete(`${API_BASE}/folder/${musicStatus?.nextMonthFolder}`);
                                    if (response.data.success) {
                                      notificationSystem.addNotification('Успешно', 'Все файлы удалены', 'success');
                                      loadMusicFiles();
                                    }
                                  } catch (error: any) {
                                    notificationSystem.addNotification('Ошибка', error.response?.data?.error || 'Не удалось удалить файлы', 'error');
                                  }
                                }
                              }}
                            >
                              Удалить все
                            </Button>
                          )}
                          <Button
                            variant="light"
                            size="sm"
                            leftSection={<IconUpload size={16} />}
                            onClick={() => {
                              setSelectedUploadFolder(musicStatus?.nextMonthFolder || null);
                              setUploadModalOpen(true);
                            }}
                            style={{
                              background: musicFilesNext.length > 0 
                                ? 'linear-gradient(135deg, #059669, #047857)' 
                                : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                              color: 'white',
                              border: 'none'
                            }}
                          >
                            {musicFilesNext.length > 0 ? 'Догрузить' : 'Загрузить'}
                          </Button>
                        </Group>
                      </Group>

                      {musicFilesNext.length > 0 ? (
                        <Stack gap="sm">
                          {musicFilesNext.map((file, index) => {
                            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                            const createdDate = new Date(file.created).toLocaleDateString('ru-RU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                            
                            return (
                              <Paper
                                key={index}
                                p="sm"
                                radius="md"
                                style={{
                                  background: 'var(--theme-bg-primary)',
                                  border: '1px solid var(--theme-border)',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateX(4px)';
                                  e.currentTarget.style.boxShadow = 'var(--theme-shadow-sm)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateX(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <Group justify="space-between" align="center">
                                  <Group gap="md" style={{ flex: 1 }}>
                                    <div style={{
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: 'var(--radius-md)',
                                      background: 'linear-gradient(135deg, var(--color-success), #059669)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <IconMusic size={20} color="white" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <Text 
                                        fw={500} 
                                        size="sm" 
                                        c="var(--theme-text-primary)"
                                        style={{
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {decodeRussianFileName(file.name)}
                                      </Text>
                                      <Group gap="md" mt={4}>
                                        <Text size="xs" c="var(--theme-text-secondary)">
                                          {fileSizeMB} МБ
                                        </Text>
                                        <Text size="xs" c="var(--theme-text-tertiary)">
                                          {createdDate}
                                        </Text>
                                      </Group>
                                    </div>
                                  </Group>
                                  <Group gap="xs">
                                    <Badge variant="light" color="green" size="sm">
                                      {file.name.split('.').pop()?.toUpperCase()}
                                    </Badge>
                                    <ActionIcon
                                      variant="light"
                                      color="red"
                                      size="sm"
                                      onClick={async () => {
                                        if (confirm(`Удалить файл "${decodeRussianFileName(file.name)}"?`)) {
                                          try {
                                            const response = await axios.delete(`${API_BASE}/folder/${musicStatus?.nextMonthFolder}/file/${encodeURIComponent(file.name)}`);
                                            if (response.data.success) {
                                              notificationSystem.addNotification('Успешно', 'Файл удален', 'success');
                                              loadMusicFiles();
                                            }
                                          } catch (error: any) {
                                            notificationSystem.addNotification('Ошибка', error.response?.data?.error || 'Не удалось удалить файл', 'error');
                                          }
                                        }
                                      }}
                                    >
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Group>
                                </Group>
                              </Paper>
                            );
                          })}
                        </Stack>
                      ) : (
                        <Stack align="center" py="xl">
                          <IconMusic size={32} style={{ color: 'var(--theme-text-tertiary)', opacity: 0.5 }} />
                          <Text size="sm" c="var(--theme-text-secondary)" ta="center">
                            Нет файлов
                          </Text>
                          <Text size="xs" c="var(--theme-text-tertiary)" ta="center" mt="xs">
                            Файлы для следующего месяца появятся здесь
                          </Text>
                        </Stack>
                      )}
                    </Paper>
                  </SimpleGrid>

                  {/* Папки прошлых месяцев для удаления */}
                  {pastMonthFolders && pastMonthFolders.length > 0 && (
                    <Paper 
                      p="md" 
                      radius="lg" 
                      shadow="sm"
                      mt="md"
                      style={{
                        background: 'var(--theme-bg-elevated)',
                        border: '1px solid var(--theme-border)'
                      }}
                    >
                      <Group justify="space-between" mb="md">
                        <div>
                          <Title order={5} c="var(--theme-text-primary)">
                            Прошлые месяцы
                          </Title>
                          <Text size="sm" c="var(--theme-text-secondary)" mt="xs">
                            Удаление музыки за прошлые месяцы
                          </Text>
                        </div>
                      </Group>

                      {loadingPastFolders ? (
                        <Stack align="center" py="xl">
                          <Loader size="sm" />
                          <Text size="sm" c="var(--theme-text-secondary)">
                            Загрузка папок...
                          </Text>
                        </Stack>
                      ) : (
                        <Stack gap="sm">
                          {pastMonthFolders.map((folder) => (
                            <Paper
                              key={folder.name}
                              p="sm"
                              radius="md"
                              style={{
                                background: 'var(--theme-bg-primary)',
                                border: '1px solid var(--theme-border)'
                              }}
                            >
                              <Group justify="space-between" align="center">
                                <Group gap="md">
                                  <IconMusic size={20} color="var(--theme-text-tertiary)" />
                                  <div>
                                    <Text fw={500} size="sm" c="var(--theme-text-primary)">
                                      {formatMonthFolder(folder.name)}
                                    </Text>
                                    <Text size="xs" c="var(--theme-text-tertiary)">
                                      Папка: {folder.name}
                                    </Text>
                                  </div>
                                </Group>
                                <Button
                                  variant="light"
                                  color="red"
                                  size="sm"
                                  leftSection={<IconTrash size={16} />}
                                  onClick={async () => {
                                    if (confirm(`Удалить всю папку "${formatMonthFolder(folder.name)}" (${folder.name})?`)) {
                                      try {
                                        const response = await axios.delete(`${API_BASE}/folder/${folder.name}`);
                                        if (response.data.success) {
                                          notificationSystem.addNotification('Успешно', 'Папка удалена', 'success');
                                          loadPastMonthFolders();
                                        }
                                      } catch (error: any) {
                                        notificationSystem.addNotification('Ошибка', error.response?.data?.error || 'Не удалось удалить папку', 'error');
                                      }
                                    }
                                  }}
                                >
                                  Удалить папку
                                </Button>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      )}
                    </Paper>
                  )}
                  </>
                )}
              </Stack>
              </Tabs.Panel>
              )}

              {hasFullAccess && (
              <Tabs.Panel value="streams">
              <Stack gap="md">
                {/* Заголовок и статистика */}
                <Group justify="space-between" mb="md">
                  <div>
                  <Title 
                    order={3} 
                    size="h4"
                    style={{ 
                      color: 'var(--theme-text-primary)',
                        fontWeight: 'var(--font-weight-bold)',
                        fontSize: 'var(--font-size-xl)',
                        marginBottom: 'var(--space-2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)'
                      }}
                    >
                      <IconRadio size={24} />
                    Радио потоки
                    </Title>
                    <Group gap="md" mt="xs">
                      <Badge size="lg" variant="light" color="blue">
                        Всего: {streamsStats.total}
                      </Badge>
                      <Badge size="lg" variant="light" color="green">
                        Активных: {streamsStats.active}
                      </Badge>
                      {streamsStats.filtered !== streamsStats.total && (
                        <Badge size="lg" variant="light" color="gray">
                          Найдено: {streamsStats.filtered}
                        </Badge>
                      )}
                    </Group>
                  </div>
                  <Button 
                    onClick={handleCreateStream}
                    leftSection={<IconPlus size={20} />}
                    className="radio-action-button"
                    size="lg"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                      border: 'none',
                      fontWeight: 'var(--font-weight-semibold)',
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: 'var(--theme-shadow-md)',
                      transition: 'var(--transition-all)'
                    }}
                  >
                    Добавить поток
                  </Button>
                </Group>

                {/* Поиск и фильтры */}
                <Paper 
                  p="md" 
                  radius="lg" 
                  shadow="sm"
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border)'
                  }}
                >
                  <Group gap="md" align="flex-end">
                    <TextInput
                      placeholder="Поиск по названию или типу филиала..."
                      leftSection={<IconSearch size={16} />}
                      value={streamSearchQuery}
                      onChange={(e) => setStreamSearchQuery(e.target.value)}
                      style={{ flex: 1 }}
                      size="md"
                    />
                    <Select
                      placeholder="Статус"
                      leftSection={<IconFilter size={16} />}
                      value={streamFilterActive}
                      onChange={(value) => setStreamFilterActive(value || 'all')}
                      data={[
                        { value: 'all', label: 'Все потоки' },
                        { value: 'active', label: 'Только активные' },
                        { value: 'inactive', label: 'Только неактивные' }
                      ]}
                      size="md"
                      style={{ width: 200 }}
                    />
                    <Select
                      placeholder="Тип филиала"
                      leftSection={<IconBuilding size={16} />}
                      value={streamFilterType}
                      onChange={(value) => setStreamFilterType(value || 'all')}
                      data={[
                        { value: 'all', label: 'Все типы' },
                        ...uniqueBranchTypes.map(type => ({ value: type, label: type }))
                      ]}
                      size="md"
                      style={{ width: 200 }}
                    />
                    {(streamSearchQuery || streamFilterActive !== 'all' || streamFilterType !== 'all') && (
                      <Button
                        variant="subtle"
                        size="md"
                        onClick={() => {
                          setStreamSearchQuery('');
                          setStreamFilterActive('all');
                          setStreamFilterType('all');
                        }}
                      >
                        Сбросить
                      </Button>
                    )}
                  </Group>
                </Paper>
                
                {Object.keys(streamsByType).length > 0 ? (
                  <Stack gap="xl">
                    {Object.entries(streamsByType).map(([type, streams]) => (
                      <div key={type}>
                        {/* Заголовок типа филиала */}
                        <Group justify="space-between" align="center" mb="md">
                          <div>
                            <Title order={3} size="h4" style={{ color: 'var(--theme-text-primary)' }}>
                              {type}
                            </Title>
                            <Text size="sm" c="dimmed">
                              {streams.length} поток{streams.length === 1 ? '' : streams.length < 5 ? 'а' : 'ов'}
                            </Text>
                          </div>
                                <Badge 
                            size="lg" 
                            variant="light" 
                            color={streams.some(s => s.isActive) ? 'green' : 'gray'}
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              fontWeight: 'var(--font-weight-medium)'
                            }}
                          >
                            {streams.filter(s => s.isActive).length} активн{streams.filter(s => s.isActive).length === 1 ? 'ый' : streams.filter(s => s.isActive).length < 5 ? 'ых' : 'ых'}
                                </Badge>
                                  </Group>
                              
                        {/* Потоки этого типа */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                          gap: 'var(--space-4)'
                        }}>
                          {streams.map((stream) => (
                      <Paper 
                        key={stream.id} 
                        p="md" 
                        radius="lg" 
                        shadow="sm"
                        className="radio-stream-card"
                        style={{
                          background: 'var(--theme-bg-elevated)',
                          border: '1px solid var(--theme-border)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'var(--transition-all)'
                        }}
                      >
                        {/* Декоративная полоса */}
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: '3px',
                          background: stream.isActive 
                            ? 'linear-gradient(90deg, var(--color-success), #059669)'
                            : 'linear-gradient(90deg, var(--color-gray-500), var(--color-gray-600))',
                          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0'
                        }} />
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
                        
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <Stack gap="xs" style={{ flex: 1 }}>
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
                            <Text size="sm" c="dimmed">
                              Период: <Text span fw={500}>
                                {new Date(stream.startDate).toLocaleDateString('ru-RU')} - {
                                  stream.endDate 
                                    ? new Date(stream.endDate).toLocaleDateString('ru-RU')
                                    : 'бессрочная'
                                }
                              </Text>
                            </Text>
                            {stream.attachment && (
                              <Text size="sm" c="dimmed">
                                Файл: <Text span fw={500}>{decodeRussianFileName(stream.attachment)}</Text>
                              </Text>
                            )}
                              <Text size="xs" c="dimmed">
                              Создан: {new Date(stream.createdAt).toLocaleDateString('ru-RU')}
                                </Text>
                          </Stack>
                          
                          <Group justify="flex-end" mt="md" style={{ marginTop: 'auto' }}>
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
                        </div>
                      </Paper>
                          ))}
                        </div>
                      </div>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" py="xl">
                    Радио потоки не найдены. Создайте первый поток для начала работы.
                  </Text>
                )}
              </Stack>
              </Tabs.Panel>
              )}

              <Tabs.Panel value="devices">
              <Stack gap="md">
                {/* Статистика устройств */}
                {stats && (
                    <div style={{
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                    gap: 'var(--space-4)',
                    marginBottom: 'var(--space-4)'
                  }}>
                    <Paper 
                      p="md" 
                      radius="lg" 
                      shadow="sm"
                      className="radio-stats-card"
                      style={{
                        background: 'var(--theme-bg-elevated)',
                        border: '1px solid var(--theme-border)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'var(--transition-all)'
                      }}
                    >
                      {/* Декоративная полоса */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '3px',
                        background: 'linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))',
                        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0'
                      }} />
                      
                      <Group gap="lg">
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: 'var(--radius-lg)',
                          background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                      display: 'flex',
                      alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'var(--theme-shadow-md)'
                    }}>
                          <IconDeviceMobile size={28} color="white" />
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
                            {currentBranchDevices.length}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
                    
                    <Paper 
                      p="md" 
                      radius="lg" 
                      shadow="sm"
                      className="radio-stats-card"
                      style={{
                        background: 'var(--theme-bg-elevated)',
                        border: '1px solid var(--theme-border)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'var(--transition-all)'
                      }}
                    >
                      {/* Декоративная полоса */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '3px',
                        background: 'linear-gradient(90deg, var(--color-success), #059669)',
                        borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0'
                      }} />
                      
                      <Group gap="lg">
                        <div style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: 'var(--radius-lg)',
                          background: 'linear-gradient(135deg, var(--color-success), #059669)',
                      display: 'flex',
                      alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'var(--theme-shadow-md)'
                    }}>
                          <IconCheck size={28} color="white" />
                    </div>
                        <div>
                          <Text 
                            size="sm" 
                            fw={500}
                            style={{ 
                              color: 'var(--theme-text-secondary)',
                              marginBottom: 'var(--space-1)'
                            }}
                          >
                            Активных
                          </Text>
                          <Text 
                            size="xl" 
                            fw={700}
                            style={{ 
                              color: 'var(--theme-text-primary)',
                              fontSize: 'var(--font-size-xl)'
                            }}
                          >
                            {(() => {
                              const active = currentBranchDevices.filter(device => statusMap[device.id]).length;
                              // const total = currentBranchDevices.length;
                              // console.log('🔍 [Radio] Активные устройства:', active, 'из', total, 'total');
                              // console.log('🔍 [Radio] statusMap:', statusMap);
                              // console.log('🔍 [Radio] currentBranchDevices count:', currentBranchDevices.length);
                              return active;
                            })()}
                          </Text>
                    </div>
                  </Group>
                    </Paper>
              </div>
            )}

                {/* Фильтры устройств для полного доступа */}
                {hasFullAccess && (
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div style={{ flex: 1, minWidth: 300 }}>
                      <FilterGroup
                        title=""
                        filters={deviceFiltersConfig}
                        columnFilters={deviceColumnFilters}
                        onColumnFiltersChange={(columnId: string, value: any) => {
                          setDeviceColumnFilters(prev => {
                            const existing = prev.find(f => f.id === columnId);
                            if (existing) {
                              return prev.map(f => f.id === columnId ? { id: columnId, value } : f);
                            } else {
                              return [...prev, { id: columnId, value }];
                            }
                          });
                        }}
                        showClearAll={true}
                      />
                    </div>
                    <Button
                      variant="light"
                      color="orange"
                      size="md"
                      onClick={async () => {
                        // Получаем ID приложения Radio из AppStore
                        try {
                          const appsResponse = await axios.get(`${API}/retail/app-store`);
                          if (appsResponse.data.success && appsResponse.data.apps) {
                            // Ищем Radio APK приложение (не Tuner, только ANDROID_APK)
                            const radioApp = appsResponse.data.apps.find((app: App) => {
                              const nameLower = app.name.toLowerCase();
                              const isRadio = (nameLower.includes('radio') || nameLower.includes('радио')) && 
                                             !nameLower.includes('tuner') && 
                                             !nameLower.includes('тюнер');
                              return isRadio && app.appType === 'ANDROID_APK';
                            });
                            if (radioApp) {
                              setRadioAppId(radioApp.id);
                              setQrProvisionModalOpen(true);
                            } else {
                              notificationSystem.addNotification('Ошибка', 'Приложение Radio (APK) не найдено в AppStore', 'error');
                            }
                          } else {
                            notificationSystem.addNotification('Ошибка', 'Не удалось загрузить список приложений', 'error');
                          }
                        } catch (error: any) {
                          notificationSystem.addNotification('Ошибка', `Ошибка загрузки приложений: ${error?.message || error}`, 'error');
                        }
                      }}
                      leftSection={<IconQrcode size={18} />}
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: '600',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      QR Provision
                    </Button>
                  </Group>
                )}

                {/* Устройства по филиалам */}
              <Stack gap="md">
                {hasFullAccess ? (
                  <>
                    {/* Кнопки управления раскрытием, если филиалов больше одного */}
                    {branchesWithDevices.length > 1 && (
                      <Group justify="flex-end" mb="sm">
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconChevronsDown size={14} />}
                          onClick={expandAllBranches}
                          style={{
                            color: 'var(--theme-text-secondary)',
                            fontSize: 'var(--font-size-xs)'
                          }}
                        >
                          Развернуть все
                        </Button>
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconChevronsUp size={14} />}
                          onClick={collapseAllBranches}
                          style={{
                            color: 'var(--theme-text-secondary)',
                            fontSize: 'var(--font-size-xs)'
                          }}
                        >
                          Свернуть все
                        </Button>
                      </Group>
                    )}
                    
                    {/* Полный доступ - видим все филиалы с дедупликацией устройств */}
                    {branchesWithDevices
                      .sort((a, b) => {
                        // Собственный филиал пользователя всегда вверху
                        if (user && a.branch.name === user.branch) return -1;
                        if (user && b.branch.name === user.branch) return 1;
                        // Остальные филиалы сортируем по алфавиту
                        return a.branch.name.localeCompare(b.branch.name);
                      })
                      .filter((branchData) => {
                        // Показываем только филиалы, у которых есть отфильтрованные устройства
                        const branchFilteredDevices = filteredDevices.filter(device => 
                          device.branchId === branchData.branch.uuid
                        );
                        return branchFilteredDevices.length > 0;
                      })
                      .map((branchData) => {
                        // Получаем отфильтрованные устройства для этого филиала
                        const branchFilteredDevices = filteredDevices.filter(device => 
                          device.branchId === branchData.branch.uuid
                        );
                        
                        // Дедупликация устройств в филиале
                        const uniqueDevices = branchFilteredDevices.filter((device, index, self) => 
                          index === self.findIndex(d => d.id === device.id)
                        );
                        
                        return (
                    <Paper 
                      key={branchData.branch.uuid} 
                      p="md" 
                      withBorder 
                      className="radio-device-card"
                      style={{
                        // Выделяем собственный филиал пользователя
                        borderColor: user && branchData.branch.name === user.branch 
                          ? 'var(--color-primary-500)' 
                          : 'var(--theme-border)',
                        borderWidth: user && branchData.branch.name === user.branch ? '2px' : '1px'
                      }}
                    >
                    <Group justify="space-between" mb="md">
                      <div style={{ flex: 1 }}>
                        <Group gap="xs" align="center">
                          {branchesWithDevices.length > 1 && (
                            <Button
                              variant="subtle"
                              size="xs"
                              p={4}
                              onClick={() => toggleBranchExpansion(branchData.branch.uuid)}
                              style={{
                                color: 'var(--theme-text-secondary)',
                                minWidth: 'auto',
                                height: 'auto'
                              }}
                            >
                              {expandedBranches.has(branchData.branch.uuid) ? 
                                <IconChevronDown size={16} /> : 
                                <IconChevronRight size={16} />
                              }
                            </Button>
                          )}
                          <div>
                            <Group gap="xs" align="center">
                              <Title order={4} size="h5">{branchData.branch.name}</Title>
                              {user && branchData.branch.name === user.branch && (
                                <Badge size="xs" color="blue" variant="light">
                                  Ваш филиал
                                </Badge>
                              )}
                            </Group>
                            <Text size="sm" c="dimmed">{branchData.branch.typeOfDist}</Text>
                          </div>
                        </Group>
                      </div>
                      <div style={{
                        padding: '6px 12px',
                          backgroundColor: 'var(--color-primary-500)',
                        borderRadius: '20px',
                          color: 'white',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {uniqueDevices.length} устройств
                      </div>
                    </Group>

                    {/* Устройства показываются только если филиал развернут или филиал один */}
                    {(branchesWithDevices.length === 1 || expandedBranches.has(branchData.branch.uuid)) && (
                      <Stack gap="sm">
                        {uniqueDevices.map((device) => {
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
                              {device.user && (
                                  <Text size="xs" style={{ 
                                    color: 'var(--theme-text-tertiary)', 
                                    fontStyle: 'italic',
                                    marginTop: '2px'
                                  }}>
                                    👤 {device.user.name || device.user.login}
                                  </Text>
                                )}
                              </div>
                              
                              <Group gap="xs">
                                <Badge 
                                  size="sm" 
                                  color={online ? 'green' : 'gray'} 
                                  variant="filled"
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: '500'
                                  }}
                                >
                                  {online ? 'Онлайн' : 'Оффлайн'}
                                </Badge>
                                
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
                    )}
                    </Paper>
                        );
                      })}

                    {/* Сообщение, если нет устройств после фильтрации */}
                    {branchesWithDevices.length > 0 && filteredDevices.length === 0 && (
                      <Paper p="xl" withBorder>
                        <Stack align="center" gap="md">
                          <IconDeviceMobile size={64} color="var(--mantine-color-gray-4)" />
                          <Text size="lg" c="dimmed">
                            Устройства не найдены
                          </Text>
                          <Text size="sm" c="dimmed" ta="center">
                            Измените фильтры или попробуйте другой поиск
                          </Text>
                          <Button 
                            variant="light" 
                            onClick={clearDeviceFilters}
                          >
                            Очистить фильтры
                          </Button>
                      </Stack>
                      </Paper>
                    )}
                  </>
                ) : (
                  // Доступ только для чтения - видим только свой филиал
                  hasReadOnlyAccess && user && (
                    <Paper p="md" withBorder className="radio-device-card">
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
                                {device.user && (
                                  <Text size="xs" style={{ 
                                    color: 'var(--theme-text-tertiary)', 
                                    fontStyle: 'italic',
                                    marginTop: '2px'
                                  }}>
                                    👤 {device.user.name || device.user.login}
                                  </Text>
                                )}
                                </div>
                                
                                <Group gap="xs">
                                  <Badge 
                                    size="sm" 
                                    color={online ? 'green' : 'gray'} 
                                    variant="filled"
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: '500'
                                    }}
                                  >
                                    {online ? 'Онлайн' : 'Оффлайн'}
                                  </Badge>
                                  
                                  <Text size="xs" style={{ color: 'var(--theme-text-secondary)' }}>
                                    {formatTime(device.timeFrom)} - {formatTime(device.timeUntil)}
                                  </Text>
                                  
                                  <Group gap="xs">
                                    {/* Кнопка обновления статуса - только для не веб-плееров */}
                                    {device.vendor !== 'Web Browser' && (
                                      <Button
                                        size="xs"
                                        variant="subtle"
                                        color="blue"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          refreshDeviceStatus(device.id);
                                        }}
                                        title="Обновить статус"
                                      >
                                        <IconRefresh size={14} />
                                      </Button>
                                    )}
                                    
                                    {/* Кнопка удаления - только для оффлайн устройств */}
                                    {!online && (
                                      <Button
                                        size="xs"
                                        variant="subtle"
                                        color="red"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Вы уверены, что хотите удалить устройство "${device.name}"?`)) {
                                            deleteDevice(device.id);
                                          }
                                        }}
                                        title="Удалить устройство"
                                      >
                                        <IconTrash size={14} />
                                      </Button>
                                    )}
                                    
                                    <IconEdit size={16} style={{ color: 'var(--theme-text-secondary)' }} />
                                  </Group>
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

              <Tabs.Panel value="webplayer">
                <Stack gap="md">

                    <WebRadioPlayer
                      branchName={user?.branch || "Мой филиал"}
                      branchType={user?.branch || "Магазин"}
                      workingTime={workingTimeSettings}
                      onTimeChange={handleTimeChange}
                      isActive={activeTab === "webplayer"}
                    />
       
                </Stack>
              </Tabs.Panel>

              </Box>
            </Tabs>
          </Paper>

      </Stack>

      {/* Upload Modal using DynamicFormModal */}
      <DynamicFormModal
        opened={uploadModalOpen} 
        onClose={() => {
          setUploadModalOpen(false);
          setSelectedUploadFolder(null);
        }}
        title={selectedUploadFolder 
          ? `Загрузка музыкальных файлов - ${formatMonthFolder(selectedUploadFolder)}`
          : "Загрузка музыкальных файлов"
        }
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
              <Group justify="space-between" align="center" mb="md">
                <Text fw={600} size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                  📱 Информация об устройстве
                </Text>
                {selectedDevice?.user && (
                  <Text size="sm" c="dimmed" style={{ 
                    background: 'var(--theme-bg-secondary)', 
                    padding: '4px 8px', 
                    borderRadius: '6px',
                    border: '1px solid var(--theme-border)'
                  }}>
                    👤 {selectedDevice.user.name || selectedDevice.user.login}
                  </Text>
                )}
              </Group>
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
                    🌐 {selectedDevice.network}{selectedDevice.number}
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

            {/* Специальное сообщение для веб-плеера */}
            {selectedDevice.vendor === 'Web Browser' && (
              <Paper p="lg" withBorder style={{
                background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
                border: '1px solid var(--theme-border)',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                textAlign: 'center'
              }}>
                <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                  🌐 Веб-плеер
                </Text>
                <Text size="md" c="dimmed" mb="md">
                  Это веб-плеер DNS Radio. Все настройки и управление доступны в самой вкладке "Веб-плеер".
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  💡 Перейдите на вкладку "Веб-плеер" для управления воспроизведением и настройками
              </Text>
                            
                {/* Кнопка обновить статус для веб-плеера */}
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconRefresh size={14} />}
                  onClick={() => {
                    // Обновляем статус устройства
                    loadDeviceStatuses();
                    notificationSystem.addNotification('Обновлено', 'Статус веб-плеера обновлен', 'success');
                  }}
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border)',
                    color: 'var(--theme-text-primary)'
                  }}
                >
                  Обновить статус
                </Button>
              </Paper>
            )}


            {/* Playback Time Settings - только для обычных устройств */}
            {selectedDevice.vendor !== 'Web Browser' && (
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
            )}

            {/* App Update Section - только для обычных устройств */}
            {selectedDevice.vendor !== 'Web Browser' && (
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
            )}

            {/* Device Actions - только для обычных устройств */}
            {selectedDevice.vendor !== 'Web Browser' && (
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
            )}

            {/* QR Provision - только для обычных устройств */}
            {selectedDevice.vendor !== 'Web Browser' && (
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%)',
              border: '2px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)'
            }}>
              <Group justify="space-between" align="center" mb="md">
                <div>
                  <Text fw={600} size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                    📱 QR Provision для Device Owner
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Настройка устройства через QR-код после сброса к заводским настройкам
                  </Text>
                </div>
                <IconQrcode size={24} style={{ color: '#f59e0b' }} />
              </Group>
              <Button 
                fullWidth
                variant="light" 
                color="orange"
                size="lg"
                onClick={async () => {
                  // Получаем ID приложения Radio из AppStore
                  try {
                    const appsResponse = await axios.get(`${API}/retail/app-store`);
                    if (appsResponse.data.success && appsResponse.data.apps) {
                      // Ищем Radio APK приложение (не Tuner, только ANDROID_APK)
                      const radioApp = appsResponse.data.apps.find((app: App) => {
                        const nameLower = app.name.toLowerCase();
                        const isRadio = (nameLower.includes('radio') || nameLower.includes('радио')) && 
                                       !nameLower.includes('tuner') && 
                                       !nameLower.includes('тюнер');
                        return isRadio && app.appType === 'ANDROID_APK';
                      });
                      if (radioApp) {
                        setRadioAppId(radioApp.id);
                        setQrProvisionModalOpen(true);
                      } else {
                        notificationSystem.addNotification('Ошибка', 'Приложение Radio (APK) не найдено в AppStore', 'error');
                      }
                    } else {
                      notificationSystem.addNotification('Ошибка', 'Не удалось загрузить список приложений', 'error');
                    }
                  } catch (error: any) {
                    notificationSystem.addNotification('Ошибка', `Ошибка загрузки приложений: ${error?.message || error}`, 'error');
                  }
                }}
                leftSection={<IconQrcode size={20} />}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)',
                  transition: 'all 0.2s ease'
                }}
              >
                Открыть QR Provision
              </Button>
            </Paper>
            )}

            {/* Web Player Actions - только для веб-плеера */}
            {selectedDevice.vendor === 'Web Browser' && (
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                🌐 Действия веб-плеера
              </Text>
              <Group grow>
                <Button 
                  variant="light" 
                  color="green"
                  onClick={() => {
                    // Обновляем статус устройства
                    loadDeviceStatuses();
                    notificationSystem.addNotification('Обновлено', 'Статус веб-плеера обновлен', 'success');
                  }}
                  leftSection={<IconRefresh size={16} />}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  Обновить статус
                </Button>
                <Button 
                  variant="light" 
                  color="blue"
                  onClick={() => {
                    // Закрываем модальное окно и показываем подсказку
                    setDeviceModalOpen(false);
                    notificationSystem.addNotification('Подсказка', 'Перейдите на вкладку "Веб-плеер" для управления воспроизведением', 'info');
                  }}
                  leftSection={<IconPlayerPlay size={16} />}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: 'white'
                  }}
                >
                  Закрыть и перейти к плееру
                </Button>
              </Group>
            </Paper>
            )}
            
            {/* Device Actions - кнопки управления устройством */}
            <Paper p="lg" withBorder style={{
              background: 'linear-gradient(135deg, var(--theme-bg-elevated) 0%, var(--theme-bg-secondary) 100%)',
              border: '1px solid var(--theme-border)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <Text fw={600} mb="md" size="lg" style={{ color: 'var(--theme-text-primary)' }}>
                ⚙️ Действия с устройством
              </Text>
              <Group grow>
                {/* Кнопка обновления статуса - для всех устройств */}
                <Button 
                  variant="light" 
                  color="blue"
                  onClick={async () => {
                    if (selectedDevice) {
                      await refreshDeviceStatus(selectedDevice.id);
                      // Также обновляем статус в модалке если устройство не веб-плеер
                      if (selectedDevice.vendor !== 'Web Browser') {
                        await loadDeviceStatus(selectedDevice.id);
                      }
                    }
                  }}
                  leftSection={<IconRefresh size={16} />}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    border: 'none',
                    color: 'white',
                    fontWeight: '500'
                  }}
                >
                  Обновить статус
                </Button>
                
                {/* Кнопка удаления - только для оффлайн устройств */}
                {selectedDevice && !statusMap[selectedDevice.id] && (
                  <Button 
                    variant="light" 
                    color="red"
                    onClick={async () => {
                      if (selectedDevice && confirm('Вы уверены, что хотите удалить это устройство?')) {
                        await deleteDevice(selectedDevice.id);
                        setDeviceModalOpen(false);
                      }
                    }}
                    leftSection={<IconTrash size={16} />}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      border: 'none',
                      color: 'white',
                      fontWeight: '500'
                    }}
                  >
                    Удалить устройство
                  </Button>
                )}
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
        fields={streamModalMode === 'edit' ? streamEditFields : streamCreateFields}
        initialValues={selectedStream ? {
          ...selectedStream
        } : {
          name: '',
          branchTypeOfDist: '',
          frequencySongs: 5,
          volumeLevel: 80,
          fadeInDuration: 2,
          startDate: new Date().toISOString().split('T')[0],
          endDate: '',
          isActive: true,
          attachment: []
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

      {/* QR Provision Modal */}
      <QrProvisionModal
        isOpen={qrProvisionModalOpen}
        onClose={() => setQrProvisionModalOpen(false)}
        deviceId={selectedDevice?.id || null}
        deviceName={selectedDevice?.name}
        appId={radioAppId || undefined}
      />

    </Box>
    </DndProviderWrapper>
  );
};

export default RadioAdmin;