import { useState, useEffect, useCallback } from 'react';
import { Loader, Text, Group } from '@mantine/core';

export type WeatherCondition = 
  | 'clear' | 'cloudy' | 'rain' | 'snow'
  | 'fog' | 'mist' | 'haze' | 'dust'
  | 'thunderstorm' | 'drizzle' | 'sleet' | 'hail'
  | 'blizzard' | 'freezing_rain' | 'ice_pellets'
  | 'partly_cloudy' | 'overcast' | 'scattered_clouds';

// Типы для погодных данных (только то, что используется в Login.tsx)
export interface WeatherData {
  location: string;
  weatherCondition: WeatherCondition;
  temperature: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  visibility: number;
  uvIndex: number;
  elevation: number;
  isWeatherLoading: boolean;
}

const WEATHER_API_KEY = '7a61de9f85134f88a9273945250904';
const WEATHER_UPDATE_INTERVAL = 3600000;

export function useWeather() {
  // Только данные, используемые в Login.tsx
  const [location, setLocation] = useState('Загрузка...');
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>('clear');
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [humidity, setHumidity] = useState<number>(50);
  const [windSpeed, setWindSpeed] = useState<number>(0);
  const [pressure, setPressure] = useState<number>(1013);
  const [visibility, setVisibility] = useState<number>(10);
  const [uvIndex, setUvIndex] = useState<number>(0);
  const [elevation, setElevation] = useState<number>(0);
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);

  // Функция для определения расширенных погодных условий
  const determineWeatherCondition = (conditionText: string, humidity: number, visibility: number, windSpeed: number): WeatherCondition => {
    const condition = conditionText.toLowerCase();
    
    // Используем дополнительные параметры для более точного определения
    
    // Специальные условия
    if (condition.includes('гроза') || condition.includes('thunderstorm')) return 'thunderstorm';
    if (condition.includes('метель') || condition.includes('blizzard')) return 'blizzard';
    if (condition.includes('град') || condition.includes('hail')) return 'hail';
    if (condition.includes('морось') || condition.includes('drizzle')) return 'drizzle';
    if (condition.includes('мокрый снег') || condition.includes('sleet')) return 'sleet';
    if (condition.includes('ледяной дождь') || condition.includes('freezing rain')) return 'freezing_rain';
    if (condition.includes('ледяная крупа') || condition.includes('ice pellets')) return 'ice_pellets';
    
    // Туман и дымка (используем видимость для более точного определения)
    if (condition.includes('туман') || condition.includes('fog') || visibility < 1) return 'fog';
    if (condition.includes('дымка') || condition.includes('mist') || (visibility >= 1 && visibility < 5)) return 'mist';
    if (condition.includes('мгла') || condition.includes('haze') || (visibility >= 5 && visibility < 10)) return 'haze';
    if (condition.includes('пыль') || condition.includes('dust')) return 'dust';
    
    // Облачность
    if (condition.includes('переменная облачность') || condition.includes('partly cloudy')) return 'partly_cloudy';
    if (condition.includes('пасмурно') || condition.includes('overcast')) return 'overcast';
    if (condition.includes('рассеянные облака') || condition.includes('scattered clouds')) return 'scattered_clouds';
    if (condition.includes('облачно') || condition.includes('cloudy')) return 'cloudy';
    
    // Осадки (используем влажность для более точного определения)
    if (condition.includes('дождь') || condition.includes('rain')) {
      if (humidity > 80 && windSpeed > 20) return 'thunderstorm';
      return 'rain';
    }
    if (condition.includes('снег') || condition.includes('snow')) {
      if (windSpeed > 15) return 'blizzard';
      return 'snow';
    }
    
    // Дополнительная логика на основе параметров
    if (humidity > 90 && visibility < 2) return 'fog';
    if (humidity > 80 && windSpeed > 25) return 'thunderstorm';
    
    // Ясно
    return 'clear';
  };

  // УДАЛЕНО: calculateMoonPhase - не используется в Login.tsx

  const fetchWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=auto:ip&aqi=yes`
      );
      
      if (!response.ok) throw new Error('Ошибка получения данных');
      
      const data = await response.json();
      
      // Только данные, используемые в Login.tsx
      setLocation(`${data.location.name}, ${data.location.country}`);
      setTemperature(Math.round(data.current.temp_c));
      setElevation(data.location.elevation || 0);

      // Расширенные погодные условия
      const condition = determineWeatherCondition(
        data.current.condition.text,
        data.current.humidity,
        data.current.vis_km,
        data.current.wind_kph
      );
      setWeatherCondition(condition);

      // Детальные погодные данные
      setHumidity(data.current.humidity || 50);
      setWindSpeed(data.current.wind_kph || 0);
      setPressure(data.current.pressure_mb || 1013);
      setVisibility(data.current.vis_km || 10);
      setUvIndex(data.current.uv || 0);

    } catch (error) {
      setLocation('Местоположение не определено');
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, WEATHER_UPDATE_INTERVAL);
    return () => clearInterval(weatherTimer);
  }, [fetchWeather]);

  return { 
    // Только данные, используемые в Login.tsx
    location, 
    weatherCondition, 
    temperature, 
    humidity,
    windSpeed,
    pressure,
    visibility,
    uvIndex,
    elevation,
    isWeatherLoading 
  };
}

export function Weather() {
  const { location, isWeatherLoading } = useWeather();
  
  return (
    <Group align="flex-start" mb={30}>
      <div>
        <Text className="location-text">
          Ваше местоположение: <strong>{location}</strong>
        </Text>
      </div>
      {isWeatherLoading && <Loader size="sm" />}
    </Group>
  );
}