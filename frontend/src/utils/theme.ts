/**
 * Утилиты для работы с темой
 * Предоставляет удобные функции для получения цветов и стилей
 */

import { ThemeColors } from '../contexts/ThemeContext';

/**
 * Получить цвет из объекта цветов по пути
 * @example getColorFromPath(colors, 'bg.primary') => colors.bg.primary
 */
export function getColorFromPath(colors: ThemeColors, path: string): string {
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
}

/**
 * Создать стили для Paper компонента
 */
export function createPaperStyles(colors: ThemeColors, options?: {
  withBorder?: boolean;
  radius?: string;
  padding?: string;
}): React.CSSProperties {
  return {
    background: colors.bg.elevated,
    ...(options?.withBorder !== false && {
      border: `1px solid ${colors.border.primary}`,
    }),
    borderRadius: options?.radius || 'var(--radius-lg)',
    color: colors.text.primary,
    ...(options?.padding && { padding: options.padding }),
  };
}

/**
 * Создать стили для Card компонента
 */
export function createCardStyles(colors: ThemeColors, options?: {
  withBorder?: boolean;
  radius?: string;
}): React.CSSProperties {
  return {
    background: colors.bg.elevated,
    ...(options?.withBorder !== false && {
      border: `1px solid ${colors.border.primary}`,
    }),
    borderRadius: options?.radius || 'var(--radius-md)',
    color: colors.text.primary,
  };
}

/**
 * Создать стили для Input компонента
 */
export function createInputStyles(colors: ThemeColors, options?: {
  focused?: boolean;
}): React.CSSProperties {
  return {
    background: colors.bg.secondary,
    border: `1px solid ${options?.focused ? colors.border.focus : colors.border.primary}`,
    borderRadius: 'var(--radius-lg)',
    color: colors.text.primary,
  };
}

/**
 * Создать стили для Button компонента
 */
export function createButtonStyles(
  colors: ThemeColors,
  variant: 'primary' | 'secondary' | 'outline' = 'primary'
): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
        color: colors.text.inverse,
        border: 'none',
        borderRadius: 'var(--radius-md)',
      };
    case 'secondary':
      return {
        background: colors.bg.secondary,
        border: `1px solid ${colors.border.primary}`,
        color: colors.text.primary,
        borderRadius: 'var(--radius-md)',
      };
    case 'outline':
      return {
        background: 'transparent',
        border: `1px solid ${colors.border.primary}`,
        color: colors.text.primary,
        borderRadius: 'var(--radius-md)',
      };
    default:
      return {};
  }
}

/**
 * Создать стили для Table компонента
 */
export function createTableStyles(colors: ThemeColors): {
  th: React.CSSProperties;
  td: React.CSSProperties;
  tr: React.CSSProperties;
  trHover: React.CSSProperties;
} {
  return {
    th: {
      background: colors.bg.elevated,
      color: colors.text.primary,
      borderBottom: `1px solid ${colors.border.primary}`,
      fontWeight: 600,
    },
    td: {
      color: colors.text.primary,
      borderBottom: `1px solid ${colors.border.primary}`,
    },
    tr: {
      color: colors.text.primary,
      transition: 'background-color 0.2s ease',
    },
    trHover: {
      background: colors.bg.hover,
    },
  };
}

