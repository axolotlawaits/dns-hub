// Конфигурация типов конструкций
const CONSTRUCTION_CONFIG: Record<string, {
  color: string;
  gradient: string;
  gradientHorizontal: string;
  cssGradient: string;
  indicatorGradient: string;
  icon: string;
}> = {
  баннер: {
    color: 'blue',
    gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    gradientHorizontal: 'linear-gradient(90deg, #3b82f6, #1d4ed8, #1e40af)',
    cssGradient: 'linear-gradient(180deg, var(--color-blue-400), var(--color-blue-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-blue-500), var(--color-blue-600))',
    icon: '📢'
  },
  другое: {
    color: 'gray',
    gradient: 'linear-gradient(135deg, #6b7280, #4b5563)',
    gradientHorizontal: 'linear-gradient(90deg, #6b7280, #4b5563, #374151)',
    cssGradient: 'linear-gradient(180deg, var(--color-gray-400), var(--color-gray-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-gray-500), var(--color-gray-600))',
    icon: '📋'
  },
  лайтбокс: {
    color: 'yellow',
    gradient: 'linear-gradient(135deg, #eab308, #ca8a04)',
    gradientHorizontal: 'linear-gradient(90deg, #eab308, #ca8a04, #a16207)',
    cssGradient: 'linear-gradient(180deg, var(--color-yellow-400), var(--color-yellow-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-yellow-500), var(--color-yellow-600))',
    icon: '💡'
  },
  'объемные световые элементы': {
    color: 'purple',
    gradient: 'linear-gradient(135deg, #9333ea, #7c3aed)',
    gradientHorizontal: 'linear-gradient(90deg, #9333ea, #7c3aed, #6d28d9)',
    cssGradient: 'linear-gradient(180deg, var(--color-purple-400), var(--color-purple-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-purple-500), var(--color-purple-600))',
    icon: '✨'
  },
  'объемные буквы': {
    color: 'green',
    gradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
    gradientHorizontal: 'linear-gradient(90deg, #22c55e, #16a34a, #15803d)',
    cssGradient: 'linear-gradient(180deg, var(--color-green-400), var(--color-green-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-green-500), var(--color-green-600))',
    icon: '🔤'
  },
  пневмофигура: {
    color: 'pink',
    gradient: 'linear-gradient(135deg, #ec4899, #db2777)',
    gradientHorizontal: 'linear-gradient(90deg, #ec4899, #db2777, #be185d)',
    cssGradient: 'linear-gradient(180deg, var(--color-pink-400), var(--color-pink-500))',
    indicatorGradient: 'linear-gradient(135deg, var(--color-pink-500), var(--color-pink-600))',
    icon: '🎈'
  }
};

const DEFAULT_CONFIG = {
  color: 'orange',
  gradient: 'linear-gradient(135deg, #f97316, #ea580c)',
  gradientHorizontal: 'linear-gradient(90deg, #f97316, #ea580c, #dc2626)',
  cssGradient: 'linear-gradient(180deg, var(--color-orange-400), var(--color-blue-400))',
  indicatorGradient: 'linear-gradient(135deg, var(--color-orange-500), var(--color-orange-600))',
  icon: '🏗️'
};

const findConfig = (typeName: string) => {
  const name = typeName?.toLowerCase() || '';
  for (const [key, config] of Object.entries(CONSTRUCTION_CONFIG)) {
    if (name.includes(key)) return config;
  }
  return DEFAULT_CONFIG;
};

export const getConstructionColor = (typeName: string): string => findConfig(typeName).color;
export const getConstructionGradient = (typeName: string): string => findConfig(typeName).gradient;
export const getConstructionGradientHorizontal = (typeName: string): string => findConfig(typeName).gradientHorizontal;
export const getConstructionCssGradient = (typeName: string): string => findConfig(typeName).cssGradient;
export const getConstructionIndicatorGradient = (typeName: string): string => findConfig(typeName).indicatorGradient;
export const getConstructionIcon = (typeName: string): string => findConfig(typeName).icon;

// Статусы
const STATUS_CONFIG: Record<string, string> = {
  согласован: 'green',
  одобрен: 'green',
  утвержден: 'green',
  отклонен: 'red',
  отказ: 'red',
  ожидает: 'yellow',
  проверка: 'yellow',
  рассмотрение: 'yellow',
  черновик: 'blue',
  'в работе': 'blue'
};

export const getStatusColor = (statusName: string): string => {
  const name = statusName?.toLowerCase() || '';
  for (const [key, color] of Object.entries(STATUS_CONFIG)) {
    if (name.includes(key)) return color;
  }
  return 'gray';
};

