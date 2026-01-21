import React, { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { API } from '../config/constants';

// Типы для цветов темы
export interface ThemeColors {
  // Фоны
  bg: {
    primary: string;
    secondary: string;
    tertiary: string;
    elevated: string;
    hover: string;
    active: string;
    selected: string;
  };
  // Текст
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    disabled: string;
    inverse: string;
  };
  // Границы
  border: {
    primary: string;
    secondary: string;
    focus: string;
  };
  // Тени
  shadow: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  // Семантические цвета
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
}

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  theme: 'light' | 'dark';
  colors: ThemeColors;
  // Удобные функции для получения цветов
  getColor: (path: string) => string;
  // Стили для компонентов
  styles: {
    paper: React.CSSProperties;
    card: React.CSSProperties;
    input: React.CSSProperties;
    button: {
      primary: React.CSSProperties;
      secondary: React.CSSProperties;
    };
  };
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

// Определение цветов для светлой темы
const lightColors: ThemeColors = {
  bg: {
    primary: 'var(--color-gray-50)',
    secondary: '#ffffff',
    tertiary: 'var(--color-gray-100)',
    elevated: '#ffffff',
    hover: 'var(--color-gray-100)',
    active: 'var(--color-primary-100)',
    selected: 'var(--color-primary-500)',
  },
  text: {
    primary: 'var(--color-gray-900)',
    secondary: 'var(--color-gray-600)',
    tertiary: 'var(--color-gray-500)',
    disabled: 'var(--color-gray-400)',
    inverse: '#ffffff',
  },
  border: {
    primary: 'var(--color-gray-200)',
    secondary: 'var(--color-gray-300)',
    focus: 'var(--color-primary-500)',
  },
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
};

// Определение цветов для темной темы
const darkColors: ThemeColors = {
  bg: {
    primary: 'var(--color-gray-900)',
    secondary: 'var(--color-gray-800)',
    tertiary: 'var(--color-gray-700)',
    elevated: 'var(--color-gray-800)',
    hover: 'var(--color-gray-700)',
    active: 'var(--color-primary-900)',
    selected: 'var(--color-primary-500)',
  },
  text: {
    primary: 'var(--color-gray-100)',
    secondary: 'var(--color-gray-300)',
    tertiary: 'var(--color-gray-400)',
    disabled: 'var(--color-gray-500)',
    inverse: 'var(--color-gray-900)',
  },
  border: {
    primary: 'var(--color-gray-700)',
    secondary: 'var(--color-gray-600)',
    focus: 'var(--color-primary-400)',
  },
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.4)',
  },
  semantic: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Проверяем сохраненную тему в localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    
    // Проверяем системную тему
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    
    return false;
  });

  const theme = isDark ? 'dark' : 'light';
  const colors = useMemo(() => isDark ? darkColors : lightColors, [isDark]);

  // Функция для получения цвета по пути (например, 'bg.primary', 'text.secondary')
  const getColor = (path: string): string => {
    const parts = path.split('.');
    let value: any = colors;
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) {
        console.warn(`Theme color not found: ${path}`);
        return 'transparent';
      }
    }
    return value;
  };

  // Предустановленные стили для компонентов
  const styles = useMemo(() => ({
    paper: {
      background: colors.bg.elevated,
      border: `1px solid ${colors.border.primary}`,
      borderRadius: 'var(--radius-lg)',
      color: colors.text.primary,
    } as React.CSSProperties,
    card: {
      background: colors.bg.elevated,
      border: `1px solid ${colors.border.primary}`,
      borderRadius: 'var(--radius-md)',
      color: colors.text.primary,
    } as React.CSSProperties,
    input: {
      background: colors.bg.secondary,
      border: `1px solid ${colors.border.primary}`,
      borderRadius: 'var(--radius-lg)',
      color: colors.text.primary,
    } as React.CSSProperties,
    button: {
      primary: {
        background: `linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))`,
        color: colors.text.inverse,
        border: 'none',
        borderRadius: 'var(--radius-md)',
      } as React.CSSProperties,
      secondary: {
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.primary}`,
        color: colors.text.primary,
        borderRadius: 'var(--radius-md)',
      } as React.CSSProperties,
    },
  }), [colors]);

  const toggleTheme = async () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    const themeValue = newTheme ? 'dark' : 'light';
    localStorage.setItem('theme', themeValue);
    
    // Сохраняем тему в базу данных для использования в email
    try {
      const userId = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;
      const token = localStorage.getItem('token');
      if (userId && token) {
        await fetch(`${API}/user/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: userId,
            parameter: 'theme',
            value: themeValue,
          }),
        }).catch(() => {
          // Игнорируем ошибки сохранения в БД, тема все равно сохранена в localStorage
        });
      }
    } catch (error) {
      // Игнорируем ошибки
    }
  };

  const setTheme = async (newTheme: 'light' | 'dark') => {
    const isDarkTheme = newTheme === 'dark';
    setIsDark(isDarkTheme);
    localStorage.setItem('theme', newTheme);
    
    // Сохраняем тему в базу данных для использования в email
    try {
      const userId = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;
      const token = localStorage.getItem('token');
      if (userId && token) {
        await fetch(`${API}/user/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: userId,
            parameter: 'theme',
            value: newTheme,
          }),
        }).catch(() => {
          // Игнорируем ошибки сохранения в БД, тема все равно сохранена в localStorage
        });
      }
    } catch (error) {
      // Игнорируем ошибки
    }
  };

  useEffect(() => {
    // Применяем тему к документу
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mantine-color-scheme', theme);
    document.body.className = isDark ? 'dark' : 'light';
    
    // Обновляем meta тег для браузеров
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#f8fafc');
    }

    // Устанавливаем CSS переменные программно для лучшей поддержки
    const root = document.documentElement;
    
    // Устанавливаем основные переменные темы
    Object.entries(colors.bg).forEach(([key, value]) => {
      root.style.setProperty(`--theme-bg-${key}`, value);
    });
    Object.entries(colors.text).forEach(([key, value]) => {
      root.style.setProperty(`--theme-text-${key}`, value);
    });
    Object.entries(colors.border).forEach(([key, value]) => {
      root.style.setProperty(`--theme-border-${key}`, value);
    });
    Object.entries(colors.shadow).forEach(([key, value]) => {
      root.style.setProperty(`--theme-shadow-${key}`, value);
    });
    
    // Устанавливаем Mantine переменные с правильными синеватыми цветами
    // Используем primary для body - это основной фон страницы
    // В темной теме это будет темный цвет (gray-900), в светлой - светлый (gray-50)
    // Устанавливаем реальные значения цветов напрямую для правильной работы
    const bodyColor = isDark ? '#082f49' : '#f8fafc'; // primary-950 (синеватый) для темной, gray-50 для светлой
    const textColor = isDark ? '#f1f5f9' : '#0f172a'; // gray-100 для темной, gray-900 для светлой
    const dimmedColor = isDark ? '#cbd5e1' : '#475569'; // gray-300 для темной, gray-600 для светлой
    
    root.style.setProperty('--mantine-color-body', bodyColor);
    root.style.setProperty('--mantine-color-text', textColor);
    root.style.setProperty('--mantine-color-dimmed', dimmedColor);
    
    // Устанавливаем цвета для светлой/темной темы
    if (isDark) {
      // Темная тема - используем --theme-bg-elevated как базовый цвет для гармонии
      // --theme-bg-elevated = gray-800 = #1e293b в темной теме
      // Используем синеватые оттенки из primary палитры, близкие по яркости к gray-800
      // primary-950 (#082f49) ближе всего к gray-800 по яркости и имеет синеватый оттенок
      root.style.setProperty('--mantine-color-dark-0', '#082f49'); // primary-950 (самый темный синеватый)
      root.style.setProperty('--mantine-color-dark-1', '#082f49'); // primary-950 (темный)
      root.style.setProperty('--mantine-color-dark-2', '#082f49'); // primary-950 (темный)
      root.style.setProperty('--mantine-color-dark-3', '#082f49'); // primary-950 (темный)
      root.style.setProperty('--mantine-color-dark-4', '#082f49'); // primary-950 (темный)
      root.style.setProperty('--mantine-color-dark-5', '#082f49'); // primary-950 (темный)
      root.style.setProperty('--mantine-color-dark-6', '#082f49'); // primary-950 (для hover/focus, гармонирует с --theme-bg-elevated)
      root.style.setProperty('--mantine-color-dark-7', '#0c4a6e'); // primary-900 (чуть светлее для контраста)
      root.style.setProperty('--mantine-color-dark-8', '#0c4a6e'); // primary-900 (для активных элементов)
      root.style.setProperty('--mantine-color-dark-9', '#075985'); // primary-800 (самый светлый, но темный)
    } else {
      // Светлая тема - используем синеватые оттенки
      root.style.setProperty('--mantine-color-gray-0', '#f8fafc'); // gray-50
      root.style.setProperty('--mantine-color-gray-1', '#f1f5f9'); // gray-100
      root.style.setProperty('--mantine-color-gray-2', '#e2e8f0'); // gray-200
      root.style.setProperty('--mantine-color-gray-3', '#cbd5e1'); // gray-300
      root.style.setProperty('--mantine-color-gray-4', '#94a3b8'); // gray-400
      root.style.setProperty('--mantine-color-gray-5', '#64748b'); // gray-500
      root.style.setProperty('--mantine-color-gray-6', '#475569'); // gray-600
      root.style.setProperty('--mantine-color-gray-7', '#334155'); // gray-700
      root.style.setProperty('--mantine-color-gray-8', '#1e293b'); // gray-800
      root.style.setProperty('--mantine-color-gray-9', '#0f172a'); // gray-900
    }
  }, [isDark, theme, colors]);

  // Слушаем изменения системной темы
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      // Применяем системную тему только если пользователь не выбрал тему вручную
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setIsDark(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const value: ThemeContextType = {
    isDark,
    toggleTheme,
    setTheme,
    theme,
    colors,
    getColor,
    styles,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Обратная совместимость
export const useThemeContext = useTheme;