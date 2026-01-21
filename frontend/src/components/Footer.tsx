import { AppShell } from "@mantine/core";
import { IconAlien, IconAppWindow, IconBasket, IconBrandRumble, IconBrandUnity, IconBriefcase, IconDashboard, IconNews } from "@tabler/icons-react";
import { useState, useEffect } from "react";
import "./styles/Footer.css";
import { useUserContext } from "../hooks/useUserContext";
import { API } from "../config/constants";
import { fetchWithAuth } from "../utils/fetchWithAuth";

const navLinks = [
  {
    href: "https://dns-shop.ru",
    icon: IconBasket,
    name: "DNS-Shop",
    description: "Магазин"
  },
  {
    href: "http://sale.partner.ru/login",
    icon: IconAppWindow,
    name: "Web - База",
    description: "Портал продаж"
  },
  {
    href: "https://docs.dns-shop.ru/",
    icon: IconBriefcase,
    name: "Docs",
    description: "Документация"
  },
  {
    href: "https://media2.dns-shop.ru/",
    icon: IconBrandRumble,
    name: "Media2",
    description: "Медиа портал"
  },
  {
    href: "https://ecosystem.dns-shop.ru/stream",
    icon: IconNews,
    name: "EcoSystem",
    description: "Новости компании"
  },
  {
    href: window.location.host.includes('localhost') ? `https://dns-zs.partner.ru/uweb` : `https://${window.location.host}/uweb`,
    icon: IconBrandUnity,
    name: "Uweb",
    description: "Планограммы"
  },
  {
    href: "https://dns-go.dns-shop.ru",
    icon: IconAlien,
    name: "DNS-GO",
    description: "Заявочная система"
  },
  {
    href: "https://dashboards.dns-shop.ru",
    icon: IconDashboard,
    name: "Dashboards",
    description: "Портал дашбордов"
  },
];

function Footer() {
  const { user, token } = useUserContext();
  
  // Состояния для футера
  const [isScrolled, setIsScrolled] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [autoHideEnabled, setAutoHideEnabled] = useState(false);
  const [hideTimer, setHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Загрузка настройки автоскрытия футера
  useEffect(() => {
    const loadFooterSetting = async () => {
      // Проверяем наличие пользователя и токена перед запросом
      if (!user?.id || !token) {
        // Если пользователь не загружен или токена нет, используем значение по умолчанию
        setAutoHideEnabled(false);
        return;
      }
      
      try {
        const response = await fetchWithAuth(`${API}/user/settings/${user.id}/auto_hide_footer`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        // Если получили 401 даже после попытки обновления, используем значение по умолчанию
        if (!response || response.status === 401) {
          setAutoHideEnabled(false);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setAutoHideEnabled(data.value === 'true');
        } else if (response.status === 404) {
          // Если настройка не найдена, используем значение по умолчанию (отключено)
          setAutoHideEnabled(false);
        } else {
          // Для любых других ошибок используем значение по умолчанию
          setAutoHideEnabled(false);
        }
      } catch (error) {
        // Игнорируем ошибки, используем значение по умолчанию
        setAutoHideEnabled(false);
      }
    };

    if (user?.id && token) {
      loadFooterSetting();
    }
  }, [user?.id, token]);

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
        </div>
      </div>
    </AppShell.Footer>
  );
}

export default Footer;