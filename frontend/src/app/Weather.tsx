import { useState, useEffect, useCallback } from 'react';
import { Loader, Text, Group } from '@mantine/core';

export type WeatherCondition = 
  | 'clear' | 'cloudy' | 'rain' | 'snow'
  | 'fog' | 'mist' | 'haze' | 'dust'
  | 'thunderstorm' | 'drizzle' | 'sleet' | 'hail'
  | 'blizzard' | 'freezing_rain' | 'ice_pellets'
  | 'partly_cloudy' | 'overcast' | 'scattered_clouds';

// Расширенные типы для погодных данных
export interface WeatherData {
  // Основные данные
  location: string;
  weatherCondition: WeatherCondition;
  temperature: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  visibility: number;
  uvIndex: number;
  
  // Географические данные
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number;
  country: string;
  region: string;
  
  // Временные данные
  sunrise: string;
  sunset: string;
  moonPhase: string;
  dayLength: number;
  
  // Дополнительные погодные данные
  feelsLike: number;
  dewPoint: number;
  windDirection: number;
  gustSpeed: number;
  cloudCover: number;
  precipitation: number;
  
  // Астрономические данные
  solarRadiation: number;
  moonIllumination: number;
  
  // Климатические данные
  heatIndex: number;
  windChill: number;
  
  isWeatherLoading: boolean;
}

const WEATHER_API_KEY = '7a61de9f85134f88a9273945250904';
const WEATHER_UPDATE_INTERVAL = 3600000;

export function useWeather() {
  // Основные данные
  const [location, setLocation] = useState('Загрузка...');
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>('clear');
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [humidity, setHumidity] = useState<number>(50);
  const [windSpeed, setWindSpeed] = useState<number>(0);
  const [pressure, setPressure] = useState<number>(1013);
  const [visibility, setVisibility] = useState<number>(10);
  const [uvIndex, setUvIndex] = useState<number>(0);
  
  // Географические данные
  const [latitude, setLatitude] = useState<number>(0);
  const [longitude, setLongitude] = useState<number>(0);
  const [timezone, setTimezone] = useState<string>('');
  const [elevation, setElevation] = useState<number>(0);
  const [country, setCountry] = useState<string>('');
  const [region, setRegion] = useState<string>('');
  
  // Временные данные
  const [sunrise, setSunrise] = useState<string>('');
  const [sunset, setSunset] = useState<string>('');
  const [moonPhase, setMoonPhase] = useState<string>('');
  const [dayLength, setDayLength] = useState<number>(0);
  
  // Дополнительные погодные данные
  const [feelsLike, setFeelsLike] = useState<number>(0);
  const [dewPoint, setDewPoint] = useState<number>(0);
  const [windDirection, setWindDirection] = useState<number>(0);
  const [gustSpeed, setGustSpeed] = useState<number>(0);
  const [cloudCover, setCloudCover] = useState<number>(0);
  const [precipitation, setPrecipitation] = useState<number>(0);
  
  // Астрономические данные
  const [solarRadiation, setSolarRadiation] = useState<number>(0);
  const [moonIllumination, setMoonIllumination] = useState<number>(0);
  
  // Климатические данные
  const [heatIndex, setHeatIndex] = useState<number>(0);
  const [windChill, setWindChill] = useState<number>(0);
  
  const [isWeatherLoading, setIsWeatherLoading] = useState(true);

  // Функция для определения расширенных погодных условий
  const determineWeatherCondition = (conditionText: string, humidity: number, visibility: number, windSpeed: number): WeatherCondition => {
    const condition = conditionText.toLowerCase();
    
    // Используем дополнительные параметры для более точного определения
    console.log(`[Weather Condition] Analyzing: "${conditionText}", humidity: ${humidity}%, visibility: ${visibility}km, wind: ${windSpeed}km/h`);
    
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

  // Функция для расчета фазы луны
  const calculateMoonPhase = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Упрощенный расчет фазы луны
    const c = Math.floor((year - 2000) * 12.3685);
    const n = Math.floor((year - 2000) * 12.3685) + month + day / 30;
    const phase = (n - c) % 29.53059;
    
    if (phase < 1.84566) return 'new_moon';
    if (phase < 5.53699) return 'waxing_crescent';
    if (phase < 9.22831) return 'first_quarter';
    if (phase < 12.91963) return 'waxing_gibbous';
    if (phase < 16.61096) return 'full_moon';
    if (phase < 20.30228) return 'waning_gibbous';
    if (phase < 23.99361) return 'last_quarter';
    return 'waning_crescent';
  };

  const fetchWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=auto:ip&aqi=yes`
      );
      
      if (!response.ok) throw new Error('Ошибка получения данных');
      
      const data = await response.json();
      
      // Основные данные
      setLocation(`${data.location.name}, ${data.location.country}`);
      setTemperature(Math.round(data.current.temp_c));
      setLatitude(data.location.lat);
      setLongitude(data.location.lon);
      setTimezone(data.location.tz_id);
      setElevation(data.location.elevation || 0);
      setCountry(data.location.country || '');
      setRegion(data.location.region || '');

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
      
      // Дополнительные погодные данные
      setFeelsLike(Math.round(data.current.feelslike_c || data.current.temp_c));
      setDewPoint(Math.round(data.current.dewpoint_c || 0));
      setWindDirection(data.current.wind_degree || 0);
      setGustSpeed(data.current.gust_kph || 0);
      setCloudCover(data.current.cloud || 0);
      setPrecipitation(data.current.precip_mm || 0);
      
      // Астрономические данные
      setSolarRadiation(data.current.solar_radiation || 0);
      setMoonIllumination(data.current.moon_illumination || 0);
      
      // Климатические данные
      setHeatIndex(Math.round(data.current.heatindex_c || data.current.temp_c));
      setWindChill(Math.round(data.current.windchill_c || data.current.temp_c));

      // Время восхода/заката и фаза луны
      setSunrise(data.forecast?.forecastday?.[0]?.astro?.sunrise || '');
      setSunset(data.forecast?.forecastday?.[0]?.astro?.sunset || '');
      setMoonPhase(calculateMoonPhase(new Date()));
      
      // Расчет продолжительности дня
      if (data.forecast?.forecastday?.[0]?.astro?.sunrise && data.forecast?.forecastday?.[0]?.astro?.sunset) {
        const sunriseTime = new Date(`2000-01-01 ${data.forecast.forecastday[0].astro.sunrise}`);
        const sunsetTime = new Date(`2000-01-01 ${data.forecast.forecastday[0].astro.sunset}`);
        const dayLengthHours = (sunsetTime.getTime() - sunriseTime.getTime()) / (1000 * 60 * 60);
        setDayLength(dayLengthHours);
      }

      console.log('🌤️ Получены расширенные погодные данные:', {
        location: `${data.location.name}, ${data.location.country}`,
        weatherCondition: condition,
        temperature: Math.round(data.current.temp_c),
        humidity: data.current.humidity,
        windSpeed: data.current.wind_kph,
        pressure: data.current.pressure_mb,
        visibility: data.current.vis_km,
        uvIndex: data.current.uv,
        coordinates: `${data.location.lat}, ${data.location.lon}`,
        timezone: data.location.tz_id,
        elevation: data.location.elevation,
        feelsLike: data.current.feelslike_c,
        dewPoint: data.current.dewpoint_c,
        windDirection: data.current.wind_degree,
        cloudCover: data.current.cloud,
        precipitation: data.current.precip_mm,
        moonPhase: calculateMoonPhase(new Date()),
        dayLength: dayLength
      });

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

  return { 
    // Основные данные
    location, 
    weatherCondition, 
    temperature, 
    humidity,
    windSpeed,
    pressure,
    visibility,
    uvIndex,
    
    // Географические данные
    latitude,
    longitude,
    timezone,
    elevation,
    country,
    region,
    
    // Временные данные
    sunrise,
    sunset,
    moonPhase,
    dayLength,
    
    // Дополнительные погодные данные
    feelsLike,
    dewPoint,
    windDirection,
    gustSpeed,
    cloudCover,
    precipitation,
    
    // Астрономические данные
    solarRadiation,
    moonIllumination,
    
    // Климатические данные
    heatIndex,
    windChill,
    
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