import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ColumnFiltersState } from '@tanstack/react-table';

interface HeaderFiltersContextType {
  // Состояние фильтров
  filters: Array<{
    type: 'date' | 'text' | 'select';
    columnId: string;
    label: string;
    placeholder?: string;
    width?: number | string;
    options?: Array<{ value: string; label: string }>;
    icon?: React.ReactNode;
  }>;
  columnFilters: ColumnFiltersState;
  
  // Функции управления
  setFilters: (filters: any[]) => void;
  setColumnFilters: (filters: ColumnFiltersState) => void;
  onColumnFiltersChange: (columnId: string, value: any) => void;
  clearAllFilters: () => void;
  
  // Состояние видимости
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
}

const HeaderFiltersContext = createContext<HeaderFiltersContextType | undefined>(undefined);

export const useHeaderFilters = () => {
  const context = useContext(HeaderFiltersContext);
  if (!context) {
    throw new Error('useHeaderFilters must be used within a HeaderFiltersProvider');
  }
  return context;
};

interface HeaderFiltersProviderProps {
  children: ReactNode;
}

export const HeaderFiltersProvider: React.FC<HeaderFiltersProviderProps> = ({ children }) => {
  const [filters, setFilters] = useState<any[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);

  const onColumnFiltersChange = (columnId: string, value: any) => {
    setColumnFilters(prev => {
      const existing = prev.find(f => f.id === columnId);
      if (existing) {
        return prev.map(f => f.id === columnId ? { ...f, value } : f);
      }
      return [...prev, { id: columnId, value }];
    });
  };

  const clearAllFilters = () => {
    setColumnFilters([]);
  };

  const value: HeaderFiltersContextType = {
    filters,
    columnFilters,
    setFilters,
    setColumnFilters,
    onColumnFiltersChange,
    clearAllFilters,
    showFilters,
    setShowFilters,
  };

  return (
    <HeaderFiltersContext.Provider value={value}>
      {children}
    </HeaderFiltersContext.Provider>
  );
};
