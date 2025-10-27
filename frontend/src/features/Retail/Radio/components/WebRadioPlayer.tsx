import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Paper, 
  Group, 
  Button, 
  Text, 
  Stack, 
  Progress,
  Box,
  TextInput
} from '@mantine/core';
import { 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconClock,
  IconWifi, 
  IconWifiOff,
  IconBug,
  IconPlayerSkipForward
} from '@tabler/icons-react';
import { CustomModal } from '../../../../utils/CustomModal';
import { API } from '../../../../config/constants';
import { useUserContext } from '../../../../hooks/useUserContext';
import { useAccessContext } from '../../../../hooks/useAccessContext';

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
  
  // Состояние воспроизведения
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [downloadState] = useState<DownloadState>('idle');
  // const [volume, setVolume] = useState(80);
  // const [isMuted, setIsMuted] = useState(false);
  
  // Состояние контента
  const [currentStream, setCurrentStream] = useState<RadioStream | null>(null);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [streams, setStreams] = useState<RadioStream[]>([]);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [songsPlayed, setSongsPlayed] = useState(0);
  const [isPlayingStream, setIsPlayingStream] = useState(false);
  const [currentStreamIndex, setCurrentStreamIndex] = useState(0);
  const [lastTrackIndex, setLastTrackIndex] = useState(-1);
  
  // Состояние UI
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [downloadProgress] = useState(0);
  const [downloadedCount] = useState(0);
  const [totalFiles] = useState(0);
  
  // Состояние для прогресс-бара
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // const [isSeeking, setIsSeeking] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);

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
        branchType: branchType,
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
  }, [branchType, user?.email, getBrowserFingerprint, userIP, isActive]);

  // Загрузка папок с музыкой
  const loadMusicFolders = useCallback(async () => {
    try {
      const response = await fetch(`${API}/radio/folders`);
      if (!response.ok) {
        throw new Error('Ошибка загрузки папок с музыкой');
      }
      
      const data = await response.json();
            if (data.success && data.folders && data.folders.length > 0) {
              // Берем первую папку (текущий месяц)
              const currentFolder = data.folders[0];
              // console.log('🎵 [WebRadioPlayer] Текущая папка с музыкой:', currentFolder.name);
              return currentFolder.name;
            }
      return null;
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка загрузки папок с музыкой:', err);
      return null;
    }
  }, []);

  // Загрузка музыки из папки
  const loadMusicFromFolder = useCallback(async (folderName: string) => {
    try {
      const response = await fetch(`${API}/radio/folder/${folderName}/music`);
      if (!response.ok) {
        throw new Error('Ошибка загрузки музыки');
      }
      
      const data = await response.json();
      if (data.success && data.files) {
        const musicTracks = data.files
          .sort((a: any, b: any) => a.name.localeCompare(b.name)) // Дополнительная сортировка по имени
          .map((file: any, index: number) => ({
            id: `${file.name}_${index}`, // Уникальный ID
            fileName: file.name,
            url: `${API}/public/retail/radio/music/${folderName}/${file.name}`,
            isDownloaded: false, // В веб-версии не скачиваем файлы
            fileSize: file.size || 0,
            index: index // Добавляем индекс для сортировки
          }));
        setMusicTracks(musicTracks);
        // console.log('🎵 [WebRadioPlayer] Загружено треков:', musicTracks.length);
        // console.log('🎵 [WebRadioPlayer] Порядок треков:', musicTracks.map((t: any) => `${t.index}: ${t.fileName}`));
        return musicTracks;
      }
      return [];
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка загрузки музыки:', err);
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
        // Сбрасываем индекс потока при загрузке новых потоков
        setCurrentStreamIndex(0);
        
        // Автоматически выбираем первый активный поток
        const activeStreams = data.data.filter((stream: RadioStream) => stream.isActive);
        if (activeStreams.length > 0) {
          const firstStream = activeStreams[0];
          setCurrentStream(firstStream);
        }
      }
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка загрузки потоков:', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    }
  }, []);

  // Инициализация при загрузке компонента
  useEffect(() => {
    const initializePlayer = async () => {
      // Получаем IP пользователя
      await getUserIP();
      
      await loadStreams();
      const folderName = await loadMusicFolders();
      if (folderName) {
        await loadMusicFromFolder(folderName);
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
    } catch {
      setIsOnline(false);
    }
  }, []);

  // Проверка времени работы
  useEffect(() => {
    const interval = setInterval(() => {
      const withinTime = isWithinWorkingTime();
      if (!withinTime && playbackState === 'playing') {
        setPlaybackState('stopped');
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
    }, 10000); // Проверяем каждые 10 секунд

    return () => clearInterval(interval);
  }, [isWithinWorkingTime, playbackState]);

  // Проверка интернета
  useEffect(() => {
    const interval = setInterval(checkInternetConnection, 10000);
    checkInternetConnection(); // Проверяем сразу
    return () => clearInterval(interval);
  }, [checkInternetConnection]);

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
        appVersion: '1.1.3',
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
    const shouldPlayStream = songsCount > 0 && (songsCount + 1) % 4 === 0;
    
    if (shouldPlayStream && streams.length > 0) {
      // Получаем только активные потоки
      const activeStreams = streams.filter(stream => stream.isActive);
      
      if (activeStreams.length > 0) {
        // Выбираем следующий поток по порядку
        const nextStream = activeStreams[currentStreamIndex % activeStreams.length];
        return { type: 'stream', content: nextStream };
      }
    }
    
    // Иначе играем следующий музыкальный трек
    if (musicTracks.length > 0) {
      // Используем lastTrackIndex для расчета следующего трека
      const currentIndex = lastTrackIndex >= 0 ? lastTrackIndex : -1;
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % musicTracks.length : 0;
      const nextTrack = musicTracks.find(track => track.index === nextIndex);
      
      if (nextTrack) {
        return { type: 'track', content: nextTrack };
      }
    }
    
    return null;
  }, [streams, musicTracks, currentStreamIndex, lastTrackIndex]);

  // Воспроизведение трека
  const playTrack = useCallback(async (track: MusicTrack) => {
    if (!audioRef.current) return;
    
    try {
      setPlaybackState('loading');
      setCurrentTrack(track);
      setLastTrackIndex(track.index); // Сохраняем индекс последнего трека
      setCurrentStream(null);
      setIsPlayingStream(false);
      
      audioRef.current.src = track.url;
      await audioRef.current.play();
      setPlaybackState('playing');
      setError(null);
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка воспроизведения трека:', err);
      setError('Не удалось воспроизвести трек');
      setPlaybackState('error');
    }
  }, []);

  // Воспроизведение потока
  const playStream = useCallback(async (stream: RadioStream) => {
    if (!audioRef.current) return;
    
    // Проверяем, что поток активен и имеет файл
    if (!stream.isActive) {
      console.error('❌ [WebRadioPlayer] Поток неактивен:', stream.name);
      setError('Поток неактивен');
      setPlaybackState('error');
      return;
    }

    if (!stream.attachment) {
      console.error('❌ [WebRadioPlayer] У потока нет файла:', stream.name);
      setError('У потока нет файла для воспроизведения');
      setPlaybackState('error');
      return;
    }

    try {
      setPlaybackState('loading');
      setCurrentStream(stream);
      setIsPlayingStream(true);
      
      const streamUrl = `${API}/radio/stream/${stream.id}/play`;
      
      audioRef.current.src = streamUrl;
      await audioRef.current.play();
      setPlaybackState('playing');
      setError(null);
    } catch (err) {
      console.error('❌ [WebRadioPlayer] Ошибка воспроизведения потока:', err);
      setError('Не удалось воспроизвести поток');
      setPlaybackState('error');
    }
  }, []);

  // Обработчики событий аудио
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (audio) {
        setDuration(audio.duration || 0);
      }
    };

                                                                             const handleEnded = async () => {
       let nextSongsPlayed = songsPlayed;
       
       if (isPlayingStream) {
         // Если играл поток, сбрасываем флаг и переключаемся на музыку
         setIsPlayingStream(false);
         setCurrentStream(null);
         // Увеличиваем индекс потока для следующего воспроизведения
         setCurrentStreamIndex(prev => prev + 1);
         // После потока увеличиваем счетчик на 1, чтобы начать новый цикл из 3 треков
         // Например: было 3 трека (songsPlayed=3) -> поток -> songsPlayed=4 (первый трек новой группы)
         nextSongsPlayed = songsPlayed + 1;
         setSongsPlayed(nextSongsPlayed);
       } else {
        // Если играл трек, проверяем, не завершился ли цикл
        if (currentTrack && musicTracks.length > 0) {
          const currentIndex = currentTrack.index;
          const lastIndex = musicTracks.length - 1;
          
          if (currentIndex === lastIndex) {
            // Цикл завершен, сбрасываем счетчик на 1
            nextSongsPlayed = 1;
            setSongsPlayed(1);
          } else {
            // Увеличиваем счетчик только если цикл не завершен
            nextSongsPlayed = songsPlayed + 1;
            setSongsPlayed(nextSongsPlayed);
          }
        } else {
          nextSongsPlayed = songsPlayed + 1;
          setSongsPlayed(nextSongsPlayed);
        }
      }
      
      // Вычисляем следующий контент с учетом обновленного счетчика
      const nextContent = findNextTrack(nextSongsPlayed);
      
             if (nextContent) {
         if (nextContent.type === 'track') {
           await playTrack(nextContent.content as MusicTrack);
         } else if (nextContent.type === 'stream') {
           await playStream(nextContent.content as RadioStream);
         }
       } else {
         setPlaybackState('stopped');
       }
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
            break;
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
    };

    const handleStalled = () => {
      // Не меняем состояние, просто логируем - браузер попытается восстановить
    };

    const handleWaiting = () => {
      // Не меняем состояние, просто логируем - браузер попытается восстановить
    };

    const handleCanPlay = () => {
      // Аудио готово к воспроизведению
    };

    const handleCanPlayThrough = () => {
      // Аудио готово к воспроизведению без прерываний
    };

    const handleLoadStart = () => {
      // Начало загрузки аудио
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
  }, [findNextTrack, playTrack, playStream, isPlayingStream]);

  // Отправляем heartbeat каждые 30 секунд только когда вкладка активна
  useEffect(() => {
    if (!isActive) {
      return; // Не запускаем интервал если вкладка неактивна
    }
    
    const interval = setInterval(sendHeartbeat, 30000);
    sendHeartbeat(); // Отправляем сразу
    return () => clearInterval(interval);
  }, [sendHeartbeat, isActive]);

  // Контроль активности вкладки - останавливаем плеер при переключении
  useEffect(() => {
    if (!isActive && playbackState === 'playing') {
      // console.log('🔄 [WebRadioPlayer] Вкладка неактивна, останавливаем плеер');
      setPlaybackState('paused');
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [isActive, playbackState]);

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
            await playStream(nextContent.content as RadioStream);
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
          await playStream(nextContent.content as RadioStream);
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
          style={{
            background: 'var(--color-error-100)',

            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)'
          }}
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
        style={{
          background: 'var(--theme-bg-elevated)',

          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          minHeight: '500px',
          position: 'relative'
        }}
      >
        {/* Заголовок с логотипом */}
        <Group justify="space-between" align="center" mb="xl">
          <Group gap="md" align="center">
            <Box>
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
          </Group>
          
          <Group gap="xs" align="center">
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
        <Box
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            gap: 'var(--space-4)'
          }}
        >
                     {/* Группа кнопок управления */}
           <Group gap="md" align="center">
             {/* Кнопка воспроизведения */}
             <Button
               size="xl"
               radius="xl"
               leftSection={
                 playbackState === 'loading' ? 
                   <div style={{ 
                     width: '32px', 
                     height: '32px', 
                     
                     borderTop: '3px solid transparent', 
                     borderRadius: '50%', 
                     animation: 'spin 1s linear infinite' 
                   }} /> :
                   playbackState === 'playing' ? 
                     <IconPlayerPause size={32} /> : 
                     <IconPlayerPlay size={32} />
               }
               onClick={handlePlayPause}
               disabled={!isWithinWorkingTime() || (!currentStream && !currentTrack) || playbackState === 'loading'}
               style={{
                 width: '80px',
                 height: '80px',
                 background: playbackState === 'loading' ? 
                   'linear-gradient(135deg, var(--color-gray-500), var(--color-gray-600))' :
                   'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                 border: 'none',
                 boxShadow: 'var(--theme-shadow-lg)',
                 borderRadius: '50%',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center'
               }}
             />
             
                           {/* Кнопка следующего трека - только для пользователей с полным доступом */}
              {hasRadioFullAccess && (
                <Button
                  size="lg"
                  radius="xl"
                  leftSection={<IconPlayerSkipForward size={24} />}
                  onClick={handleNextTrack}
                  disabled={!isWithinWorkingTime() || (!currentStream && !currentTrack)}
                  variant="light"
                  style={{
                    background: 'var(--theme-bg-elevated)',
                    border: '1px solid var(--theme-border)',
                    boxShadow: 'var(--theme-shadow-sm)'
                  }}
                >
                  Далее
                </Button>
              )}
           </Group>

          {/* Текущий трек/поток */}
          <Box style={{ textAlign: 'center', maxWidth: '400px' }}>
            {isPlayingStream && currentStream ? (
              <Stack gap="xs" align="center">
                <Text size="xl" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                  📻 {currentStream.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {currentStream.branchTypeOfDist}
                </Text>
                <Text size="xs" c="dimmed">
                  Радио поток
                </Text>
              </Stack>
            ) : currentTrack ? (
              <Stack gap="xs" align="center">
                <Text size="xl" fw={600} style={{ color: 'var(--theme-text-primary)' }}>
                  🎵 {currentTrack.fileName.replace('.mp3', '')}
                </Text>
                <Text size="sm" c="dimmed">
                  Музыкальный трек
                </Text>
                {musicTracks.length > 0 && (
                  <Text size="xs" c="dimmed">
                    Треков: {musicTracks.length} • Сыграно: {songsPlayed}
                  </Text>
                )}
              </Stack>
            ) : (
              <Stack gap="xs" align="center">
                <Text size="lg" c="dimmed" ta="center">
                  {!isWithinWorkingTime() ? 'Время работы истекло' : 
                   musicTracks.length > 0 ? 'Нажмите Play для начала воспроизведения' : 'Загружается музыка...'}
                </Text>
                {musicTracks.length > 0 && (
                  <Text size="xs" c="dimmed">
                    Треков загружено: {musicTracks.length}
                  </Text>
                )}
              </Stack>
            )}
          </Box>

          {/* Прогресс воспроизведения */}
          {duration > 0 && (
            <Box style={{ width: '100%', maxWidth: '400px' }}>
              <Progress 
                value={(currentTime / duration) * 100} 
                size="md" 
                radius="xl"
                style={{ marginBottom: 'var(--space-2)' }}
              />
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed">
                  {formatTime(currentTime)}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatTime(duration)}
                </Text>
              </Group>
            </Box>
          )}

          {/* Прогресс загрузки */}
          {downloadState === 'downloading' && (
            <Box style={{ width: '100%', maxWidth: '300px' }}>
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
        <Box
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '24px',
            right: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}
        >
          <Box>
            <Text size="xl" fw={500} style={{ color: 'var(--theme-text-primary)' }}>
              {branchName}
            </Text>
            <Group gap="xs" align="center" mt="xs">
              <Text size="sm" c="dimmed">
                {branchType} ({workingTime.start} — {workingTime.end})
              </Text>
              {onTimeChange && (
                <Button
                  variant="subtle"
                  size="xs"
                  color="blue"
                  onClick={openTimeModal}
                  leftSection={<IconClock size={12} />}
                >
                  Изменить
                </Button>
              )}
            </Group>
          </Box>
          
          <Box style={{ textAlign: 'right' }}>
            <Group gap="xs" align="center" mb="xs">
              <IconClock size={16} color="var(--theme-text-secondary)" />
              <Text size="xs" c="dimmed">
                {isWithinWorkingTime() ? 'Рабочее время' : 'Вне рабочего времени'}
              </Text>
            </Group>
            <Group gap="xs" align="center">
              <IconBug size={14} color="var(--theme-text-secondary)" />
              <Text size="xs" c="dimmed">
                Версия: 1.1.3
              </Text>
            </Group>
            {downloadState === 'complete' && (
              <Text size="xs" c="dimmed">
                Готово: {downloadedCount} файлов • v1.1.3
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
        style={{ display: 'none' }}
      />

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
