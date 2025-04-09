import { useState, useEffect, useCallback } from 'react';
import { Loader, Text, Group } from '@mantine/core';
import './Login.css';

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow';

const WEATHER_API_KEY = '7a61de9f85134f88a9273945250904';
const WEATHER_UPDATE_INTERVAL = 3600000;

export function useWeather() {
  const [location, setLocation] = useState('Загрузка...');
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>('clear');
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);

  const fetchWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=auto:ip`
      );
      
      if (!response.ok) throw new Error('Ошибка получения данных');
      
      const data = await response.json();
      setLocation(`${data.location.name}, ${data.location.country}`);

      const condition = data.current.condition.text.toLowerCase();
      setWeatherCondition(
        condition.includes('дождь') ? 'rain' :
        condition.includes('снег') ? 'snow' :
        condition.includes('облач') ? 'cloudy' : 'clear'
      );
    } catch (error) {
      console.error('Ошибка погоды:', error);
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

  return { location, weatherCondition, isWeatherLoading };
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