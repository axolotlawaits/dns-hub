import { 
  Button, 
  Paper, 
  PasswordInput, 
  TextInput, 
  Title, 
  ActionIcon, 
  Avatar, 
  Text, 
  Group,
  Stack,
  Card,
  Box,
  Container,
  Transition,
  Alert,
  ThemeIcon,
  Divider
} from '@mantine/core';
import { useState, useCallback, useMemo, useEffect, memo, useRef } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { useNavigate } from 'react-router';
import { API } from '../config/constants';
import './styles/Login.css';
import { useWeather, Weather } from './Weather';
import { useThemeContext } from '../hooks/useThemeContext';
import { 
  IconBrightnessDown, 
  IconMoon, 
  IconUser, 
  IconLock, 
  IconLogin,
  IconArrowRight,
  IconRefresh,
  IconAlertCircle,
  IconCheck
} from '@tabler/icons-react';
import { formatName } from '../utils/format';

// Типы вынесены в начало для лучшей читаемости
type LoginType = { login: string; pass: string };
type ValidationType = Partial<Record<keyof LoginType, string>>;
type Season = 'winter' | 'spring' | 'summer' | 'autumn';
type TimeOfDay = 'night' | 'morning' | 'day' | 'evening';
// PhotoInfo удален - используем только цвета фона
type UserInfo = { photo: string | null; name: string; login: string };

// Константы вынесены в отдельный блок
const BACKGROUND_UPDATE_INTERVAL = 300000;
const LAST_LOGIN_KEY = 'lastLogin';
const LAST_USER_INFO_KEY = 'lastUserInfo';

// Вспомогательные функции вынесены за пределы компонента
const getSeason = (): Season => {
  const month = new Date().getMonth();
  
  // Более точное определение сезонов
  if (month === 11 || month === 0 || month === 1) {
    return 'winter'; // Декабрь, Январь, Февраль
  } else if (month === 2 || month === 3 || month === 4) {
    return 'spring'; // Март, Апрель, Май
  } else if (month === 5 || month === 6 || month === 7) {
    return 'summer'; // Июнь, Июль, Август
  } else {
    return 'autumn'; // Сентябрь, Октябрь, Ноябрь
  }
};

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  return hour < 5 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
};

// Прокси-серверы удалены - используем официальный Unsplash API

// getContextualImage удалена - используем только цвета фона

// Прокси-функция удалена - используем официальный Unsplash API

// Функция для создания градиентного фона с извилистыми линиями
const getContextualGradientBackground = (
  season: Season, 
  timeOfDay: TimeOfDay, 
  weatherCondition: string, 
  temperature?: number,
  humidity?: number,
  windSpeed?: number,
  pressure?: number,
  visibility?: number,
  uvIndex?: number,
  latitude?: number,
  longitude?: number,
  elevation?: number,
  isWeekend?: boolean
): string => {
  
  // Определяем цвета для всех линий
  const getLineColors = () => {
    const colors = {
      // Основные линии
      sun: '#FFD700',
      temperature: '#FF6B35',
      weather: '#4A90E2',
      time: '#9370DB',
      season: '#50C878',
      
      // Новые линии
      humidity: '#20B2AA',      // Морская волна
      wind: '#87CEEB',          // Небесно-голубой
      pressure: '#DDA0DD',      // Сливовый
      visibility: '#F0E68C',    // Хаки
      uv: '#FF6347',            // Томатный
      elevation: '#8B4513',     // Седло-коричневый
      coordinates: '#FF1493',   // Глубокий розовый
      weekend: '#32CD32'        // Лаймовый
    };

    // Корректируем цвета в зависимости от погодных условий
    switch (weatherCondition) {
      case 'clear':
        colors.sun = '#FFD700';
        colors.weather = '#87CEEB';
        break;
      case 'cloudy':
        colors.sun = '#D3D3D3';
        colors.weather = '#708090';
        break;
      case 'rain':
        colors.sun = '#708090';
        colors.weather = '#4682B4';
        break;
      case 'snow':
        colors.sun = '#F0F8FF';
        colors.weather = '#F0F8FF';
        break;
    }

    // Корректируем цвет температуры
    if (temperature !== undefined) {
      if (temperature < -10) colors.temperature = '#0000FF';
      else if (temperature < 0) colors.temperature = '#87CEEB';
      else if (temperature < 10) colors.temperature = '#4169E1';
      else if (temperature < 20) colors.temperature = '#32CD32';
      else if (temperature < 30) colors.temperature = '#FF8C00';
      else colors.temperature = '#FF4500';
    }

    // Корректируем цвет влажности
    if (humidity !== undefined) {
      if (humidity < 30) colors.humidity = '#FF4500';      // Сухо - красный
      else if (humidity < 50) colors.humidity = '#FF8C00'; // Умеренно - оранжевый
      else if (humidity < 70) colors.humidity = '#20B2AA'; // Нормально - морская волна
      else colors.humidity = '#0000FF';                    // Влажно - синий
    }

    // Корректируем цвет ветра
    if (windSpeed !== undefined) {
      if (windSpeed < 5) colors.wind = '#90EE90';          // Штиль - светло-зеленый
      else if (windSpeed < 15) colors.wind = '#87CEEB';    // Легкий ветер - небесно-голубой
      else if (windSpeed < 30) colors.wind = '#4169E1';    // Умеренный ветер - синий
      else colors.wind = '#8B0000';                        // Сильный ветер - темно-красный
    }

    // Корректируем цвет давления
    if (pressure !== undefined) {
      if (pressure < 1000) colors.pressure = '#FF0000';    // Низкое давление - красный
      else if (pressure < 1020) colors.pressure = '#FFA500'; // Нормальное - оранжевый
      else colors.pressure = '#0000FF';                    // Высокое - синий
    }

    // Корректируем цвет видимости
    if (visibility !== undefined) {
      if (visibility < 1) colors.visibility = '#800080';   // Туман - фиолетовый
      else if (visibility < 5) colors.visibility = '#FFA500'; // Дымка - оранжевый
      else colors.visibility = '#00FF00';                  // Ясно - зеленый
    }

    // Корректируем цвет УФ-индекса
    if (uvIndex !== undefined) {
      if (uvIndex < 3) colors.uv = '#00FF00';              // Низкий - зеленый
      else if (uvIndex < 6) colors.uv = '#FFFF00';         // Умеренный - желтый
      else if (uvIndex < 8) colors.uv = '#FF8C00';         // Высокий - оранжевый
      else colors.uv = '#FF0000';                          // Очень высокий - красный
    }

    // Корректируем цвет высоты
    if (elevation !== undefined) {
      if (elevation < 100) colors.elevation = '#228B22';   // Низменность - зеленый
      else if (elevation < 500) colors.elevation = '#8B4513'; // Равнина - коричневый
      else if (elevation < 1000) colors.elevation = '#A0522D'; // Холмы - сиена
      else colors.elevation = '#FFFFFF';                   // Горы - белый
    }

    // Корректируем цвет времени
    switch (timeOfDay) {
      case 'night': colors.time = '#2C3E50'; break;
      case 'morning': colors.time = '#FFB347'; break;
      case 'day': colors.time = '#FFD700'; break;
      case 'evening': colors.time = '#FF6347'; break;
    }

    // Корректируем цвет сезона
    switch (season) {
      case 'winter': colors.season = '#E8F4FD'; break;
      case 'spring': colors.season = '#98FB98'; break;
      case 'summer': colors.season = '#FFA500'; break;
      case 'autumn': colors.season = '#D2691E'; break;
    }

    // Корректируем цвет дня недели
    if (isWeekend) {
      colors.weekend = '#FF69B4'; // Розовый для выходных
    } else {
      colors.weekend = '#32CD32'; // Зеленый для рабочих дней
    }

    return colors;
  };

  const colors = getLineColors();

  // Создаем расширенный SVG с множеством линий
  const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="mainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" style="stop-color:${colors.season};stop-opacity:0.8" />
<stop offset="33%" style="stop-color:${colors.time};stop-opacity:0.6" />
<stop offset="66%" style="stop-color:${colors.weather};stop-opacity:0.7" />
<stop offset="100%" style="stop-color:${colors.temperature};stop-opacity:0.8" />
</linearGradient>
<linearGradient id="humidityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.humidity};stop-opacity:0.4" />
<stop offset="100%" style="stop-color:${colors.humidity};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="windGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.wind};stop-opacity:0.3" />
<stop offset="100%" style="stop-color:${colors.wind};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="pressureGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.pressure};stop-opacity:0.3" />
<stop offset="100%" style="stop-color:${colors.pressure};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="visibilityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.visibility};stop-opacity:0.3" />
<stop offset="100%" style="stop-color:${colors.visibility};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="uvGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.uv};stop-opacity:0.4" />
<stop offset="100%" style="stop-color:${colors.uv};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="elevationGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.elevation};stop-opacity:0.3" />
<stop offset="100%" style="stop-color:${colors.elevation};stop-opacity:0.1" />
</linearGradient>
<linearGradient id="coordinatesGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.coordinates};stop-opacity:0.2" />
<stop offset="100%" style="stop-color:${colors.coordinates};stop-opacity:0.05" />
</linearGradient>
<linearGradient id="weekendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
<stop offset="0%" style="stop-color:${colors.weekend};stop-opacity:0.3" />
<stop offset="100%" style="stop-color:${colors.weekend};stop-opacity:0.1" />
</linearGradient>
</defs>
<rect width="100%" height="100%" fill="url(#mainGradient)" />
<path d="M0,80 Q200,40 400,80 T800,60 T1200,70 T1600,50 T1920,65" stroke="url(#humidityGradient)" stroke-width="2" fill="none" opacity="0.6" />
<path d="M0,150 Q300,100 600,150 T1000,130 T1400,140 T1800,120 T1920,135" stroke="url(#windGradient)" stroke-width="3" fill="none" opacity="0.5" />
<path d="M0,220 Q250,170 500,220 T900,200 T1300,210 T1700,190 T1920,205" stroke="url(#pressureGradient)" stroke-width="2" fill="none" opacity="0.4" />
<path d="M0,300 Q350,250 700,300 T1100,280 T1500,290 T1900,270 T1920,285" stroke="url(#visibilityGradient)" stroke-width="2" fill="none" opacity="0.5" />
<path d="M0,380 Q200,330 400,380 T800,360 T1200,370 T1600,350 T1920,365" stroke="url(#uvGradient)" stroke-width="3" fill="none" opacity="0.4" />
<path d="M0,460 Q400,410 800,460 T1200,440 T1600,450 T1920,435" stroke="url(#elevationGradient)" stroke-width="2" fill="none" opacity="0.3" />
<path d="M0,540 Q300,490 600,540 T1000,520 T1400,530 T1800,510 T1920,525" stroke="url(#coordinatesGradient)" stroke-width="1" fill="none" opacity="0.2" />
<path d="M0,620 Q250,570 500,620 T900,600 T1300,610 T1700,590 T1920,605" stroke="url(#weekendGradient)" stroke-width="2" fill="none" opacity="0.3" />
<circle cx="200" cy="100" r="1.5" fill="${colors.humidity}" opacity="0.4" />
<circle cx="600" cy="200" r="2" fill="${colors.wind}" opacity="0.3" />
<circle cx="1000" cy="300" r="1" fill="${colors.pressure}" opacity="0.4" />
<circle cx="1400" cy="400" r="1.5" fill="${colors.visibility}" opacity="0.3" />
<circle cx="400" cy="500" r="2" fill="${colors.uv}" opacity="0.4" />
<circle cx="1200" cy="600" r="1" fill="${colors.elevation}" opacity="0.3" />
<circle cx="800" cy="700" r="1.5" fill="${colors.coordinates}" opacity="0.2" />
<circle cx="1600" cy="800" r="1" fill="${colors.weekend}" opacity="0.3" />
</svg>`;

  const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;

  return dataUrl;
};

// Внешние API функции удалены - используем только локальные источники

// Все API функции удалены

// Все API функции удалены - используем только цвета фона

// Функция для получения расширенного контекстного фона
const getContextualBackground = (
  season: Season, 
  timeOfDay: TimeOfDay, 
  weatherCondition: string, 
  temperature: number,
  humidity?: number,
  windSpeed?: number,
  pressure?: number,
  visibility?: number,
  uvIndex?: number,
  latitude?: number,
  longitude?: number,
  elevation?: number,
  isWeekend?: boolean
) => {
  const backgroundImage = getContextualGradientBackground(
    season, timeOfDay, weatherCondition, temperature, humidity, windSpeed, 
    pressure, visibility, uvIndex, latitude, longitude, elevation, isWeekend
  );
  
    return {
    backgroundImage,
    season,
    timeOfDay,
    weatherCondition,
    temperature,
    humidity,
    windSpeed,
    pressure,
    visibility,
    uvIndex,
    latitude,
    longitude,
    elevation,
    isWeekend
  };
};

const fetchBackgroundImage = async (
  season: Season, 
  timeOfDay: TimeOfDay, 
  weatherCondition: string, 
  temperature?: number,
  humidity?: number,
  windSpeed?: number,
  pressure?: number,
  visibility?: number,
  uvIndex?: number,
  latitude?: number,
  longitude?: number,
  elevation?: number,
  isWeekend?: boolean
) => {
  // Используем реальную температуру или 0°C как fallback для зимы
  const actualTemperature = temperature !== undefined ? temperature : 0;
  
  const background = getContextualBackground(
    season, timeOfDay, weatherCondition, actualTemperature, humidity, windSpeed, 
    pressure, visibility, uvIndex, latitude, longitude, elevation, isWeekend
  );
  
  
  return background;
};

// Функция для генерации инициалов из имени
const generateInitials = (name: string): string => {
  if (!name) return '?';
  
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  
  // Берем первую букву имени и первую букву фамилии
  const firstName = words[0];
  const lastName = words[words.length - 1];
  
  return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
};

const fetchUserInfo = async (login: string): Promise<UserInfo> => {
  try {
    const response = await fetch(`${API}/user/last-user/${login}`);
    if (!response.ok) throw new Error('User not found');
    
    const data = await response.json();
    const formattedName = formatName(data.name) || login;
    
    return {
      photo: data.image && data.image !== null ? `data:image/jpeg;base64,${data.image}` : null, // null если нет фото или фото равно null
      name: formattedName,
      login: data.login
    };
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return {
      photo: null, // null если нет фото
      name: login,
      login: login
    };
  }
};

// Оптимизированные компоненты с React.memo
const ThemeToggleButton = memo(({ isDark, toggleTheme }: { isDark: Boolean | null; toggleTheme: () => void }) => (
  <ActionIcon 
    onClick={toggleTheme} 
    size="lg" 
    variant="subtle" 
    color="gray"
    aria-label="Toggle theme"
    className="theme-toggle"
  >
    {isDark ? <IconMoon size={20} /> : <IconBrightnessDown size={20} />}
  </ActionIcon>
));

const UserProfileCard = memo(({ userInfo }: { userInfo: UserInfo }) => (
  <Card 
    p="md" 
    shadow="lg" 
    radius="lg" 
    mb="xl" 
    className="user-profile-card"
    style={{ 
      background: 'var(--theme-bg-elevated)',
      border: '1px solid var(--theme-border)',
      textAlign: 'center'
    }}
  >
    <Stack align="center" gap="xs">
      <Avatar 
        src={userInfo.photo} 
        size="xl" 
        radius="xl"
        className="user-avatar"
        style={{
          background: userInfo.photo && userInfo.photo !== null ? undefined : 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
          color: userInfo.photo && userInfo.photo !== null ? undefined : 'white',
          fontWeight: 'bold',
          fontSize: '24px'
        }}
      >
        {(!userInfo.photo || userInfo.photo === null) && generateInitials(userInfo.name)}
      </Avatar>
      <Box>
        <Text size="lg" fw={600} c="var(--theme-text-primary)">
          {userInfo.name}
        </Text>
        <Text size="sm" c="var(--theme-text-secondary)">
          @{userInfo.login}
        </Text>
      </Box>
      <Group gap="xs" mt="xs" mb="xs">
        <ThemeIcon size="sm" color="green" variant="light">
          <IconCheck size={14} />
        </ThemeIcon>
        <Text size="xs" c="var(--theme-text-secondary)">
          Известный пользователь
        </Text>
      </Group>
    </Stack>
  </Card>
));

// PhotoCredit удален - используем только цвета фона

// Оптимизированный компонент фона с немедленным доступом к форме
const BackgroundWrapper = memo(({ 
  backgroundImage,
  children
}: { 
  backgroundImage: string;
  children: React.ReactNode;
}) => {

  return (
    <div 
      className="login-wrapper"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        transition: 'background-image 0.5s ease-in-out'
      }}
    >
      {children}
    </div>
  );
});

function Login() {
  const { login: contextLogin } = useUserContext();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeContext();
  const [userData, setUserData] = useState<LoginType>({ login: '', pass: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationType>();
  const [ldapError, setLdapError] = useState('');
  const [currentBackground, setCurrentBackground] = useState<{backgroundImage: string} | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [formState, setFormState] = useState<'initial' | 'knownUser' | 'newUser'>('initial');
  
  const { 
    weatherCondition, 
    temperature, 
    humidity,
    windSpeed,
    pressure,
    visibility,
    uvIndex,
    latitude,
    longitude,
    elevation
  } = useWeather();
  const [currentSeason, currentTimeOfDay] = useMemo(() => [getSeason(), getTimeOfDay()], []);
  
  // Определяем день недели
  const isWeekend = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Воскресенье или суббота
  }, []);
  
  
  // Debounce ref для поиска пользователей
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Загрузка сохраненных данных пользователя
  useEffect(() => {
    const loadSavedData = async () => {
      const lastLogin = localStorage.getItem(LAST_LOGIN_KEY);
      
      if (lastLogin) {
        try {
          // Всегда загружаем свежие данные пользователя из базы
          const freshUserInfo = await fetchUserInfo(lastLogin);
          setUserInfo(freshUserInfo);
          setUserData(prev => ({ ...prev, login: lastLogin }));
          setFormState('knownUser');
        } catch (error) {
          console.error('Ошибка загрузки данных пользователя:', error);
          // Если не удалось загрузить, очищаем кэш
          localStorage.removeItem(LAST_LOGIN_KEY);
          localStorage.removeItem(LAST_USER_INFO_KEY);
          setFormState('newUser');
        }
      } else {
        setFormState('newUser');
      }
    };

    loadSavedData();
  }, []);

  // Оптимизированная загрузка фонового изображения с кэшированием
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    
    // Кэширование не используется для цветов фона
    
    const loadBackground = async () => {
      try {
        
        const background = await fetchBackgroundImage(
          currentSeason, 
          currentTimeOfDay, 
          weatherCondition, 
          temperature,
          humidity,
          windSpeed,
          pressure,
          visibility,
          uvIndex,
          latitude,
          longitude,
          elevation,
          isWeekend
        );
        
        if (isMounted) {
          setCurrentBackground(background);
        }
      } catch (error) {
        console.error('[Advanced Background Loader] Error loading background:', error);
        
        // Fallback - используем текущие данные
        const fallbackBackground = {
          backgroundImage: getContextualGradientBackground(
            currentSeason, 
            currentTimeOfDay, 
            weatherCondition, 
            temperature || 0,
            humidity,
            windSpeed,
            pressure,
            visibility,
            uvIndex,
            latitude,
            longitude,
            elevation,
            isWeekend
          )
        };
        if (isMounted) {
          setCurrentBackground(fallbackBackground);
        }
      }
    };

    loadBackground();
    
    // Увеличиваем интервал обновления для экономии ресурсов
    const backgroundTimer = setInterval(loadBackground, BACKGROUND_UPDATE_INTERVAL * 2);

    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(backgroundTimer);
    };
  }, [currentSeason, currentTimeOfDay, weatherCondition, temperature, humidity, windSpeed, pressure, visibility, uvIndex, latitude, longitude, elevation, isWeekend]);

  const handleInputChange = useCallback((field: keyof LoginType) => 
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUserData(prev => ({ ...prev, [field]: e.target.value }));
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
      setLdapError('');
    }, []);

  // Оптимизированный debounced поиск пользователей
  const handleLoginBlur = useCallback(async () => {
    if (!userData.login.trim() || formState !== 'newUser') return;
    
    // Очищаем предыдущий timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Устанавливаем новый timeout для debounce
    debounceTimeoutRef.current = setTimeout(async () => {
    setIsLoading(true);
    try {
      const info = await fetchUserInfo(userData.login);
      setUserInfo(info);
      // Не сохраняем userInfo в localStorage, чтобы всегда загружать свежие данные
    } catch (error) {
      console.error('Ошибка загрузки данных пользователя:', error);
    } finally {
      setIsLoading(false);
    }
    }, 300); // 300ms debounce
  }, [userData.login, formState]);

  // Очистка timeout при размонтировании
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleLoginAsDifferentUser = useCallback(() => {
    setFormState('newUser');
    setUserData({ login: '', pass: '' });
    setUserInfo(null);
    localStorage.removeItem(LAST_LOGIN_KEY);
    localStorage.removeItem(LAST_USER_INFO_KEY);
  }, []);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API}/user/login`, {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      const json = await response.json();
      
      if (response.ok) {
        localStorage.setItem(LAST_LOGIN_KEY, userData.login);
        contextLogin(json.user, json.token);
        localStorage.setItem('user', JSON.stringify(json.user));
        localStorage.setItem('token', json.token);
        
        // Принудительно обновляем аватар пользователя из базы данных
        try {
          const freshUserInfo = await fetchUserInfo(userData.login);
          setUserInfo(freshUserInfo);
        } catch (error) {
          console.error('Ошибка обновления аватара:', error);
        }
        
        navigate('/');
      } else {
        setValidationErrors(json.errors || {});
        setLdapError(json.ldapError || 'Ошибка аутентификации');
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userData, contextLogin, navigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  }, [handleLogin]);

  // Мемоизированные значения для оптимизации рендеров
  const memoizedUserData = useMemo(() => userData, [userData.login, userData.pass]);
  const memoizedValidationErrors = useMemo(() => validationErrors, [validationErrors?.login, validationErrors?.pass]);
  const memoizedFormState = useMemo(() => formState, [formState]);

  return (
    <BackgroundWrapper 
      backgroundImage={currentBackground?.backgroundImage || getContextualGradientBackground(
        currentSeason, 
        currentTimeOfDay, 
        weatherCondition, 
        temperature || 0,
        humidity,
        windSpeed,
        pressure,
        visibility,
        uvIndex,
        latitude,
        longitude,
        elevation,
        isWeekend
      )}
    >
      <Container size="sm" className="login-container">
        <Paper 
          className="login-form" 
          radius="xl" 
          p="lg"
          shadow="xl"
        >
          <Box className="form-header">
            <ThemeToggleButton isDark={isDark} toggleTheme={toggleTheme} />
          </Box>
          
          <form onSubmit={handleSubmit} className="form-content">
            <Stack gap="md" align="center">
              <Box className="welcome-section">
                <Title order={1} className="welcome-title" ta="center">
                  Добро пожаловать
                </Title>
                <Text size="lg" c="var(--theme-text-secondary)" ta="center" mt="sm">
                  Войдите в систему для продолжения
                </Text>
                <Weather />
              </Box>
              
              {ldapError && (
                <Alert 
                  icon={<IconAlertCircle size={16} />} 
                  color="red" 
                  variant="light"
                  className="error-alert"
                >
                  {ldapError}
                </Alert>
              )}
              
              <Transition 
                mounted={memoizedFormState === 'knownUser' && !!userInfo} 
                transition="slide-down" 
                duration={300}
              >
                {(styles) => (
                  <div style={styles}>
                    {userInfo && <UserProfileCard userInfo={userInfo} />}
                  </div>
                )}
              </Transition>
              
              <Stack gap="sm" w="100%">
                {memoizedFormState === 'knownUser' && userInfo ? (
                  <>
                    <PasswordInput 
                      label="Введите пароль для входа" 
                      placeholder="Ваш пароль"
                      size="lg"
                      leftSection={<IconLock size={20} />}
                      value={memoizedUserData.pass} 
                      onChange={handleInputChange('pass')}
                      error={memoizedValidationErrors?.pass}
                      required
                      autoFocus
                      className="password-input"
                    />
                    
                    <Button 
                      fullWidth 
                      size="lg" 
                      loading={isLoading}
                      type="submit"
                      leftSection={<IconLogin size={20} />}
                      rightSection={<IconArrowRight size={20} />}
                      className="login-button"
                    >
                      Войти
                    </Button>
                    
                    <Divider label="или" labelPosition="center" />
                    
                    <Button 
                      variant="subtle" 
                      fullWidth 
                      size="md"
                      onClick={handleLoginAsDifferentUser}
                      leftSection={<IconRefresh size={18} />}
                      className="switch-user-button"
                    >
                      Войти под другим пользователем
                    </Button>
                  </>
                ) : (
                  <>
                    <TextInput 
                      label="Логин" 
                      placeholder="Введите ваш логин"
                      size="lg"
                      leftSection={<IconUser size={20} />}
                      value={memoizedUserData.login} 
                      onChange={handleInputChange('login')}
                      onBlur={handleLoginBlur}
                      error={memoizedValidationErrors?.login || ldapError}
                      required 
                      autoFocus={memoizedFormState === 'newUser'}
                      className="login-input"
                    />
                    
                    <PasswordInput 
                      label="Пароль" 
                      placeholder="Введите ваш пароль"
                      size="lg"
                      leftSection={<IconLock size={20} />}
                      value={memoizedUserData.pass} 
                      onChange={handleInputChange('pass')}
                      error={memoizedValidationErrors?.pass}
                      required
                      className="password-input"
                    />
                    
                    <Button 
                      fullWidth 
                      size="lg" 
                      loading={isLoading}
                      type="submit"
                      leftSection={<IconLogin size={20} />}
                      rightSection={<IconArrowRight size={20} />}
                      className="login-button"
                    >
                      Войти
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </form>
        </Paper>
      </Container>
    </BackgroundWrapper>
  );
}

export default Login;