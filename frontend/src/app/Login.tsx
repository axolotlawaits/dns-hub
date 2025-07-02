import { Button, Paper, PasswordInput, TextInput, Title, Loader, ActionIcon, Avatar, Text, Group } from '@mantine/core';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { useNavigate } from 'react-router';
import { API } from '../config/constants';
import './styles/Login.css';
import { useWeather, Weather } from './Weather';
import { useThemeContext } from '../hooks/useThemeContext';
import { IconBrightnessDown, IconMoon } from '@tabler/icons-react';
import { formatName } from '../utils/format';

// Типы вынесены в начало для лучшей читаемости
type LoginType = { login: string; pass: string };
type ValidationType = Partial<Record<keyof LoginType, string>>;
type Season = 'winter' | 'spring' | 'summer' | 'autumn';
type TimeOfDay = 'night' | 'morning' | 'day' | 'evening';
type PhotoInfo = { url: string; title: string; author: string; author_url: string };
type UserInfo = { photo: string; name: string; login: string };

// Константы вынесены в отдельный блок
const UNSPLASH_ACCESS_KEY = 'e9dGDOBpfn7xTsX3youhtzak7Ax6Sw2NvO4kJAOFsUs';
const BACKGROUND_UPDATE_INTERVAL = 300000;
const LAST_LOGIN_KEY = 'lastLogin';
const LAST_USER_INFO_KEY = 'lastUserInfo';
const DEFAULT_PHOTO_URL = 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?ixlib=rb-1.2.1&auto=format&fit=crop&w=1920&q=80';

// Вспомогательные функции вынесены за пределы компонента
const getSeason = (): Season => {
  const month = new Date().getMonth();
  return month < 2 || month > 11 ? 'winter' :
    month < 5 ? 'spring' :
    month < 8 ? 'summer' : 'autumn';
};

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  return hour < 5 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
};

const fetchBackgroundImage = async (season: Season, timeOfDay: TimeOfDay): Promise<PhotoInfo> => {
  try {
    const response = await fetch(
      `https://api.unsplash.com/photos/random?query=${season}+${timeOfDay}+nature&orientation=landscape&content_filter=high&auto=format&fit=crop&w=1920&q=80&client_id=${UNSPLASH_ACCESS_KEY}`
    );
    
    if (!response.ok) throw new Error('Ошибка загрузки фото');
    
    const data = await response.json();
    return {
      url: data.urls.full,
      title: data.description || data.alt_description || 'Beautiful Nature',
      author: data.user.name,
      author_url: data.user.links.html
    };
  } catch (error) {
    return {
      url: DEFAULT_PHOTO_URL,
      title: 'Стандартное изображение',
      author: 'Unsplash Community',
      author_url: 'https://unsplash.com'
    };
  }
};

const fetchUserInfo = async (login: string): Promise<UserInfo> => {
  try {
    const response = await fetch(`${API}/user/last-user/${login}`);
    if (!response.ok) throw new Error('User not found');
    
    const data = await response.json();
    return {
      photo: data.image ? `data:image/jpeg;base64,${data.image}` : `https://i.pravatar.cc/150?u=${login}`,
      name: formatName(data.name) || login,
      login: data.login
    };
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return {
      photo: `https://i.pravatar.cc/150?u=${login}`,
      name: login,
      login: login
    };
  }
};

const ThemeToggleButton = ({ isDark, toggleTheme }: { isDark: boolean; toggleTheme: () => void }) => (
  <ActionIcon 
    onClick={toggleTheme} 
    size={36} 
    variant="default" 
    aria-label="Toggle theme"
    style={{ position: 'absolute', top: '10px', right: '10px' }}
  >
    {isDark ? <IconMoon size={22} /> : <IconBrightnessDown size={22} />}
  </ActionIcon>
);

const UserProfileCard = ({ userInfo }: { userInfo: UserInfo }) => (
  <Paper p="md" shadow="sm" mb="xl" style={{ textAlign: 'center' }}>
    <Group justify="center" mb="sm">
      <Avatar src={userInfo.photo} size="xl" radius="xl" />
    </Group>
    <Text size="lg" fw={500}>{userInfo.name}</Text>
    <Text size="sm" c="dimmed">@{userInfo.login}</Text>
  </Paper>
);

const PhotoCredit = ({ photo }: { photo: PhotoInfo }) => (
  <a 
    className="image-credit" 
    href={photo.author_url} 
    target="_blank" 
    rel="noopener noreferrer"
  >
    <div className="image-title">{photo.title}</div>
    <div className="image-author">Автор: {photo.author}</div>
  </a>
);

function Login() {
  const { login: contextLogin } = useUserContext();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeContext();
  const [userData, setUserData] = useState<LoginType>({ login: '', pass: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationType>();
  const [ldapError, setLdapError] = useState('');
  const [currentPhoto, setCurrentPhoto] = useState<PhotoInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [formState, setFormState] = useState<'initial' | 'knownUser' | 'newUser'>('initial');
  
  const { weatherCondition } = useWeather();
  const [currentSeason, currentTimeOfDay] = useMemo(() => [getSeason(), getTimeOfDay()], []);

  // Загрузка сохраненных данных пользователя
  useEffect(() => {
    const loadSavedData = () => {
      const lastLogin = localStorage.getItem(LAST_LOGIN_KEY);
      const lastUserInfo = localStorage.getItem(LAST_USER_INFO_KEY);
      
      if (lastLogin && lastUserInfo) {
        try {
          const parsedInfo = JSON.parse(lastUserInfo);
          setUserInfo(parsedInfo);
          setUserData(prev => ({ ...prev, login: lastLogin }));
          setFormState('knownUser');
        } catch (e) {
          console.error('Ошибка парсинга сохраненных данных', e);
          setFormState('newUser');
        }
      } else {
        setFormState('newUser');
      }
    };

    loadSavedData();
  }, []);

  // Загрузка фонового изображения
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    
    const loadBackground = async () => {
      try {
        const photo = await fetchBackgroundImage(currentSeason, currentTimeOfDay);
        if (isMounted) setCurrentPhoto(photo);
      } catch (error) {
        console.error('Ошибка загрузки фона:', error);
      }
    };

    loadBackground();
    
    const backgroundTimer = setInterval(loadBackground, BACKGROUND_UPDATE_INTERVAL);

    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(backgroundTimer);
    };
  }, [currentSeason, currentTimeOfDay]);

  const handleInputChange = useCallback((field: keyof LoginType) => 
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUserData(prev => ({ ...prev, [field]: e.target.value }));
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
      setLdapError('');
    }, []);

  const handleLoginBlur = useCallback(async () => {
    if (!userData.login.trim() || formState !== 'newUser') return;
    
    setIsLoading(true);
    try {
      const info = await fetchUserInfo(userData.login);
      setUserInfo(info);
      localStorage.setItem(LAST_USER_INFO_KEY, JSON.stringify(info));
    } catch (error) {
      console.error('Ошибка загрузки данных пользователя:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userData.login, formState]);

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
        localStorage.setItem('token', JSON.stringify(json.token));
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

  const backgroundStyle = useMemo(() => ({
    backgroundImage: currentPhoto?.url ? `url(${currentPhoto.url})` : undefined,
    filter: weatherCondition === 'rain' ? 'brightness(0.8)' : 'none'
  }), [currentPhoto?.url, weatherCondition]);

  return (
    <div className="wrapper" style={backgroundStyle}>
      {!currentPhoto && (
        <div className="bg-loader">
          <Loader variant="dots" color="#fff" />
        </div>
      )}
      {weatherCondition === 'rain' && <div className="weather-effect rain" />}
      {weatherCondition === 'snow' && <div className="weather-effect snow" />}
      {currentPhoto && <PhotoCredit photo={currentPhoto} />}
      
      <Paper className="form" radius="md" p={30}>
        <ThemeToggleButton isDark={isDark} toggleTheme={toggleTheme} />
        
        <form onSubmit={handleSubmit} className="form-content">
          <Title order={2} className="title" ta="center" mb={50}>
            Добро пожаловать
          </Title>
          <Weather />
          
          {formState === 'knownUser' && userInfo ? (
            <>
              <UserProfileCard userInfo={userInfo} />
              
              <PasswordInput 
                label="Введите пароль для входа" 
                placeholder="Ваш пароль"
                mt="md" 
                size="md"
                value={userData.pass} 
                onChange={handleInputChange('pass')}
                error={validationErrors?.pass}
                required
                autoFocus
              />
              
              <Button 
                fullWidth 
                mt="xl" 
                size="md" 
                loading={isLoading}
                type="submit"
              >
                Войти
              </Button>
              
              <Button 
                variant="subtle" 
                fullWidth 
                mt="sm" 
                size="sm"
                onClick={handleLoginAsDifferentUser}
              >
                Войти под другим пользователем
              </Button>
            </>
          ) : (
            <>
              <TextInput 
                label="Логин" 
                placeholder="Введите ваш логин"
                size="md"
                value={userData.login} 
                onChange={handleInputChange('login')}
                onBlur={handleLoginBlur}
                error={validationErrors?.login || ldapError}
                required 
                autoFocus={formState === 'newUser'}
              />
              
              <PasswordInput 
                label="Пароль" 
                placeholder="Введите ваш пароль"
                mt="md" 
                size="md"
                value={userData.pass} 
                onChange={handleInputChange('pass')}
                error={validationErrors?.pass}
                required
              />
              
              <Button 
                fullWidth 
                mt="xl" 
                size="md" 
                loading={isLoading}
                type="submit"
              >
                Войти
              </Button>
            </>
          )}
        </form>
      </Paper>
    </div>
  );
}

export default Login;