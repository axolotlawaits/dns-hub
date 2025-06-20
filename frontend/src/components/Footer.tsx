import { AppShell, Loader, Group, Popover, Stack, Text, Divider, Box } from "@mantine/core";
import { IconBasket, IconBriefcase, IconCube, IconNews } from "@tabler/icons-react";
import { useWeather, WeatherCondition } from "../app/Weather";
import { useState, useEffect, useCallback, useContext } from "react";
import DatePicker from "react-datepicker";
import { registerLocale } from "react-datepicker";
import { ru } from "date-fns/locale/ru";
import "react-datepicker/dist/react-datepicker.css";
import dayjs from "dayjs";
import 'dayjs/locale/ru';
import "./styles/Footer.css";
import { ThemeContext } from "../contexts/ThemeContext";

// Регистрируем русскую локаль для календаря
registerLocale('ru', ru);
dayjs.locale('ru');

function Footer() {
  const themeContext = useContext(ThemeContext);
  const isDark = themeContext?.isDark ?? false;

  // Базовые данные о погоде
  const { location, weatherCondition, isWeatherLoading } = useWeather();
  
  // Состояния для погоды
  const [forecast, setForecast] = useState<any[]>([]);
  const [weatherOpened, setWeatherOpened] = useState(false);
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);

  // Состояния для даты и времени
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [calendarOpened, setCalendarOpened] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Загрузка текущей температуры при монтировании
  useEffect(() => {
    const fetchCurrentWeather = async () => {
      try {
        const response = await fetch(
          `https://api.weatherapi.com/v1/current.json?key=7a61de9f85134f88a9273945250904&q=auto:ip`
        );
        
        if (!response.ok) throw new Error("Ошибка получения погоды");
        
        const data = await response.json();
        setCurrentTemp(Math.round(data.current.temp_c));
      } catch (error) {
        console.error("Ошибка погоды:", error);
      }
    };
    
    fetchCurrentWeather();
  }, []);

  // Обновление времени
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("ru-RU", { 
        hour: "2-digit", 
        minute: "2-digit" 
      }));
      setCurrentDate(dayjs(now).format("DD.MM.YYYY"));
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Загрузка прогноза погоды
  const fetchForecast = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=7a61de9f85134f88a9273945250904&q=auto:ip&days=5`
      );
      
      if (!response.ok) throw new Error("Ошибка получения прогноза");
      
      const data = await response.json();
      setForecast(data.forecast.forecastday);
    } catch (error) {
      console.error("Ошибка прогноза:", error);
    }
  }, []);

  // Получение иконки погоды
  const getWeatherIcon = (condition: WeatherCondition) => {
    switch (condition) {
      case "clear": return "☀️";
      case "cloudy": return "☁️";
      case "rain": return "🌧️";
      case "snow": return "❄️";
      default: return "🌤️";
    }
  };

  return (
    <AppShell.Footer id="footer-wrapper">
      <div id="footer">
        <div id="footer-nav">
          {/* Основные ссылки */}
          <a href="https://dns-shop.ru" className="footer-nav-option" target="_blank" rel="noopener noreferrer">
            <IconBasket size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">DNS-Shop</span>
              <span className="footer-nav-description">Магазин</span>
            </div>
          </a>
          
          <a href="https://dns-zs.partner.ru/uweb" className="footer-nav-option" target="_blank" rel="noopener noreferrer">
            <IconCube size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Uweb</span>
              <span className="footer-nav-description">3D планограммы</span>
            </div>
          </a>
          
          <a href="https://docs.dns-shop.ru/" className="footer-nav-option" target="_blank" rel="noopener noreferrer">
            <IconBriefcase size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">Docs</span>
              <span className="footer-nav-description">Документация</span>
            </div>
          </a>
          
          <a href="https://ecosystem.dns-shop.ru/stream" className="footer-nav-option" target="_blank" rel="noopener noreferrer">
            <IconNews size={35} />
            <div className="footer-nav-text">
              <span className="footer-nav-name">EcoSystem</span>
              <span className="footer-nav-description">Новости компании</span>
            </div>
          </a>

          {/* Правый блок с разделителем */}
          <div className="footer-right-section">
            <Divider orientation="vertical" className="footer-divider" />
            
            {/* Погода */}
            <Popover 
              opened={weatherOpened} 
              onChange={setWeatherOpened} 
              position="top-end"
              classNames={{ dropdown: isDark ? 'dark-theme-dropdown' : '' }}
            >
              <Popover.Target>
                <div 
                  className="footer-weather-option" 
                  onClick={() => {
                    if (!weatherOpened && forecast.length === 0) fetchForecast();
                    setWeatherOpened(!weatherOpened);
                  }}
                >
                  {isWeatherLoading ? (
                    <Loader size="sm" />
                  ) : (
                    <>
                      <span className="weather-icon">{getWeatherIcon(weatherCondition)}</span>
                      <div className="footer-weather-text">
                        <span className="weather-temp">{currentTemp ?? '--'}°C</span>
                        <span className="weather-location">{location}</span>
                      </div>
                    </>
                  )}
                </div>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="sm">
                  <Text size="sm" fw={500}>Прогноз на 3 дня</Text>
                  {forecast.slice(0, 3).map((day) => (
                    <Group key={day.date} justify="space-between">
                      <Text size="sm">{dayjs(day.date).format('dd DD.MM')}</Text>
                      <Text size="sm" fw={500}>{Math.round(day.day.avgtemp_c)}°C</Text>
                      <Text size="sm">
                        {day.day.condition.text.toLowerCase().includes("дождь") ? "🌧️" :
                        day.day.condition.text.toLowerCase().includes("снег") ? "❄️" :
                        day.day.condition.text.toLowerCase().includes("облач") ? "☁️" : "☀️"}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Popover.Dropdown>
            </Popover>
            
            {/* Отступ между погодой и календарем */}
            <Box w={10} />
            
            {/* Календарь */}
            <Popover 
              opened={calendarOpened} 
              onChange={setCalendarOpened} 
              position="top-end"
              classNames={{ dropdown: isDark ? 'dark-theme-dropdown' : '' }}
            >
              <Popover.Target>
                <div className="footer-time-option" onClick={() => setCalendarOpened(!calendarOpened)}>
                  <div className="footer-time-text">
                    <span className="footer-time">{currentTime}</span>
                    <span className="footer-date">{currentDate}</span>
                  </div>
                </div>
              </Popover.Target>
                  <Popover.Dropdown p={0} bg="transparent">
                    <DatePicker
                      selected={selectedDate}
                      onChange={(date) => {
                        setSelectedDate(date);
                        setCalendarOpened(false);
                      }}
                      inline
                      locale="ru"
                      calendarStartDay={1}
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                      dateFormat="dd.MM.yyyy"
                      className={isDark ? "dark-theme-datepicker" : ""}
                      popperClassName="no-border-popper"
                      calendarClassName={isDark ? "dark-calendar" : ""}
                    />
                  </Popover.Dropdown>
            </Popover>
          </div>
        </div>
      </div>
    </AppShell.Footer>
  );
}

export default Footer;