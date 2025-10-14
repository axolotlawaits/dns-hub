import { AppShell, Loader, Group, Popover, Stack, Text, Divider, Box } from "@mantine/core";
import { IconAppWindow, IconBasket, IconBrandRumble, IconBrandUnity, IconBriefcase, IconNews } from "@tabler/icons-react";
import { useWeather, WeatherCondition } from "../app/Weather";
import { useState, useEffect, useCallback, useContext, useMemo } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import dayjs from "dayjs";
import 'dayjs/locale/ru';
import "./styles/Footer.css";
import { ThemeContext } from "../contexts/ThemeContext";
import { useUserContext } from "../hooks/useUserContext";
import { API } from "../config/constants";

interface ForecastDay {
  date: string;
  day: {
    avgtemp_c: number;
    condition: {
      text: string;
    };
  };
}

const WEATHER_API_KEY = '7a61de9f85134f88a9273945250904';
const FORECAST_DAYS = 3;

const navLinks = [
  {
    href: "https://dns-shop.ru",
    icon: IconBasket,
    name: "DNS-Shop",
    description: "Магазин"
  },
  {
    href: "https://docs.dns-shop.ru/",
    icon: IconBriefcase,
    name: "Docs",
    description: "Документация"
  },
  {
    href: "https://ecosystem.dns-shop.ru/stream",
    icon: IconNews,
    name: "EcoSystem",
    description: "Новости компании"
  },
  {
    href: "https://media2.dns-shop.ru/",
    icon: IconBrandRumble,
    name: "Media2",
    description: "Медиа портал"
  },
  {
    href: "http://sale.partner.ru/login",
    icon: IconAppWindow,
    name: "Web - База",
    description: "Портал продаж"
  },
  {
    href: window.location.host.includes('localhost') ? `https://dns-zs.partner.ru/uweb` : `https://${window.location.host}/uweb`,
    icon: IconBrandUnity,
    name: "Uweb",
    description: "Планограммы"
  }
];
console.log(window.location.host.includes('localhost'))
const getWeatherIcon = (condition: WeatherCondition) => {
  const icons = {
    clear: "☀️",
    cloudy: "☁️",
    rain: "🌧️",
    snow: "❄️",
    default: "🌤️"
  };
  
  return icons[condition] || icons.default;
};

const getDayWeatherIcon = (conditionText: string) => {
  if (conditionText.toLowerCase().includes("дождь")) return "🌧️";
  if (conditionText.toLowerCase().includes("снег")) return "❄️";
  if (conditionText.toLowerCase().includes("облач")) return "☁️";
  return "☀️";
};

function Footer() {
  const themeContext = useContext(ThemeContext);
  const { user } = useUserContext();
  const isDark = themeContext?.isDark ?? false;

  // Базовые данные о погоде
  const { location, weatherCondition, isWeatherLoading } = useWeather();
  
  // Состояния для погоды
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [weatherOpened, setWeatherOpened] = useState(false);
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);

  // Состояния для даты и времени
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [calendarOpened, setCalendarOpened] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Загрузка текущей температуры и прогноза
  const fetchWeatherData = useCallback(async () => {
    try {
      // Параллельная загрузка текущей погоды и прогноза
      const [currentResponse, forecastResponse] = await Promise.all([
        fetch(`https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=auto:ip`),
        fetch(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=auto:ip&days=5`)
      ]);

      if (!currentResponse.ok || !forecastResponse.ok) {
        throw new Error("Ошибка получения данных о погоде");
      }

      const [currentData, forecastData] = await Promise.all([
        currentResponse.json(),
        forecastResponse.json()
      ]);

      setCurrentTemp(Math.round(currentData.current.temp_c));
      setForecast(forecastData.forecast.forecastday);
    } catch (error) {
      console.error("Ошибка при загрузке данных о погоде:", error);
    }
  }, []);

  // Загрузка данных о погоде при монтировании
  useEffect(() => {
    fetchWeatherData();
  }, [fetchWeatherData]);

  // Загрузка настройки автоскрытия футера
  useEffect(() => {
    const loadFooterSetting = async () => {
      try {
        const response = await fetch(`${API}/user/settings/${user?.id}/auto_hide_footer`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setAutoHideEnabled(data.value === 'true');
        } else if (response.status === 404) {
          // Если настройка не найдена, используем значение по умолчанию (отключено)
          setAutoHideEnabled(false);
        }
      } catch (error) {
        console.error('Error loading footer setting:', error);
      }
    };

    if (user?.id) {
      loadFooterSetting();
    }
  }, [user?.id]);

  // Слушатель изменения настройки автоскрытия футера
  useEffect(() => {
    const handleFooterSettingChange = (event: CustomEvent) => {
      setAutoHideEnabled(event.detail);
    };

    window.addEventListener('footer-setting-changed', handleFooterSettingChange as EventListener);
    
    return () => {
      window.removeEventListener('footer-setting-changed', handleFooterSettingChange as EventListener);
    };
  }, []);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };
  }, [hideTimer]);

  // Инициализация видимости футера
  useEffect(() => {
    if (!autoHideEnabled) {
      setIsFooterVisible(true);
    } else {
      setIsFooterVisible(false);
    }
  }, [autoHideEnabled]);

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

  // Эффект скролла для прогресса (только для индикатора)
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Прогресс прокрутки (0-100%)
      const maxScroll = documentHeight - windowHeight;
      const progress = maxScroll > 0 ? Math.min((scrollY / maxScroll) * 100, 100) : 0;
      setScrollProgress(progress);
      
      // Добавляем класс при скролле вниз или когда контент больше экрана
      const shouldShowScrolled = scrollY > 50 || documentHeight > windowHeight + 100;
      setIsScrolled(shouldShowScrolled);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Проверяем при загрузке
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Загрузка прогноза при открытии попапа погоды
  const handleWeatherClick = useCallback(() => {
    const newState = !weatherOpened;
    setWeatherOpened(newState);
    if (newState && forecast.length === 0) {
      fetchWeatherData();
    }
  }, [weatherOpened, forecast.length, fetchWeatherData]);

  // Мемоизированное отображение прогноза
  const forecastDisplay = useMemo(() => (
    forecast.slice(0, FORECAST_DAYS).map((day) => (
      <Group key={day.date} justify="space-between">
        <Text size="sm">{dayjs(day.date).format('dd DD.MM')}</Text>
        <Text size="sm" fw={500}>{Math.round(day.day.avgtemp_c)}°C</Text>
        <Text size="sm">{getDayWeatherIcon(day.day.condition.text)}</Text>
      </Group>
    ))
  ), [forecast]);


  // Обработчики мыши для футера
  const handleMouseEnter = () => {
    if (autoHideEnabled) {
      setIsFooterVisible(true);
      // Очищаем таймер при наведении
      if (hideTimer) {
        clearTimeout(hideTimer);
        setHideTimer(null);
      }
    }
  };

  const handleMouseLeave = () => {
    if (autoHideEnabled) {
      // Устанавливаем таймер на 5 секунд
      const timer = setTimeout(() => {
        setIsFooterVisible(false);
        setHideTimer(null);
      }, 5000);
      setHideTimer(timer);
    }
  };

  return (
    <AppShell.Footer 
      id="footer-wrapper" 
      data-footer
      className={`auto-hide-footer ${isScrolled ? 'scrolled' : ''} ${isFooterVisible ? 'visible' : 'hidden'} ${autoHideEnabled ? 'auto-hide-enabled' : 'auto-hide-disabled'}`}
      style={{
        '--scroll-progress': `${scrollProgress}%`
      } as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Индикатор прогресса прокрутки */}
      <div className="scroll-progress-bar" style={{ width: `${scrollProgress}%` }} />
      
      <div id="footer">
        <div id="footer-nav">
          {/* Основные ссылки */}
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a 
                key={link.href}
                href={link.href} 
                className="footer-nav-option" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Icon size={35} />
                <div className="footer-nav-text">
                  <span className="footer-nav-name">{link.name}</span>
                  <span className="footer-nav-description">{link.description}</span>
                </div>
              </a>
            );
          })}
          {/* Правый блок с разделителем */}
          <div className="footer-right-section">
            <Divider orientation="vertical" className="footer-divider" />
            {/* Отступ между погодой и календарем */}
            <Box w={10} />
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
                  onClick={handleWeatherClick}
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
                  <Text size="sm" fw={500}>Прогноз на {FORECAST_DAYS} дня</Text>
                  {forecastDisplay}
                </Stack>
              </Popover.Dropdown>
            </Popover>  

            {/* Календарь */}
            <Popover 
              opened={calendarOpened} 
              onChange={setCalendarOpened} 
              position="top-end"
              classNames={{ dropdown: isDark ? 'dark-theme-dropdown' : '' }}
            >
              <Popover.Target>
                <div 
                  className="footer-time-option" 
                  onClick={() => setCalendarOpened(!calendarOpened)}
                >
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