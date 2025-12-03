import { createContext, useContext, useState } from 'react';

interface SelectedCategoryContextType {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const AppContext = createContext<SelectedCategoryContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  return (
    <AppContext.Provider value={{ selectedId, setSelectedId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
