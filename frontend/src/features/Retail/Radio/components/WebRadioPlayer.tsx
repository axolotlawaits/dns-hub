import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Paper, 
  Group, 
  Button, 
  Text, 
  Stack, 
  Progress,
  Box,
  TextInput,
  Select,
  Checkbox,
  Divider
} from '@mantine/core';
import { 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconClock,
  IconWifi, 
  IconWifiOff,
  IconBug,
  IconPlayerSkipForward,
  IconSettings
} from '@tabler/icons-react';
import { CustomModal } from '../../../../utils/CustomModal';
import { API } from '../../../../config/constants';
import { useUserContext } from '../../../../hooks/useUserContext';
import { useAccessContext } from '../../../../hooks/useAccessContext';
import './WebRadioPlayer.css';

interface WebRadioPlayerProps {
  className?: string;
  branchName?: string;
  branchType?: string;
  workingTime?: {
    start: string;
    end: string;
  };
  onTimeChange?: (newTime: { start: string; end: string }) => void;
  isActive?: boolean; // Новый пропс для контроля активности вкладки
}

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

interface MusicTrack {
  id: string;
  fileName: string;
  filePath?: string;
  url: string;
  duration?: number;
  index: number;
}

type PlaybackState = 'stopped' | 'playing' | 'paused' | 'loading' | 'error';
type DownloadState = 'idle' | 'downloading' | 'complete' | 'error';

// Константы для конфигурации плеера
const PLAYER_CONSTANTS = {
  STREAM_FREQUENCY: 3, // Каждые 3 трека вставляется поток
  MONITOR_INTERVAL: 5000, // Интервал мониторинга (мс)
  WORKING_TIME_CHECK_INTERVAL: 60000, // Проверка рабочего времени (мс)
  INTERNET_CHECK_INTERVAL: 10000, // Проверка интернета (мс)
  HEARTBEAT_INTERVAL: 30000, // Интервал heartbeat (мс)
  MAX_RETRY_CHECKS: 10, // Максимум попыток проверки недоступного контента
  RETRY_CHECK_INTERVAL: 2000, // Интервал проверки недоступного контента (мс)
  STALLED_TIMEOUT: 5000, // Таймаут для stalled события (мс)
  WAITING_TIMEOUT: 3000, // Таймаут для waiting события (мс)
  PLAYBACK_CHECK_INTERVAL: 1000, // Интервал проверки воспроизведения (мс)
  METADATA_LOAD_TIMEOUT: 10000, // Таймаут загрузки метаданных (мс)
  VERSION: '1.2.2'
} as const;

const WebRadioPlayer: React.FC<WebRadioPlayerProps> = ({ 
  className, 
  branchName = "Мой филиал", 
  branchType = "Магазин",
  workingTime = { start: "08:00", end: "22:00" },
  onTimeChange,
  isActive = true
}) => {
  const { user } = useUserContext();
  const { access } = useAccessContext();
  
  // Состояние для IP пользователя
  const [userIP, setUserIP] = useState<string>('localhost');
  
  // Проверяем доступ к Radio инструменту
  const hasRadioFullAccess = useMemo(() => {
    if (!user || !access) return false;
    
    // Проверяем роль пользователя
    if (['DEVELOPER', 'ADMIN'].includes(user.role)) {
      return true;
    }
    
    // Проверяем доступ через groups
    const radioAccess = access.find(tool => 
      tool.link === 'retail/radio' || tool.link === '/retail/radio'
    );
    
    // Проверяем, что доступ FULL
    return radioAccess?.accessLevel === 'FULL';
  }, [user, access]);
  
  // Состояние для модального окна смены времени
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [tempTimeStart, setTempTimeStart] = useState(workingTime.start);
  const [tempTimeEnd, setTempTimeEnd] = useState(workingTime.end);

  // Состояние для модального окна выбора типа филиала
  const [branchTypeModalOpen, setBranchTypeModalOpen] = useState(false);
  
  // Получаем сохраненный тип филиала из localStorage
  const getStoredBranchType = useCallback(() => {
    if (!user?.email) return branchType;
    try {
      const stored = localStorage.getItem(`web-radio-player-branch-type-${user.email}`);
      return stored || branchType;
    } catch {
      return branchType;
    }
  }, [user?.email, branchType]);

  // Локальное состояние типа филиала
  const [localBranchType, setLocalBranchType] = useState<string>(getStoredBranchType());
  const [tempBranchType, setTempBranchType] = useState<string>(localBranchType);
  
  // Получаем список отключенных потоков из localStorage
  const getStoredDisabledStreams = useCallback(() => {
    if (!user?.email) return new Set<string>();
    try {
      const stored = localStorage.getItem(`web-radio-player-disabled-streams-${user.email}`);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed);
      }
    } catch (error) {
      console.warn('⚠️ [WebRadioPlayer] Ошибка чтения отключенных потоков из localStorage:', error);
    }
    return new Set<string>();
  }, [user?.email]);
  
  // Состояние для отключенных потоков
  const [disabledStreams, setDisabledStreams] = useState<Set<string>>(getStoredDisabledStreams());
  
  // Состояние для модального окна управления потоками
  const [streamsModalOpen, setStreamsModalOpen] = useState(false);
  
  // Временное состояние для модального окна (чтобы не применять изменения сразу)
  const [tempDisabledStreams, setTempDisabledStreams] = useState<Set<string>>(disabledStreams);
  
  // Функция для получения IP устройства в локальной сети
  const getUserIP = useCallback(async () => {
    try {
      // Используем WebRTC для получения локального IP
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      pc.createDataChannel('');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
          if (ipMatch && !ipMatch[1].startsWith('127.') && !ipMatch[1].startsWith('169.254.')) {
            setUserIP(ipMatch[1]);
            // console.log('🌐 [WebRadioPlayer] Получен локальный IP устройства:', ipMatch[1]);
            pc.close();
          }
        }
      };
      
      // Fallback через 3 секунды
      setTimeout(() => {
        if (userIP === 'localhost') {
          setUserIP(window.location.hostname);
          // console.log('⚠️ [WebRadioPlayer] Используем hostname как fallback:', window.location.hostname);
        }
        pc.close();
      }, 3000);
      
    } catch (error) {
      console.warn('⚠️ [WebRadioPlayer] Не удалось получить локальный IP:', error);
      // Fallback на hostname
      setUserIP(window.location.hostname);
    }
  }, [userIP]);

  // Функции для работы с модальным окном времени
  const openTimeModal = useCallback(() => {
    setTempTimeStart(workingTime.start);
    setTempTimeEnd(workingTime.end);
    setTimeModalOpen(true);
  }, [workingTime.start, workingTime.end]);

  const closeTimeModal = useCallback(() => {
    setTimeModalOpen(false);
  }, []);

  const saveTimeChanges = useCallback(() => {
    if (onTimeChange && tempTimeStart && tempTimeEnd) {
      onTimeChange({ start: tempTimeStart, end: tempTimeEnd });
      setTimeModalOpen(false);
    }
  }, [onTimeChange, tempTimeStart, tempTimeEnd]);

  // Функции для работы с модальным окном выбора типа филиала
  const openBranchTypeModal = useCallback(() => {
    setTempBranchType(localBranchType);
    setBranchTypeModalOpen(true);
  }, [localBranchType]);

  const closeBranchTypeModal = useCallback(() => {
    setBranchTypeModalOpen(false);
  }, []);

  const saveBranchTypeChanges = useCallback(async () => {
    if (!user?.id || !tempBranchType) return;

    try {
      // Требуется UUID филиала для PATCH /search/branch/:id/typeOfDist
      let branchUuid: string | null = (user as any)?.branchUuid || null;

      // Если UUID отсутствует или в user.branch явно не UUID — ищем по имени
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!branchUuid) {
        if (user.branch && uuidRegex.test(user.branch)) {
          branchUuid = user.branch;
        } else if (user.branch) {
          const query = encodeURIComponent(user.branch);
          const searchResp = await fetch(`${API}/search/branch?text=${query}&branchSearchType=name`);
          if (searchResp.ok) {
            const branches = await searchResp.json();
            const exact = Array.isArray(branches)
              ? branches.find((b: any) => b.name?.toLowerCase() === user.branch.toLowerCase())
              : null;
            branchUuid = exact?.uuid || branches?.[0]?.uuid || null;
          }
        }
      }

      if (!branchUuid) {
        console.error('Не удалось определить UUID филиала для обновления typeOfDist');
        return;
      }

      const response = await fetch(`${API}/search/branch/${branchUuid}/typeOfDist`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ typeOfDist: tempBranchType })
      });

      if (response.ok) {
        localStorage.setItem(`web-radio-player-branch-type-${user.email}`, tempBranchType);
        setLocalBranchType(tempBranchType);
        setBranchTypeModalOpen(false);
        setSongsPlayed(0);
        lastPlayedStreamIndexRef.current = -1;
        setLastTrackIndex(-1);
      } else {
        console.error('Ошибка обновления типа филиала в базе данных');
      }
    } catch (error) {
      console.error('Ошибка сохранения типа филиала:', error);
    }
  }, [user?.id, user?.branch, user?.email, tempBranchType]);
  
  // Функции для работы с модальным окном управления потоками
  const openStreamsModal = useCallback(() => {
    setTempDisabledStreams(new Set(disabledStreams));
    setStreamsModalOpen(true);
  }, [disabledStreams]);
  
  const closeStreamsModal = useCallback(() => {
    setStreamsModalOpen(false);
  }, []);
  
  const saveStreamsChanges = useCallback(() => {
    if (!user?.email) return;
    
    try {
      // Сохраняем в состояние
      setDisabledStreams(new Set(tempDisabledStreams));
      
      // Сохраняем в localStorage
      const streamsArray = Array.from(tempDisabledStreams);
      localStorage.setItem(
        `web-radio-player-disabled-streams-${user.email}`, 
        JSON.stringify(streamsArray)
      );
      
      setStreamsModalOpen(false);
      console.log('✅ [WebRadioPlayer] Настройки потоков сохранены:', streamsArray);
    } catch (error) {
      console.error('❌ [WebRadioPlayer] Ошибка сохранения настроек потоков:', error);
    }
  }, [user?.email, tempDisabledStreams]);
  
  // Состояние воспроизведения
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [downloadState] = useState<DownloadState>('idle');
  // Убрали пользовательскую регулировку громкости
  
  // Состояние контента
  const [currentStream, setCurrentStream] = useState<RadioStream | null>(null);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  // Отложенное отображение названия: устанавливаем только после старта воспроизведения
  const [pendingStream, setPendingStream] = useState<RadioStream | null>(null);
  const [pendingTrack, setPendingTrack] = useState<MusicTrack | null>(null);
  const [streams, setStreams] = useState<RadioStream[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [songsPlayed, setSongsPlayed] = useState(0);
  const [isPlayingStream, setIsPlayingStream] = useState(false);
  const lastPlayedStreamIndexRef = useRef<number>(-1);
  const [lastTrackIndex, setLastTrackIndex] = useState(-1);
  
  // Ключ для хранения индекса ротации в localStorage (чтобы переживать HMR/перезагрузки)
  const rotationStorageKey = useMemo(() => {
    const email = user?.email || 'unknown';
    const type = (localBranchType || 'default').toLowerCase();
    return `web-radio-last-stream-index-${email}-${type}`;
  }, [user?.email, localBranchType]);

  // Проверка активности потока по датам начала и окончания
  // Сравнение только по датам (год, месяц, день), без учета времени
  const isStreamDateActive = useCallback((stream: RadioStream): boolean => {
    if (!stream.startDate && !stream.endDate) {
      // Если даты не указаны, поток всегда активен (по датам)
      return true;
    }
    
    const now = new Date();
    // Нормализуем текущую дату (убираем время, оставляем только дату)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    // Парсим дату начала
    if (stream.startDate) {
      const parsed = new Date(stream.startDate);
      // Проверяем, что дата валидна
      if (isNaN(parsed.getTime())) {
        console.warn('⚠️ [WebRadioPlayer] Неверная дата начала потока:', stream.startDate);
        startDate = null;
      } else {
        // Нормализуем дату начала (убираем время, оставляем только дату)
        startDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }
    
    // Парсим дату окончания
    if (stream.endDate) {
      const parsed = new Date(stream.endDate);
      // Проверяем, что дата валидна
      if (isNaN(parsed.getTime())) {
        console.warn('⚠️ [WebRadioPlayer] Неверная дата окончания потока:', stream.endDate);
        endDate = null;
      } else {
        // Нормализуем дату окончания (убираем время, оставляем только дату)
        endDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      }
    }
    
    // Если есть дата начала - проверяем, что текущая дата >= даты начала
    if (startDate && today < startDate) {
      return false;
    }
    
    // Если есть дата окончания - проверяем, что текущая дата <= даты окончания
    if (endDate && today > endDate) {
      return false;
    }
    
    // Если есть только startDate (без endDate) - поток активен всегда после даты начала
    // Если есть endDate - поток активен до даты окончания включительно
    return true;
  }, []);
  
  // Получаем потоки для текущего формата филиала
  const streamsForCurrentBranchType = useMemo(() => {
    const norm = (v: string | undefined | null) => (v || '').trim().toLowerCase();
    return streams.filter(stream => 
      stream.isActive && 
      norm(stream.branchTypeOfDist) === norm(localBranchType) &&
      isStreamDateActive(stream)
    );
  }, [streams, localBranchType, isStreamDateActive]);
  
  // Переключение потока в модальном окне
  const toggleStream = useCallback((streamId: string) => {
    setTempDisabledStreams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(streamId)) {
        newSet.delete(streamId);
      } else {
        newSet.add(streamId);
      }
      return newSet;
    });
  }, []);
  
  // Отключить все потоки
  const disableAllStreams = useCallback(() => {
    const allStreamIds = streamsForCurrentBranchType.map(s => s.id);
    setTempDisabledStreams(new Set(allStreamIds));
  }, [streamsForCurrentBranchType]);
  
  // Включить все потоки
  const enableAllStreams = useCallback(() => {
    setTempDisabledStreams(new Set());
  }, []);

  // Отпечаток активных потоков (по id) для отслеживания изменений списка
  // Учитываем отключенные потоки пользователем
  const activeStreamsFingerprint = useMemo(() => {
    const norm = (v: string | undefined | null) => (v || '').trim().toLowerCase();
    let active = streams.filter(s => 
      s.isActive && 
      norm(s.branchTypeOfDist) === norm(localBranchType) &&
      isStreamDateActive(s) &&
      !disabledStreams.has(s.id) // Исключаем отключенные потоки
    );
    if (active.length === 0) {
      active = streams.filter(s => 
        s.isActive && 
        isStreamDateActive(s) &&
        !disabledStreams.has(s.id) // Исключаем отключенные потоки
      );
    }
    // Стабильный порядок по name/id
    const sorted = [...active].sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.id.localeCompare(b.id));
    return sorted.map(s => s.id).join('|');
  }, [streams, localBranchType, isStreamDateActive, disabledStreams]);
  
  // Состояние UI
  const [error, setError] = useState<string | null>(null);
  const [musicLoadingError, setMusicLoadingError] = useState<string | null>(null);
  const [isLoadingMusic, setIsLoadingMusic] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [downloadProgress] = useState(0);
  const [downloadedCount] = useState(0);
  const [totalFiles] = useState(0);
  
  // Обложки альбомов отключены для производительности
  
  // Адаптивное качество потока
  const [streamQuality, setStreamQuality] = useState<'high' | 'medium' | 'low'>('high');
  const networkSpeedRef = useRef<number>(0);
  
  // Ретрай на ошибки загрузки
  const retryCountsRef = useRef<Record<string, number>>({});

  // Состояние для недоступного контента (для повторной проверки)
  const [unavailableContent, setUnavailableContent] = useState<{
    type: 'track' | 'stream';
    content: MusicTrack | RadioStream;
    url: string;
    retryCount: number;
  } | null>(null);
  const unavailableContentCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RETRY_CHECKS = PLAYER_CONSTANTS.MAX_RETRY_CHECKS;

  // Буферизация следующего трека
  const [nextTrackBuffered, setNextTrackBuffered] = useState(false);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Состояние для прогресс-бара
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // const [isSeeking, setIsSeeking] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Ref для отслеживания последнего времени воспроизведения (для fallback механизма)
  const lastPlaybackTimeRef = useRef<number>(0);
  const lastPlaybackUpdateTimeRef = useRef<number>(0);
  const playbackCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Refs для защиты от множественных вызовов и управления таймаутами
  const isHandlingEndedRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const stalledTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Функция форматирования времени
  const formatTime = useCallback((seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Создание стабильного идентификатора браузера с учетом пользователя
  const getBrowserFingerprint = useCallback(() => {
    if (!user?.email) {
      console.warn('Пользователь не найден, не можем создать уникальный ID');
      return 'web-unknown';
    }
    
    const storageKey = `dns-radio-web-player-id-${user.email}`;
    let browserId: string | null = null;
    
    try {
      browserId = localStorage.getItem(storageKey);
    } catch (error) {
      console.warn('localStorage недоступен:', error);
    }
    
    if (!browserId) {
      // Генерируем UUID для устройства
      browserId = 'web-' + crypto.randomUUID();
      
      try {
        localStorage.setItem(storageKey, browserId);
      } catch (error) {
        console.warn('Не удалось сохранить в localStorage:', error);
      }
    }
    
    return browserId;
  }, [user?.email]);

  // Регистрация веб-плеера как устройства
  const registerWebPlayer = useCallback(async () => {
    try {
      // Проверяем, что вкладка активна
      if (!isActive) {
        console.log('✅ [WebRadioPlayer] Вкладка неактивна, пропускаем регистрацию устройства');
        return;
      }

      const browserId = getBrowserFingerprint();
      
      // Проверяем что у нас есть пользователь
      if (!user?.email) {
        console.warn('Пользователь не найден, пропускаем регистрацию устройства');
        return;
      }
      
      const deviceData = {
        userEmail: user.email,
        branchType: localBranchType,
        deviceName: `DNS Radio Web (${user.email.split('@')[0]})`,
        vendor: 'Web Browser',
        network: userIP.includes('.') ? userIP.split('.').slice(0, 3).join('.') + '.' : userIP,
        number: userIP.includes('.') ? userIP.split('.')[3] || '1' : '1',
        app: 'DNS Radio Web',
        os: navigator.userAgent,
        deviceIP: userIP,
        macAddress: browserId
      };

      const response = await fetch(`${API}/device/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deviceData)
      });

      if (response.ok) {
        // console.log('✅ [WebRadioPlayer] Успешно зарегистрирован как устройство');
      } else {
        console.log('⚠️ [WebRadioPlayer] Ошибка регистрации устройства:', response.status);
      }
    } catch (err) {
      console.log('⚠️ [WebRadioPlayer] Ошибка регистрации устройства:', err);
    }
  }, [localBranchType, user?.email, getBrowserFingerprint, userIP, isActive]);

  // Загрузка папок с музыкой
  const loadMusicFolders = useCallback(async () => {
    try {
      const response = await fetch(`${API}/radio/folders`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка загрузки папок: ${response.status} ${response.statusText}. ${errorText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.folders && Array.isArray(data.folders) && data.folders.length > 0) {
        // Определяем текущий месяц в формате MM-YYYY
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentYear = now.getFullYear();
        const currentMonthFolder = `${currentMonth}-${currentYear}`;
        
        // Ищем папку текущего месяца
        let selectedFolder = data.folders.find((folder: any) => folder.name === currentMonthFolder);
        
        // Если папка текущего месяца не найдена, ищем предыдущий месяц
        if (!selectedFolder) {
          const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
          const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          const prevMonthFolder = `${String(prevMonth).padStart(2, '0')}-${prevYear}`;
          selectedFolder = data.folders.find((folder: any) => folder.name === prevMonthFolder);
        }
        
        // Если и предыдущий месяц не найден, берем последнюю папку (самую новую)
        if (!selectedFolder) {
          selectedFolder = data.folders[0];
        }
        
        return selectedFolder.name;
      } else {
        console.warn('⚠️ [WebRadioPlayer] Папки с музыкой не найдены');
        setMusicLoadingError('Папки с музыкой не найдены на сервере');
        return null;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      console.error('❌ [WebRadioPlayer] Ошибка загрузки папок с музыкой:', err);
      setMusicLoadingError(errorMsg);
      return null;
    }
  }, []);

  // Загрузка музыки из папки
  const loadMusicFromFolder = useCallback(async (folderName: string) => {
    try {
      setIsLoadingMusic(true);
      setMusicLoadingError(null);
      
      const response = await fetch(`${API}/radio/folder/${folderName}/music`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка загрузки музыки: ${response.status} ${response.statusText}. ${errorText}`);
      }
      
      const data = await response.json();
      
      // Проверяем разные варианты структуры ответа
      let filesArray: any[] = [];
      
      if (data.success) {
        if (Array.isArray(data.files)) {
          filesArray = data.files;
        } else if (Array.isArray(data.data)) {
          filesArray = data.data;
        } else if (data.files && typeof data.files === 'object') {
          // Если files это объект, попробуем преобразовать в массив
          filesArray = Object.values(data.files);
        }
      }
      
      if (filesArray.length > 0) {
        const musicTracks = filesArray
          .filter((file: any) => file && file.name) // Фильтруем только файлы с именем
          .sort((a: any, b: any) => a.name.localeCompare(b.name)) // Дополнительная сортировка по имени
          .map((file: any, index: number) => ({
            id: `${file.name}_${index}`, // Уникальный ID
            fileName: file.name,
            url: `${API}/public/retail/radio/music/${folderName}/${file.name}`,
            isDownloaded: false, // В веб-версии не скачиваем файлы
            fileSize: file.size || 0,
            index: index // Добавляем индекс для сортировки
          }));
        
        if (musicTracks.length > 0) {
          setMusicTracks(musicTracks);
          setIsLoadingMusic(false);
          setMusicLoadingError(null);
          return musicTracks;
        } else {
          setMusicLoadingError('Файлы найдены, но не удалось их обработать');
        }
      } else {
        setMusicLoadingError(`Папка "${folderName}" не содержит музыкальных файлов или они не прошли фильтрацию (поддерживаются: .mp3, .wav, .ogg, .m4a, .flac)`);
      }
      
      setMusicTracks([]);
      setIsLoadingMusic(false);
      return [];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка загрузки музыки';
      console.error('❌ [WebRadioPlayer] Ошибка загрузки музыки:', err);
      setMusicLoadingError(errorMsg);
      setIsLoadingMusic(false);
      return [];
    }
  }, []);

  // Загрузка радио потоков
  const loadStreams = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch(`${API}/radio/streams`);
      if (!response.ok) {
        throw new Error('Ошибка загрузки потоков');
      }
      
      const data = await response.json();
      if (data.success && data.data) {
        setStreams(data.data);
      }
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка загрузки потоков:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    }
  }, []);

  // Восстанавливаем индекс ротации при монтировании/смене пользователя или формата
  useEffect(() => {
    try {
      const saved = localStorage.getItem(rotationStorageKey);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed)) {
          lastPlayedStreamIndexRef.current = parsed;
          // state index removed; ref is authoritative
        }
      }
    } catch {}
  }, [rotationStorageKey]);

  // Сбрасываем индекс ротации при изменении активного списка потоков (как Android setActiveStreams)
  useEffect(() => {
    // state index removed
    try { localStorage.setItem(rotationStorageKey, String(-1)); } catch {}
  }, [activeStreamsFingerprint, rotationStorageKey]);

  // Инициализация при загрузке компонента
  useEffect(() => {
    const initializePlayer = async () => {
      setIsLoadingMusic(true);
      
      try {
        // Получаем IP пользователя
        await getUserIP();
        
        // Загружаем потоки
        await loadStreams();
        
        // Загружаем музыку
        const folderName = await loadMusicFolders();
        if (folderName) {
          await loadMusicFromFolder(folderName);
        } else {
          setIsLoadingMusic(false);
        }
      } catch (error) {
        console.error('❌ [WebRadioPlayer] Ошибка инициализации:', error);
        setMusicLoadingError('Ошибка инициализации плеера');
        setIsLoadingMusic(false);
      }
    };
    initializePlayer();
  }, [getUserIP, loadStreams, loadMusicFolders, loadMusicFromFolder]);

  // Регистрация веб-плеера как устройства (только один раз)
  const [isRegistered, setIsRegistered] = useState(false);
  
  useEffect(() => {
    if (!isRegistered) {
      registerWebPlayer().then(() => {
        setIsRegistered(true);
      });
    }
  }, [registerWebPlayer, isRegistered]);

  // Проверка времени работы
  const isWithinWorkingTime = useCallback((): boolean => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = workingTime.start.split(':').map(Number);
    const [endHour, endMin] = workingTime.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    if (startTime < endTime) {
      // Обычный случай: 08:00 - 22:00
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Переход через полночь: 22:00 - 06:00
      return currentTime >= startTime || currentTime <= endTime;
    }
  }, [workingTime]);

  // Проверка интернет соединения
  const checkInternetConnection = useCallback(async () => {
    try {
      const response = await fetch(`${API}/radio/streams`, { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      setIsOnline(response.ok);
      
      // Определяем скорость сети для адаптивного качества
      if (response.ok && (navigator as any).connection) {
        const connection = (navigator as any).connection;
        const downlink = connection.downlink || 0;
        networkSpeedRef.current = downlink;
        
        // Устанавливаем качество на основе скорости
        if (downlink >= 5) {
          setStreamQuality('high');
        } else if (downlink >= 2) {
          setStreamQuality('medium');
        } else {
          setStreamQuality('low');
        }
      }
    } catch {
      setIsOnline(false);
    }
  }, [API]);

  // Проверка времени работы и активности потоков по датам
  useEffect(() => {
    const interval = setInterval(() => {
      const withinTime = isWithinWorkingTime();
      if (!withinTime && playbackState === 'playing') {
        setPlaybackState('stopped');
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
      
      // Проверяем, не истек ли текущий поток по датам
      if (currentStream && playbackState === 'playing') {
        if (!isStreamDateActive(currentStream)) {
          console.warn('⚠️ [WebRadioPlayer] Текущий поток истек по датам, переключаемся на следующий трек');
          setPlaybackState('error');
          setError('Поток завершен');
          if (audioRef.current) {
            audioRef.current.dispatchEvent(new Event('ended'));
          }
        }
      }
    }, PLAYER_CONSTANTS.WORKING_TIME_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [isWithinWorkingTime, playbackState, currentStream, isStreamDateActive]);

  // Проверка интернета
  useEffect(() => {
    const interval = setInterval(checkInternetConnection, PLAYER_CONSTANTS.INTERNET_CHECK_INTERVAL);
    checkInternetConnection(); // Проверяем сразу
    return () => clearInterval(interval);
  }, [checkInternetConnection]);

  // Мониторинг состояния воспроизведения для предотвращения остановок
  useEffect(() => {
    if (playbackState !== 'playing') return;

    let lastCheckTime = Date.now();
    let consecutiveFailures = 0;

    const monitorInterval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;

      // Проверяем, что музыка действительно играет
      const shouldBePlaying = playbackState === 'playing';
      const isActuallyPlaying = !audio.paused && !audio.ended;
      
      // Если должна играть, но не играет - возобновляем
      if (shouldBePlaying && !isActuallyPlaying && audio.readyState >= 2 && !isPlayingRef.current) {
        console.warn('⚠️ [WebRadioPlayer] Музыка должна играть, но остановилась. Возобновляем...');
        consecutiveFailures++;
        
        // Если слишком много неудачных попыток - переключаемся на следующий трек
        if (consecutiveFailures >= 3) {
          console.warn('⚠️ [WebRadioPlayer] Слишком много неудачных попыток возобновления, переключаемся на следующий трек');
          consecutiveFailures = 0;
          audio.dispatchEvent(new Event('ended'));
          return;
        }
        
        audio.play().catch((err) => {
          console.error('❌ [WebRadioPlayer] Не удалось возобновить воспроизведение:', err);
          // Если не удалось возобновить, переключаемся на следующий трек
          setTimeout(() => {
            audio.dispatchEvent(new Event('ended'));
          }, 1000);
        });
      } else if (isActuallyPlaying) {
        // Сбрасываем счетчик при успешном воспроизведении
        consecutiveFailures = 0;
      }

      // Проверяем состояние буфера и готовность к воспроизведению
      if (isActuallyPlaying && audio.readyState < 2 && audio.buffered.length === 0) {
        const timeSinceLastCheck = Date.now() - lastCheckTime;
        // Проверяем только если прошло достаточно времени (избегаем частых проверок)
        if (timeSinceLastCheck > 5000) {
          console.warn('⚠️ [WebRadioPlayer] Буфер пуст, но музыка должна играть. Перезагружаем...');
          lastCheckTime = Date.now();
          // Перезагружаем источник
          const currentSrc = audio.currentSrc || audio.src;
          if (currentSrc && !isPlayingRef.current) {
            audio.load();
            audio.play().catch((err) => {
              console.error('❌ [WebRadioPlayer] Не удалось возобновить после перезагрузки:', err);
            });
          }
        }
      }

      // Проверяем ошибки сети (только если прошло достаточно времени)
      const timeSinceLastCheck = Date.now() - lastCheckTime;
      if (timeSinceLastCheck > 10000 && (audio.networkState === 3 || (audio.networkState === 2 && audio.readyState < 2))) {
        console.warn('⚠️ [WebRadioPlayer] Проблема с сетью, networkState:', audio.networkState);
        lastCheckTime = Date.now();
        // Если сеть в состоянии ошибки, перезагружаем
        const currentSrc = audio.currentSrc || audio.src;
        if (currentSrc && !isPlayingRef.current) {
          console.log('🔄 [WebRadioPlayer] Перезагружаем источник из-за проблем с сетью');
          audio.load();
          audio.play().catch((err) => {
            console.error('❌ [WebRadioPlayer] Не удалось возобновить после перезагрузки сети:', err);
          });
        }
      }
    }, PLAYER_CONSTANTS.MONITOR_INTERVAL);

    return () => clearInterval(monitorInterval);
  }, [playbackState]);

  // Громкость фиксирована на максимум для стабильного звука
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 1;
      audioRef.current.muted = false; // Убеждаемся, что звук не отключен
      console.log('🔊 [WebRadioPlayer] Инициализация audio: volume =', audioRef.current.volume, 'muted =', audioRef.current.muted);
    }
  }, []);

  // Heartbeat для веб-плеера
  const sendHeartbeat = useCallback(async () => {
    try {
      // Проверяем, что вкладка активна
      if (!isActive) {
        return;
      }

      const browserId = getBrowserFingerprint();
      
      // Проверяем что у нас есть пользователь
      if (!user?.email) {
        return;
      }
      
      const heartbeatData = {
        deviceName: `DNS Radio Web (${user.email.split('@')[0]})`,
        appVersion: PLAYER_CONSTANTS.VERSION,
        macAddress: browserId,
        currentIP: userIP,
        userEmail: user.email
      };

      // console.log('🔍 [WebRadioPlayer] Отправляем heartbeat:', heartbeatData);

      const response = await fetch(`${API}/device/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(heartbeatData)
      });

      if (response.ok) {
        // console.log('💓 [WebRadioPlayer] Heartbeat отправлен');
      }
    } catch (err) {
      console.log('⚠️ [WebRadioPlayer] Ошибка heartbeat:', err);
    }
  }, [getBrowserFingerprint, user?.email, userIP, isActive]);

  // Логика выбора следующего трека/потока
  const findNextTrack = useCallback((songsCount: number) => {
    // Проверяем, нужно ли вклинить поток
    // Каждый 4-й элемент должен быть потоком (после каждых 3-х треков)
    // Схема: 1трек, 2трек, 3трек, поток, 4трек, 5трек, 6трек, поток...
    // songsCount: 3(после 3-го трека) -> поток
    // songsCount: 7(после 6-го трека) -> поток
    // Android logic: every N songs, insert a stream (N, 2N, 3N, ...)
    const shouldPlayStream = songsCount > 0 && songsCount % PLAYER_CONSTANTS.STREAM_FREQUENCY === 0;
    
    if (shouldPlayStream && streams.length > 0) {
      // Активные потоки по типу филиала, сравнение без регистра и с trim
      // Также проверяем даты начала и окончания потока
      // Исключаем отключенные потоки пользователем
      const norm = (v: string | undefined | null) => (v || '').trim().toLowerCase();
      let activeStreams = streams.filter(stream => 
        stream.isActive && 
        norm(stream.branchTypeOfDist) === norm(localBranchType) &&
        isStreamDateActive(stream) &&
        !disabledStreams.has(stream.id) // Исключаем отключенные потоки
      );

      // Фолбэк: если по типу ничего не нашли, используем все активные по датам
      if (activeStreams.length === 0) {
        activeStreams = streams.filter(stream => 
          stream.isActive && 
          isStreamDateActive(stream) &&
          !disabledStreams.has(stream.id) // Исключаем отключенные потоки
        );
      }

      if (activeStreams.length > 0) {
        // Простая ротация как в Android версии (без сайд-эффектов здесь)
        const currentIndex = lastPlayedStreamIndexRef.current;
        const nextStreamIndex = (currentIndex + 1) % activeStreams.length;
        const nextStream = activeStreams[nextStreamIndex];
        
        return { type: 'stream', content: nextStream, index: nextStreamIndex } as const;
      }
    }
    
    // Иначе играем следующий музыкальный трек
    if (musicTracks.length > 0) {
      // Используем lastTrackIndex для расчета следующего трека
      // Исправлено: используем позицию в массиве, а не track.index
      const currentIndex = lastTrackIndex >= 0 ? lastTrackIndex : -1;
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % musicTracks.length : 0;
      
      // Исправлено: используем прямое обращение к массиву вместо find
      const nextTrack = musicTracks[nextIndex];
      
      if (nextTrack) {
        return { type: 'track', content: nextTrack } as const;
      } else {
        console.warn('[WebRadio] Track not found at index:', nextIndex, 'total tracks:', musicTracks.length);
      }
    } else {
      console.warn('[WebRadio] No music tracks available. Total tracks:', musicTracks.length);
    }
    
    return null;
  }, [streams, musicTracks, lastTrackIndex, localBranchType, rotationStorageKey, isStreamDateActive]);

  // Буферизация следующего трека
  const bufferNextTrack = useCallback(async () => {
    if (!nextAudioRef.current) {
      nextAudioRef.current = document.createElement('audio');
      nextAudioRef.current.preload = 'auto';
      nextAudioRef.current.crossOrigin = 'anonymous';
    }
    
    const nextContent = findNextTrack(songsPlayed + 1);
    if (!nextContent || nextContent.type === 'stream') {
      setNextTrackBuffered(false);
      return;
    }
    
    const nextTrack = nextContent.content as MusicTrack;
    if (nextTrack.url) {
      setNextTrackBuffered(false);
      const audio = nextAudioRef.current;
      audio.src = nextTrack.url;
      audio.load();
      
      // Отслеживаем прогресс буферизации
      const interval = setInterval(() => {
        if (audio && audio.buffered.length > 0 && audio.readyState >= 2) {
          setNextTrackBuffered(true);
          clearInterval(interval);
        }
      }, 100);
      
      setTimeout(() => clearInterval(interval), 10000);
    }
  }, [findNextTrack, songsPlayed]);

  // Проверка доступности файла перед воспроизведением
  const checkFileAvailability = useCallback(async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      return response.ok && response.status === 200;
    } catch (err) {
      console.warn('⚠️ [WebRadioPlayer] Не удалось проверить доступность файла:', url, err);
      // Если HEAD не работает, пробуем GET с range
      try {
        const response = await fetch(url, { 
          method: 'GET', 
          headers: { 'Range': 'bytes=0-1' },
          cache: 'no-cache' 
        });
        return response.ok && (response.status === 200 || response.status === 206);
      } catch {
        return false;
      }
    }
  }, []);

  // Воспроизведение трека
  const playTrack = useCallback(async (track: MusicTrack) => {
    if (!audioRef.current) return;
    
    // Защита от множественных вызовов
    if (isPlayingRef.current) {
      console.log('⚠️ [WebRadioPlayer] Воспроизведение уже запускается, пропускаем');
      return;
    }
    
    isPlayingRef.current = true;
    
    try {
      // Останавливаем текущее воспроизведение безопасно
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        await new Promise((r) => setTimeout(r, 50));
      }
      
      setPlaybackState('loading');
      setPendingTrack(track);
      setLastTrackIndex(track.index);
      setCurrentStream(null);
      setIsPlayingStream(false);
      
      // Проверяем доступность файла перед воспроизведением
      const isAvailable = await checkFileAvailability(track.url);
      if (!isAvailable) {
        console.error('❌ [WebRadioPlayer] Файл недоступен:', track.url);
        setError('Файл не найден или недоступен');
        setPlaybackState('error');
        // Сохраняем недоступный трек для повторной проверки
        setUnavailableContent({
          type: 'track',
          content: track,
          url: track.url,
          retryCount: 0
        });
        isPlayingRef.current = false;
        // Не переключаемся сразу, ждем, пока файл станет доступным
        return;
      }
      
      // Если файл доступен, очищаем недоступный контент (если он был для этого трека)
      // Это проверяется в useEffect для unavailableContent
      
      // Очищаем предыдущий источник для избежания проблем с кешированием
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      
      // Добавляем cache busting для избежания проблем с кешированием
      const urlWithCacheBust = `${track.url}${track.url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      audioRef.current.src = urlWithCacheBust;
      
      // Сбрасываем счетчик retry для нового трека
      retryCountsRef.current[urlWithCacheBust] = 0;
      
      // Ждем загрузки метаданных перед воспроизведением
      await new Promise<void>((resolve, reject) => {
        const audio = audioRef.current;
        if (!audio) {
          reject(new Error('Audio element not found'));
          return;
        }

        const handleLoadedMetadata = () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          resolve();
        };

        const handleError = () => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          reject(new Error('Failed to load audio metadata'));
        };

        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('error', handleError);
        
        audio.load();
        
        // Таймаут на загрузку метаданных (10 секунд)
        setTimeout(() => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('error', handleError);
          if (audio.readyState < 1) {
            reject(new Error('Timeout loading audio metadata'));
          } else {
            resolve();
          }
        }, PLAYER_CONSTANTS.METADATA_LOAD_TIMEOUT);
      });

      // Проверяем, что файл действительно готов к воспроизведению
      if (audioRef.current.readyState < 2) {
        console.warn('⚠️ [WebRadioPlayer] Файл не готов к воспроизведению, readyState:', audioRef.current.readyState);
        // Ждем еще немного
        await new Promise((r) => setTimeout(r, 500));
      }

      // Убеждаемся, что звук включен перед воспроизведением
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      
      console.log('▶️ [WebRadioPlayer] Запуск воспроизведения трека:', track.fileName);
      console.log('🔊 [WebRadioPlayer] Audio состояние перед play(): volume =', audioRef.current.volume, 'muted =', audioRef.current.muted, 'paused =', audioRef.current.paused);
      
      await audioRef.current.play();
      
      // Проверяем, что воспроизведение действительно началось
      if (audioRef.current.paused) {
        console.error('❌ [WebRadioPlayer] Воспроизведение не началось после play()');
        throw new Error('Воспроизведение не началось');
      }
      
      console.log('✅ [WebRadioPlayer] Воспроизведение началось успешно');
      
      setPlaybackState('playing');
      setCurrentTrack(track);
      setPendingTrack(null);
      setError(null);
      isPlayingRef.current = false;
    } catch (err) {
      isPlayingRef.current = false;
      // Игнорируем AbortError - это нормально при переключении
      if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'NotAllowedError') {
        console.error('❌ [WebRadioPlayer] Ошибка воспроизведения трека:', err);
        setError('Не удалось воспроизвести трек');
        setPlaybackState('error');
        // Переключаемся на следующий трек при ошибке
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.dispatchEvent(new Event('ended'));
          }
        }, 2000);
      } else if ((err as Error).name === 'NotAllowedError') {
        console.warn('⚠️ [WebRadioPlayer] Воспроизведение заблокировано браузером (требуется взаимодействие пользователя)');
        setError('Для воспроизведения требуется взаимодействие с пользователем');
        setPlaybackState('error');
      }
    }
  }, [checkFileAvailability]);

  // Воспроизведение потока
  const playStream = useCallback(async (stream: RadioStream, rotationIndex?: number) => {
    if (!audioRef.current) return;
    
    // Защита от множественных вызовов
    if (isPlayingRef.current) {
      console.log('⚠️ [WebRadioPlayer] Воспроизведение уже запускается, пропускаем');
      return;
    }
    
    isPlayingRef.current = true;
    
    // Проверяем, что поток активен и имеет файл
    if (!stream.isActive) {
      console.error('❌ [WebRadioPlayer] Поток неактивен:', stream.name);
      setError('Поток неактивен');
      setPlaybackState('error');
      isPlayingRef.current = false;
      return;
    }

    // Проверяем даты начала и окончания потока
    if (!isStreamDateActive(stream)) {
      const now = new Date();
      const startDate = stream.startDate ? new Date(stream.startDate) : null;
      const endDate = stream.endDate ? new Date(stream.endDate) : null;
      
      if (startDate && now < startDate) {
        console.error('❌ [WebRadioPlayer] Поток еще не начался:', stream.name, 'Начало:', startDate);
        setError(`Поток начнется ${startDate.toLocaleDateString('ru-RU')}`);
      } else if (endDate && now > endDate) {
        console.error('❌ [WebRadioPlayer] Поток уже завершен:', stream.name, 'Окончание:', endDate);
        setError(`Поток завершен ${endDate.toLocaleDateString('ru-RU')}`);
      }
      setPlaybackState('error');
      isPlayingRef.current = false;
      // Переключаемся на следующий трек при ошибке
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.dispatchEvent(new Event('ended'));
        }
      }, 2000);
      return;
    }

    if (!stream.attachment) {
      console.error('❌ [WebRadioPlayer] У потока нет файла:', stream.name);
      setError('У потока нет файла для воспроизведения');
      setPlaybackState('error');
      isPlayingRef.current = false;
      return;
    }

    try {
      // Проверяем доступность файла потока перед воспроизведением
      const baseStreamUrl = `${API}/radio/stream/${stream.id}/play`;
      const isAvailable = await checkFileAvailability(baseStreamUrl);
      if (!isAvailable) {
        console.error('❌ [WebRadioPlayer] Файл потока недоступен:', baseStreamUrl);
        setError('Файл потока не найден или недоступен');
        setPlaybackState('error');
        isPlayingRef.current = false;
        // Сохраняем недоступный поток для повторной проверки
        setUnavailableContent({
          type: 'stream',
          content: stream,
          url: baseStreamUrl,
          retryCount: 0
        });
        // Не переключаемся сразу, ждем, пока файл станет доступным
        return;
      }
      
      // Если файл доступен, очищаем недоступный контент (если он был для этого потока)
      // Это проверяется в useEffect для unavailableContent
      
      // Останавливаем текущее воспроизведение безопасно
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        await new Promise((r) => setTimeout(r, 50));
      }
      
      setPlaybackState('loading');
      // Сначала очищаем текущий поток, чтобы UI показывал pendingStream
      setCurrentStream(null);
      setPendingStream(stream);
      setIsPlayingStream(true);
      
      const qualityParam = streamQuality === 'high' ? '?quality=high' : 
                           streamQuality === 'medium' ? '?quality=medium' : '?quality=low';
      const bust = `&ts=${Date.now()}&rand=${Math.random().toString(36).slice(2)}`;
      const streamUrl = `${baseStreamUrl}${qualityParam}${bust}`;
      
      // Принудительно перезагружаем источник
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current.src = streamUrl;
      
      // Сбрасываем счетчик retry для нового потока
      retryCountsRef.current[streamUrl] = 0;
      
      console.log('[WebRadio] Applying stream URL:', streamUrl);
      
      // Убеждаемся, что звук включен перед воспроизведением
      audioRef.current.muted = false;
      audioRef.current.volume = 1;
      
      console.log('🔊 [WebRadioPlayer] Audio состояние перед play() потока: volume =', audioRef.current.volume, 'muted =', audioRef.current.muted, 'paused =', audioRef.current.paused);
      
      await audioRef.current.load();
      await audioRef.current.play();
      
      // Проверяем, что воспроизведение действительно началось
      if (audioRef.current.paused) {
        console.error('❌ [WebRadioPlayer] Воспроизведение потока не началось после play()');
        throw new Error('Воспроизведение потока не началось');
      }
      
      console.log('✅ [WebRadioPlayer] Воспроизведение потока началось успешно');
      console.log('[WebRadio] Audio element src after play:', audioRef.current.currentSrc || audioRef.current.src);
      
      setPlaybackState('playing');
      setCurrentStream(stream);
      setPendingStream(null);
      setError(null);
      isPlayingRef.current = false;

      // Фиксируем индекс ротации, только когда действительно начали играть поток
      if (typeof rotationIndex === 'number') {
        lastPlayedStreamIndexRef.current = rotationIndex;
        // state index removed; ref + localStorage are authoritative
        try { localStorage.setItem(rotationStorageKey, String(rotationIndex)); } catch {}
      }
    } catch (err) {
      isPlayingRef.current = false;
      // Игнорируем AbortError
      if ((err as Error).name !== 'AbortError' && (err as Error).name !== 'NotAllowedError') {
        console.error('❌ [WebRadioPlayer] Ошибка воспроизведения потока:', err);
        setError('Не удалось воспроизвести поток');
        setPlaybackState('error');
      } else if ((err as Error).name === 'NotAllowedError') {
        console.warn('⚠️ [WebRadioPlayer] Воспроизведение заблокировано браузером (требуется взаимодействие пользователя)');
        setError('Для воспроизведения требуется взаимодействие с пользователем');
        setPlaybackState('error');
      }
    }
  }, [API, streamQuality, rotationStorageKey, checkFileAvailability, isStreamDateActive]);

  // Обработчики событий аудио
  // Используем refs для стабильных ссылок на функции, чтобы избежать перерендеров
  const findNextTrackRef = useRef(findNextTrack);
  const playTrackRef = useRef(playTrack);
  const playStreamRef = useRef(playStream);
  const bufferNextTrackRef = useRef(bufferNextTrack);
  const songsPlayedRef = useRef(songsPlayed);
  const isPlayingStreamRef = useRef(isPlayingStream);

  // Обновляем refs при изменении функций
  useEffect(() => {
    findNextTrackRef.current = findNextTrack;
    playTrackRef.current = playTrack;
    playStreamRef.current = playStream;
    bufferNextTrackRef.current = bufferNextTrack;
  }, [findNextTrack, playTrack, playStream, bufferNextTrack]);

  // Обновляем refs для состояния
  useEffect(() => {
    songsPlayedRef.current = songsPlayed;
    isPlayingStreamRef.current = isPlayingStream;
  }, [songsPlayed, isPlayingStream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio) {
        const currentTimeValue = audio.currentTime;
        setCurrentTime(currentTimeValue);
        lastPlaybackTimeRef.current = currentTimeValue;
        lastPlaybackUpdateTimeRef.current = Date.now();
      }
    };

    const handleLoadedMetadata = () => {
      if (audio) {
        const durationValue = audio.duration || 0;
        setDuration(durationValue);
        
        // Запускаем fallback механизм для проверки окончания трека
        // Очищаем предыдущий интервал, если он есть
        if (playbackCheckIntervalRef.current) {
          clearInterval(playbackCheckIntervalRef.current);
        }
        
        // Проверяем периодически, не закончился ли трек
        playbackCheckIntervalRef.current = setInterval(() => {
          if (!audio) {
            return;
          }
          // Убрали проверку isActive - проверка работает даже в фоне
          
          // Если трек играет, но время не меняется более 3 секунд - возможно застрял
          const currentTime = audio.currentTime;
          const duration = audio.duration;
          const isPlaying = !audio.paused && !audio.ended;
          
          // Проверяем, закончился ли трек (с небольшой погрешностью)
          if (isPlaying && duration > 0 && currentTime >= duration - 0.5) {
            console.log('🔄 [WebRadioPlayer] Fallback: трек закончился по времени, вызываем ended');
            clearInterval(playbackCheckIntervalRef.current!);
            playbackCheckIntervalRef.current = null;
            audio.dispatchEvent(new Event('ended'));
            return;
          }
          
          // Проверяем, не застрял ли трек (время не меняется, но должно играть)
          if (isPlaying && Math.abs(currentTime - lastPlaybackTimeRef.current) < 0.1 && currentTime > 0) {
            // Если время не меняется более 5 секунд - возможно проблема
            const timeSinceLastUpdate = Date.now() - lastPlaybackUpdateTimeRef.current;
            if (timeSinceLastUpdate > 5000) {
              console.warn('⚠️ [WebRadioPlayer] Трек застрял, переключаемся на следующий');
              clearInterval(playbackCheckIntervalRef.current!);
              playbackCheckIntervalRef.current = null;
              audio.dispatchEvent(new Event('ended'));
            }
          }
        }, 2000);
      }
    };

    const handleEnded = async () => {
      // Очищаем fallback интервал при окончании трека
      if (playbackCheckIntervalRef.current) {
        clearInterval(playbackCheckIntervalRef.current);
        playbackCheckIntervalRef.current = null;
      }

      // Очищаем таймауты stalled/waiting при окончании трека
      if (stalledTimeoutRef.current) {
        clearTimeout(stalledTimeoutRef.current);
        stalledTimeoutRef.current = null;
      }
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
        waitingTimeoutRef.current = null;
      }

      // Предотвращаем множественные вызовы
      if (isHandlingEndedRef.current) {
        console.log('⚠️ [WebRadioPlayer] handleEnded уже обрабатывается, пропускаем');
        return;
      }
      isHandlingEndedRef.current = true;

      // Убрали проверку isActive - переключение работает даже в фоне
      console.log('🎵 [WebRadioPlayer] Трек закончился, переключаемся на следующий');

      // Используем ref для получения актуального значения
      const currentSongsPlayed = songsPlayedRef.current;
      const nextSongsPlayed = currentSongsPlayed + 1;
      setSongsPlayed(nextSongsPlayed);
      
      const currentIsPlayingStream = isPlayingStreamRef.current;
      if (currentIsPlayingStream) {
        // Если играл поток, сбрасываем флаг и переключаемся на музыку
        setIsPlayingStream(false);
        setCurrentStream(null);
      }
      
      // Используем ref для вызова функции
      const nextContent = findNextTrackRef.current(nextSongsPlayed);
      
      if (nextContent) {
        try {
          // Небольшая задержка перед переключением для стабильности
          await new Promise((r) => setTimeout(r, 100));
          
          if (nextContent.type === 'track') {
            await playTrackRef.current(nextContent.content as MusicTrack);
          } else if (nextContent.type === 'stream') {
            await playStreamRef.current(nextContent.content as RadioStream, (nextContent as any).index);
          }
        } catch (err) {
          console.error('❌ [WebRadioPlayer] Ошибка при переключении на следующий трек:', err);
          setError('Не удалось переключить трек');
          setPlaybackState('error');
          // Пробуем еще раз через 2 секунды
          setTimeout(() => {
            isHandlingEndedRef.current = false;
            audioRef.current?.dispatchEvent(new Event('ended'));
          }, 2000);
          return;
        }
      } else {
        setPlaybackState('stopped');
      }
      
      // Сбрасываем флаг после успешного переключения
      setTimeout(() => {
        isHandlingEndedRef.current = false;
      }, 1000);
      
      // Буферизируем следующий трек после начала воспроизведения
      setTimeout(() => {
        bufferNextTrackRef.current();
      }, 500);
    };

    const handleError = (event: any) => {
      console.error('❌ [WebRadioPlayer] Ошибка воспроизведения:', event);
      console.error('❌ [WebRadioPlayer] Error details:', event.target?.error);
      console.error('❌ [WebRadioPlayer] Audio src:', event.target?.src);
      console.error('❌ [WebRadioPlayer] Audio networkState:', event.target?.networkState);
      console.error('❌ [WebRadioPlayer] Audio readyState:', event.target?.readyState);
      
      let errorMessage = 'Ошибка воспроизведения аудио. Проверьте формат файла и соединение.';
      
      if (event.target?.error) {
        const error = event.target.error;
        switch (error.code) {
          case error.MEDIA_ERR_ABORTED:
            errorMessage = 'Воспроизведение было прервано';
            // AbortError обычно не требует retry
            setError(errorMessage);
            setPlaybackState('paused');
            return;
          case error.MEDIA_ERR_NETWORK:
            errorMessage = 'Ошибка сети при загрузке аудио';
            break;
          case error.MEDIA_ERR_DECODE:
            errorMessage = 'Ошибка декодирования аудио';
            break;
          case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Формат аудио не поддерживается или файл не найден';
            break;
        }
      }
      
      setError(errorMessage);
      setPlaybackState('error');

      // Улучшенный retry - работает даже в фоне
      const src = (event?.target?.src as string) || '';
      if (src) {
        const count = retryCountsRef.current[src] || 0;
        if (count < 3) {
          retryCountsRef.current[src] = count + 1;
          const delay = Math.pow(2, count) * 1000;
          console.log(`🔄 [WebRadioPlayer] Retry ${count + 1}/3 через ${delay}ms для ${src}`);
          
          setTimeout(async () => {
            // Убрали проверку isActive - retry работает даже в фоне
            try {
              if (!audioRef.current) return;
              
              // Очищаем источник и перезагружаем
              audioRef.current.pause();
              audioRef.current.removeAttribute('src');
              audioRef.current.load();
              audioRef.current.src = src;
              audioRef.current.muted = false;
              audioRef.current.volume = 1;
              await audioRef.current.load();
              await audioRef.current.play();
              
              setPlaybackState('playing');
              setError(null);
              // Сбрасываем счетчик retry при успехе
              retryCountsRef.current[src] = 0;
              console.log('✅ [WebRadioPlayer] Retry успешен');
            } catch (e) {
              console.error('❌ [WebRadioPlayer] Retry не удался:', e);
              // Если это последняя попытка, переключаемся на следующий трек
              if (count >= 2) {
                console.log('⚠️ [WebRadioPlayer] Превышен лимит retry, переключаемся на следующий трек');
                // Вызываем handleEnded для переключения
                audioRef.current?.dispatchEvent(new Event('ended'));
              }
            }
          }, delay);
        } else {
          // Превышен лимит retry - переключаемся на следующий трек
          console.log('⚠️ [WebRadioPlayer] Превышен лимит retry, переключаемся на следующий трек');
          retryCountsRef.current[src] = 0; // Сбрасываем счетчик
          setTimeout(() => {
            audioRef.current?.dispatchEvent(new Event('ended'));
          }, 1000);
        }
      }
    };

    const handleStalled = () => {
      // Логируем и пытаемся восстановить
      console.log('⚠️ [WebRadioPlayer] Аудио застопорилось, ожидание буферизации...');
      
      // Очищаем предыдущий таймаут, если есть
      if (stalledTimeoutRef.current) {
        clearTimeout(stalledTimeoutRef.current);
      }
      
      // Если застряло слишком долго - перезагружаем
      stalledTimeoutRef.current = setTimeout(() => {
        stalledTimeoutRef.current = null;
        if (audio && !audio.paused && audio.readyState < 3 && playbackState === 'playing') {
          console.warn('⚠️ [WebRadioPlayer] Застопорилось слишком долго, перезагружаем...');
          const currentSrc = audio.currentSrc || audio.src;
          if (currentSrc) {
            audio.load();
            audio.play().catch((err) => {
              console.error('❌ [WebRadioPlayer] Не удалось возобновить после stalled:', err);
              // Переключаемся на следующий трек при ошибке
              audio.dispatchEvent(new Event('ended'));
            });
          }
        }
      }, 10000);
    };

    const handleWaiting = () => {
      // Логируем и пытаемся восстановить
      console.log('⚠️ [WebRadioPlayer] Ожидание данных для воспроизведения...');
      
      // Очищаем предыдущий таймаут, если есть
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
      }
      
      // Если ожидание слишком долгое - перезагружаем
      waitingTimeoutRef.current = setTimeout(() => {
        waitingTimeoutRef.current = null;
        if (audio && !audio.paused && audio.readyState < 3 && playbackState === 'playing') {
          console.warn('⚠️ [WebRadioPlayer] Ожидание слишком долгое, перезагружаем...');
          const currentSrc = audio.currentSrc || audio.src;
          if (currentSrc) {
            audio.load();
            audio.play().catch((err) => {
              console.error('❌ [WebRadioPlayer] Не удалось возобновить после waiting:', err);
              // Переключаемся на следующий трек при ошибке
              audio.dispatchEvent(new Event('ended'));
            });
          }
        }
      }, PLAYER_CONSTANTS.WAITING_TIMEOUT);
    };

    const handleCanPlay = () => {
      // Аудио готово к воспроизведению
      console.log('✅ [WebRadioPlayer] Аудио готово к воспроизведению');
      if (audio) {
        audio.muted = false;
        audio.volume = 1;
      }
    };

    const handleCanPlayThrough = () => {
      // Аудио готово к воспроизведению без прерываний
      console.log('✅ [WebRadioPlayer] Аудио готово к воспроизведению без прерываний');
      if (audio) {
        audio.muted = false;
        audio.volume = 1;
      }
    };

    const handleLoadStart = () => {
      // Начало загрузки аудио
      console.log('🔄 [WebRadioPlayer] Начало загрузки аудио');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('loadstart', handleLoadStart);

    return () => {
      // Очищаем fallback интервал при размонтировании
      if (playbackCheckIntervalRef.current) {
        clearInterval(playbackCheckIntervalRef.current);
        playbackCheckIntervalRef.current = null;
      }
      
      // Очищаем таймауты stalled/waiting
      if (stalledTimeoutRef.current) {
        clearTimeout(stalledTimeoutRef.current);
        stalledTimeoutRef.current = null;
      }
      if (waitingTimeoutRef.current) {
        clearTimeout(waitingTimeoutRef.current);
        waitingTimeoutRef.current = null;
      }
      
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [playbackState]); // Добавили playbackState для проверки в stalled/waiting

  // Ref для хранения недоступного контента (чтобы избежать проблем с замыканием)
  const unavailableContentRef = useRef<{
    type: 'track' | 'stream';
    content: MusicTrack | RadioStream;
    url: string;
    retryCount: number;
  } | null>(null);

  // Обновляем ref при изменении unavailableContent
  useEffect(() => {
    unavailableContentRef.current = unavailableContent;
  }, [unavailableContent]);

  // Периодическая проверка доступности недоступного контента
  useEffect(() => {
    if (!unavailableContent || playbackState !== 'error') {
      // Очищаем интервал, если контент стал доступным или состояние изменилось
      if (unavailableContentCheckIntervalRef.current) {
        clearInterval(unavailableContentCheckIntervalRef.current);
        unavailableContentCheckIntervalRef.current = null;
      }
      return;
    }

    // Запускаем периодическую проверку доступности файла
    console.log(`🔄 [WebRadioPlayer] Запускаем проверку доступности файла: ${unavailableContent.url}`);
    
    unavailableContentCheckIntervalRef.current = setInterval(async () => {
      // Используем ref для получения актуального значения
      const currentUnavailableContent = unavailableContentRef.current;
      if (!currentUnavailableContent || playbackState !== 'error') {
        // Очищаем интервал, если контент больше не недоступен
        if (unavailableContentCheckIntervalRef.current) {
          clearInterval(unavailableContentCheckIntervalRef.current);
          unavailableContentCheckIntervalRef.current = null;
        }
        return;
      }

      // Проверяем доступность файла
      const isAvailable = await checkFileAvailability(currentUnavailableContent.url);
      
      if (isAvailable) {
        console.log(`✅ [WebRadioPlayer] Файл стал доступным: ${currentUnavailableContent.url}`);
        // Очищаем интервал
        if (unavailableContentCheckIntervalRef.current) {
          clearInterval(unavailableContentCheckIntervalRef.current);
          unavailableContentCheckIntervalRef.current = null;
        }
        // Очищаем недоступный контент перед попыткой воспроизведения
        setUnavailableContent(null);
        unavailableContentRef.current = null;
        // Автоматически возобновляем воспроизведение
        try {
          if (currentUnavailableContent.type === 'track') {
            await playTrack(currentUnavailableContent.content as MusicTrack);
          } else if (currentUnavailableContent.type === 'stream') {
            await playStream(currentUnavailableContent.content as RadioStream);
          }
          console.log('✅ [WebRadioPlayer] Воспроизведение успешно возобновлено');
        } catch (err) {
          console.error('❌ [WebRadioPlayer] Ошибка при возобновлении воспроизведения:', err);
          setError('Не удалось возобновить воспроизведение');
          setPlaybackState('error');
        }
      } else {
        // Увеличиваем счетчик попыток
        const newRetryCount = currentUnavailableContent.retryCount + 1;
        
        if (newRetryCount >= MAX_RETRY_CHECKS) {
          // Превышен лимит попыток - переключаемся на следующий трек
          console.log(`⚠️ [WebRadioPlayer] Превышен лимит проверок (${MAX_RETRY_CHECKS}), переключаемся на следующий трек`);
          // Очищаем интервал
          if (unavailableContentCheckIntervalRef.current) {
            clearInterval(unavailableContentCheckIntervalRef.current);
            unavailableContentCheckIntervalRef.current = null;
          }
          // Очищаем недоступный контент
          setUnavailableContent(null);
          unavailableContentRef.current = null;
          // Переключаемся на следующий трек
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.dispatchEvent(new Event('ended'));
            }
          }, 1000);
        } else {
          // Обновляем счетчик попыток
          const updatedContent = {
            ...currentUnavailableContent,
            retryCount: newRetryCount
          };
          setUnavailableContent(updatedContent);
          unavailableContentRef.current = updatedContent;
          console.log(`🔄 [WebRadioPlayer] Файл все еще недоступен (попытка ${newRetryCount}/${MAX_RETRY_CHECKS}): ${currentUnavailableContent.url}`);
        }
      }
    }, 2000); // Проверяем каждые 2 секунды

    // Очистка при размонтировании
    return () => {
      if (unavailableContentCheckIntervalRef.current) {
        clearInterval(unavailableContentCheckIntervalRef.current);
        unavailableContentCheckIntervalRef.current = null;
      }
    };
  }, [unavailableContent, playbackState, checkFileAvailability, playTrack, playStream]);

  // Отправляем heartbeat каждые 30 секунд только когда вкладка активна
  useEffect(() => {
    if (!isActive) {
      return; // Не запускаем интервал если вкладка неактивна
    }
    
    const interval = setInterval(sendHeartbeat, PLAYER_CONSTANTS.HEARTBEAT_INTERVAL);
    sendHeartbeat(); // Отправляем сразу
    return () => clearInterval(interval);
  }, [sendHeartbeat, isActive]);

  // Убрали автоматическую остановку при переходе на другую вкладку
  // Музыка теперь продолжает играть в фоне

  // Обработчики управления
  const handlePlayPause = async () => {
    if (!audioRef.current) return;

    // Проверяем время работы
    if (!isWithinWorkingTime()) {
      setError('Время работы истекло');
      return;
    }

    if (playbackState === 'playing') {
      audioRef.current.pause();
      setPlaybackState('paused');
    } else if (playbackState === 'paused') {
      try {
        // Убеждаемся, что звук включен перед возобновлением
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        await audioRef.current.play();
        setPlaybackState('playing');
        setError(null);
      } catch (err) {
        console.error('❌ [WebRadioPlayer] Ошибка возобновления:', err);
        setError('Не удалось возобновить воспроизведение');
        setPlaybackState('error');
      }
    } else if (playbackState === 'stopped' || playbackState === 'error') {
      // Если есть текущий поток или трек, пытаемся возобновить его
      if (currentStream) {
        try {
          await playStream(currentStream);
        } catch (err) {
          console.error('❌ [WebRadioPlayer] Ошибка возобновления потока:', err);
          setError('Не удалось возобновить поток');
        }
      } else if (currentTrack) {
        try {
          await playTrack(currentTrack);
        } catch (err) {
          console.error('❌ [WebRadioPlayer] Ошибка возобновления трека:', err);
          setError('Не удалось возобновить трек');
        }
      } else {
        // Если нет текущего контента, начинаем воспроизведение с начала
        const nextContent = findNextTrack(songsPlayed);
        if (nextContent) {
          if (nextContent.type === 'track') {
            await playTrack(nextContent.content as MusicTrack);
          } else if (nextContent.type === 'stream') {
            await playStream(nextContent.content as RadioStream, (nextContent as any).index);
          }
        } else {
          setError('Нет контента для воспроизведения');
        }
      }
    } else {
      // Начинаем воспроизведение
      const nextContent = findNextTrack(songsPlayed);
      if (nextContent) {
        if (nextContent.type === 'track') {
          await playTrack(nextContent.content as MusicTrack);
        } else if (nextContent.type === 'stream') {
          await playStream(nextContent.content as RadioStream, (nextContent as any).index);
        }
      } else {
        setError('Нет контента для воспроизведения');
      }
    }
  };

     // Обработчик переключения на следующий трек
   const handleNextTrack = async () => {
     if (!audioRef.current) return;
     
     // Останавливаем текущее воспроизведение
     audioRef.current.pause();
     
     // Вызываем handleEnded для переключения на следующий трек
     const audio = audioRef.current;
     if (audio) {
       audio.dispatchEvent(new Event('ended'));
     }
   };


  return (
    <Box className={`web-radio-player ${className || ''}`}>
      {/* Уведомление об отсутствии интернета */}
      {!isOnline && (
        <Paper 
          p="sm" 
          mb="md" 
          radius="md"
          className="web-radio-player-offline-notice"
        >
          <IconWifiOff size={20} color="var(--color-error-500)" />
          <Text size="sm" c="red" fw={500}>
            Нет подключения к интернету
          </Text>
          <Text size="xs" c="dimmed" ml="auto">
            Работа в автономном режиме
          </Text>
        </Paper>
      )}

      <Paper 
        p="xl" 
        radius="lg" 
        shadow="sm"
        className="web-radio-player-container"
      >
        {/* Заголовок с логотипом */}
        <Group justify="space-between" align="center" className="web-radio-player-header">
          <Box className="web-radio-player-date">
            <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-family-primary)' }}>
              {new Date().toLocaleDateString('ru-RU', { 
                month: 'long', 
                year: 'numeric' 
              })} 
            </Text>
            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-family-primary)' }}>
              {new Date().toLocaleDateString('ru-RU')}
            </Text>
          </Box>
          
          <Group gap="xs" align="center" className={`web-radio-player-online-status ${isOnline ? 'online' : 'offline'}`}>
            <IconWifi 
              size={20} 
              color={isOnline ? 'var(--color-success-500)' : 'var(--color-error-500)'} 
            />
            <Text size="xs" c={isOnline ? 'green' : 'red'}>
              {isOnline ? 'Онлайн' : 'Офлайн'}
            </Text>
          </Group>
        </Group>

        {/* Основной контент - кнопка воспроизведения по центру */}
        <Box className="web-radio-player-content">
          {/* Группа кнопок управления */}
          <Group gap="md" align="center" className="web-radio-player-controls">
            {/* Кнопка воспроизведения */}
            <Button
              size="xl"
              radius="xl"
              className={`web-radio-player-play-button ${
                playbackState === 'loading' ? 'loading' : 
                playbackState === 'playing' ? 'playing' : ''
              }`}
              onClick={handlePlayPause}
              disabled={!isWithinWorkingTime() || playbackState === 'loading' || (musicTracks.length === 0 && streams.length === 0)}
            >
              {playbackState === 'loading' ? 
                <div className="web-radio-player-loading-spinner" /> :
                playbackState === 'playing' ? 
                  <IconPlayerPause size={32} className="web-radio-player-icon" /> : 
                  <IconPlayerPlay size={32} className="web-radio-player-icon" />
              }
            </Button>
             
            {/* Кнопка следующего трека - только для пользователей с полным доступом */}
            {hasRadioFullAccess && (
              <Button
                size="lg"
                radius="xl"
                className="web-radio-player-next-button"
                leftSection={<IconPlayerSkipForward size={24} className="web-radio-player-icon" />}
                onClick={handleNextTrack}
                disabled={!isWithinWorkingTime() || (!currentStream && !currentTrack)}
                variant="light"
              >
                Далее
              </Button>
            )}
          </Group>

          {/* Регулятор громкости удален по запросу */}

          {/* Текущий трек/поток */}
          <Box className="web-radio-player-track-info">
            {isPlayingStream && (pendingStream || currentStream) ? (
              <Stack gap="xs" align="center">
                <Text size="xl" fw={600} className="web-radio-player-track-title">
                  📻 {(pendingStream || currentStream)!.name}
                </Text>
                <Text size="sm" c="dimmed" className="web-radio-player-track-subtitle">
                  {(pendingStream || currentStream)!.branchTypeOfDist}
                </Text>
                <Text size="xs" c="dimmed" className="web-radio-player-track-meta">
                  Радио поток
                </Text>
              </Stack>
            ) : (currentTrack || pendingTrack) ? (
              <Stack gap="xs" align="center">
                <Text size="xl" fw={600} className="web-radio-player-track-title">
                  🎵 {(currentTrack || pendingTrack)!.fileName.replace('.mp3', '')}
                </Text>
                <Text size="sm" c="dimmed" className="web-radio-player-track-subtitle">
                  Музыкальный трек
                </Text>
                {musicTracks.length > 0 && (
                  <Text size="xs" c="dimmed" className="web-radio-player-track-meta">
                    Треков: {musicTracks.length} • Сыграно: {songsPlayed}
                  </Text>
                )}
              </Stack>
            ) : (
              <Stack gap="xs" align="center" className="web-radio-player-empty-state">
                <Text size="lg" c="dimmed" ta="center" className="web-radio-player-empty-text">
                  {!isWithinWorkingTime() ? 'Время работы истекло' : 
                   musicLoadingError ? `Ошибка: ${musicLoadingError}` :
                   isLoadingMusic ? 'Загружается музыка...' :
                   musicTracks.length > 0 ? 'Нажмите Play для начала воспроизведения' : 
                   'Музыка не загружена. Проверьте консоль для деталей.'}
                </Text>
                {musicTracks.length > 0 && (
                  <Text size="xs" c="dimmed" className="web-radio-player-empty-description">
                    Треков загружено: {musicTracks.length}
                  </Text>
                )}
                {musicLoadingError && (
                  <Text size="xs" c="red" className="web-radio-player-empty-description">
                    {musicLoadingError}
                  </Text>
                )}
              </Stack>
            )}
          </Box>

          {/* Прогресс воспроизведения */}
          {duration > 0 && (
            <Box className="web-radio-player-progress-container">
              <Box className="web-radio-player-progress-bar">
                <Box 
                  className="web-radio-player-progress-fill"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </Box>
              <Group justify="space-between" gap="xs" className="web-radio-player-progress-time">
                <Text size="xs" c="dimmed">
                  {formatTime(currentTime)}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatTime(duration)}
                </Text>
              </Group>
            </Box>
          )}

        {/* Индикатор буферизации следующего трека */}
        {nextTrackBuffered && (
          <Box className="web-radio-player-buffer-indicator">
            <Text size="xs" c="dimmed" ta="center">
              ✓ Следующий трек готов
            </Text>
          </Box>
        )}

          {/* Прогресс загрузки */}
          {downloadState === 'downloading' && (
            <Box className="web-radio-player-progress-container" style={{ maxWidth: '300px' }}>
              <Progress 
                value={downloadProgress} 
                size="sm" 
                radius="xl"
                style={{ marginBottom: 'var(--space-2)' }}
              />
              <Text size="xs" c="dimmed" ta="center">
                Загружено: {downloadedCount} из {totalFiles} файлов
              </Text>
            </Box>
          )}
        </Box>

        {/* Информация о филиале внизу */}
        <Box className="web-radio-player-footer">
          <Box className="web-radio-player-branch-info">
            <Text size="xl" fw={500} className="web-radio-player-branch-name">
              {branchName}
            </Text>
            <Group gap="xs" align="center" className="web-radio-player-branch-meta">
              <Text size="sm" c="dimmed">
                {localBranchType} ({workingTime.start} — {workingTime.end})
              </Text>
              <Button
                variant="subtle"
                size="xs"
                color="blue"
                className="web-radio-player-footer-button"
                onClick={openBranchTypeModal}
              >
                Сменить формат
              </Button>
              <Button
                variant="subtle"
                size="xs"
                color="blue"
                className="web-radio-player-footer-button"
                onClick={openStreamsModal}
                leftSection={<IconSettings size={12} />}
              >
                Управление потоками
              </Button>
              {onTimeChange && (
                <Button
                  variant="subtle"
                  size="xs"
                  color="blue"
                  className="web-radio-player-footer-button"
                  onClick={openTimeModal}
                  leftSection={<IconClock size={12} />}
                >
                  Изменить время
                </Button>
              )}
            </Group>
          </Box>
          
          <Box className="web-radio-player-footer-status">
            <Group gap="xs" align="center" className="web-radio-player-status-item">
              <IconClock size={16} color="var(--theme-text-secondary)" />
              <Text size="xs" c="dimmed">
                {isWithinWorkingTime() ? 'Рабочее время' : 'Вне рабочего времени'}
              </Text>
            </Group>
            <Group gap="xs" align="center" className="web-radio-player-status-item">
              <IconBug size={14} color="var(--theme-text-secondary)" />
              <Text size="xs" c="dimmed">
                Версия: {PLAYER_CONSTANTS.VERSION}
              </Text>
            </Group>
            {downloadState === 'complete' && (
              <Text size="xs" c="dimmed" className="web-radio-player-status-item">
                Готово: {downloadedCount} файлов • v{PLAYER_CONSTANTS.VERSION}
              </Text>
            )}
          </Box>
        </Box>
      </Paper>

      

      {/* Ошибки */}
      {error && (
        <Paper 
          p="sm" 
          radius="md" 
          mt="md"
          style={{ 
            background: 'var(--color-error-100)', 
            
          }}
        >
          <Text size="sm" c="red">
            {error}
          </Text>
        </Paper>
      )}

      {/* Скрытый аудио элемент */}
      <audio 
        ref={audioRef} 
        preload="auto"
        crossOrigin="anonymous"
        playsInline
        controls={false}
        muted={false}
        style={{ display: 'none' }}
      />

      {/* Модальное окно для управления потоками */}
      <CustomModal
        opened={streamsModalOpen}
        onClose={closeStreamsModal}
        title="Управление потоками"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Выберите потоки, которые хотите отключить. Отключенные потоки не будут воспроизводиться.
          </Text>
          <Text size="xs" c="dimmed">
            Формат филиала: <strong>{localBranchType}</strong>
          </Text>
          
          <Divider />
          
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              Потоки для формата &quot;{localBranchType}&quot; ({streamsForCurrentBranchType.length})
            </Text>
            <Group gap="xs">
              <Button
                variant="subtle"
                size="xs"
                color="red"
                onClick={disableAllStreams}
                disabled={streamsForCurrentBranchType.length === 0}
              >
                Отключить все
              </Button>
              <Button
                variant="subtle"
                size="xs"
                color="green"
                onClick={enableAllStreams}
              >
                Включить все
              </Button>
            </Group>
          </Group>
          
          {streamsForCurrentBranchType.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="md">
              Нет доступных потоков для формата &quot;{localBranchType}&quot;
            </Text>
          ) : (
            <Stack gap="xs" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {streamsForCurrentBranchType.map((stream) => {
                const isDisabled = tempDisabledStreams.has(stream.id);
                return (
                  <Checkbox
                    key={stream.id}
                    label={stream.name || 'Без названия'}
                    checked={!isDisabled}
                    onChange={() => toggleStream(stream.id)}
                    size="sm"
                  />
                );
              })}
            </Stack>
          )}
          
          <Divider />
          
          <Group justify="flex-end" mt="md">
            <Button
              variant="subtle"
              onClick={closeStreamsModal}
            >
              Отмена
            </Button>
            <Button
              color="blue"
              onClick={saveStreamsChanges}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      </CustomModal>

      {/* Модальное окно для выбора типа филиала */}
      <CustomModal
        opened={branchTypeModalOpen}
        onClose={closeBranchTypeModal}
        title="Выбор формата филиала"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Выберите формат филиала для воспроизведения подходящих радио потоков
          </Text>
          
          <Select
            label="Тип филиала"
            placeholder="Выберите тип филиала"
            value={tempBranchType}
            onChange={(value) => setTempBranchType(value || 'Магазин')}
            data={[
              { value: 'Магазин', label: 'Магазин' },
              { value: 'Самообслуживание', label: 'Самообслуживание' },
              { value: 'Конвеер', label: 'Конвеер' },
              { value: 'Технопоинт', label: 'Технопоинт' }
            ]}
          />
          
          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              onClick={closeBranchTypeModal}
            >
              Отмена
            </Button>
            <Button
              onClick={saveBranchTypeChanges}
              disabled={!tempBranchType}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      </CustomModal>

      {/* Модальное окно для смены времени */}
      <CustomModal
        opened={timeModalOpen}
        onClose={closeTimeModal}
        title="Настройка времени воспроизведения"
        icon={<IconClock size={20} />}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Укажите время начала и окончания воспроизведения музыки
          </Text>
          
          <Group grow>
            <Stack gap="xs">
              <Text size="sm" fw={500}>Время начала</Text>
              <TextInput
                type="time"
                value={tempTimeStart}
                onChange={(e) => setTempTimeStart(e.target.value)}
                placeholder="HH:MM"
              />
            </Stack>
            
            <Stack gap="xs">
              <Text size="sm" fw={500}>Время окончания</Text>
              <TextInput
                type="time"
                value={tempTimeEnd}
                onChange={(e) => setTempTimeEnd(e.target.value)}
                placeholder="HH:MM"
              />
            </Stack>
          </Group>
          
          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              onClick={closeTimeModal}
            >
              Отмена
            </Button>
            <Button
              onClick={saveTimeChanges}
              disabled={!tempTimeStart || !tempTimeEnd}
            >
              Сохранить
            </Button>
          </Group>
        </Stack>
      </CustomModal>
    </Box>
  );
};

export default WebRadioPlayer;
