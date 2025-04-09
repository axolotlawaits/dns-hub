import {
  Button,
  Paper,
  PasswordInput,
  TextInput,
  Title,
  Loader
} from '@mantine/core';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { useNavigate } from 'react-router';
import { API } from '../config/constants';
import './Login.css';
import { useWeather, Weather } from './Weather';

type LoginType = { login: string; pass: string };
type ValidationType = Partial<Record<keyof LoginType, string>>;
type Season = 'winter' | 'spring' | 'summer' | 'autumn';
type TimeOfDay = 'night' | 'morning' | 'day' | 'evening';
type PhotoInfo = { url: string; title: string; author: string; author_url: string };

const UNSPLASH_ACCESS_KEY = 'e9dGDOBpfn7xTsX3youhtzak7Ax6Sw2NvO4kJAOFsUs';
const BACKGROUND_UPDATE_INTERVAL = 300000;

const getSeason = (): Season => 
  new Date().getMonth() < 2 || new Date().getMonth() > 11 ? 'winter' :
  new Date().getMonth() < 5 ? 'spring' :
  new Date().getMonth() < 8 ? 'summer' : 'autumn';

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours();
  return hour < 5 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening';
};

async function fetchBackgroundImage(season: Season, timeOfDay: TimeOfDay): Promise<PhotoInfo> {
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
      url: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?ixlib=rb-1.2.1&auto=format&fit=crop&w=1920&q=80',
      title: 'Стандартное изображение',
      author: 'Unsplash Community',
      author_url: 'https://unsplash.com'
    };
  }
}

function Login() {
  const { login } = useUserContext();
  const navigate = useNavigate();
  
  const [userData, setUserData] = useState<LoginType>({ login: '', pass: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationType>();
  const [ldapError, setLdapError] = useState('');
  const [currentPhoto, setCurrentPhoto] = useState<PhotoInfo | null>(null);
  
  const { weatherCondition } = useWeather();
  const [currentSeason, currentTimeOfDay] = useMemo(() => [getSeason(), getTimeOfDay()], []);

  const handleInputChange = useCallback((field: keyof LoginType) => 
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUserData(prev => ({ ...prev, [field]: e.target.value }));
      setValidationErrors(prev => ({ ...prev, [field]: undefined }));
      setLdapError('');
    }, []);

  useEffect(() => {
    const controller = new AbortController();
    
    const loadBackground = async () => {
      try {
        const photo = await fetchBackgroundImage(currentSeason, currentTimeOfDay);
        setCurrentPhoto(photo);
      } catch (error) {
        console.error('Ошибка загрузки фона:', error);
      }
    };

    loadBackground();
    
    const backgroundTimer = setInterval(() => 
      fetchBackgroundImage(getSeason(), getTimeOfDay())
        .then(setCurrentPhoto), 
      BACKGROUND_UPDATE_INTERVAL
    );

    return () => {
      controller.abort();
      clearInterval(backgroundTimer);
    };
  }, [currentSeason, currentTimeOfDay]);

  const handleLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API}/user/login`, {
        method: 'POST',
        body: JSON.stringify(userData),
        headers: { 'Content-Type': 'application/json' }
      });
      
      const json = await response.json();
      
      if (response.ok) {
        login(json);
        localStorage.setItem('user', JSON.stringify(json));
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
  }, [userData, login, navigate]);

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

      {currentPhoto && (
        <a 
          className="image-credit" 
          href={currentPhoto.author_url} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          <div className="image-title">{currentPhoto.title}</div>
          <div className="image-author">Автор: {currentPhoto.author}</div>
        </a>
      )}

      <Paper className="form" radius={0} p={30}>
        <div className="form-content">
          <Title order={2} className="title" ta="center" mb={50}>
            Добро пожаловать
          </Title>

          

          <TextInput 
            label="Логин" 
            placeholder="Введите ваш логин"
            size="md"
            value={userData.login} 
            onChange={handleInputChange('login')} 
            error={validationErrors?.login || ldapError}
            required 
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
            onClick={handleLogin} 
            loading={isLoading}
            type="submit"
            color="#818cf8"
          >
            Войти
          </Button>
          <Weather />
        </div>
        
      </Paper>
    </div>
  );
}

export default Login;