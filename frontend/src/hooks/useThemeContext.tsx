import { useTheme, ThemeColors } from "../contexts/ThemeContext";

export function useThemeContext() {
  return useTheme();
}

// Хук для удобного доступа к цветам темы
export function useThemeColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

// Хук для получения предустановленных стилей
export function useThemeStyles() {
  const { styles } = useTheme();
  return styles;
}