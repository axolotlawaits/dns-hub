import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface PageHeader {
  title?: string;
  subtitle?: string;
  actionButton?: {
    text: string;
    onClick: () => void;
    icon?: ReactNode;
    loading?: boolean;
  };
}

interface PageHeaderContextType {
  header: PageHeader;
  setHeader: (header: PageHeader) => void;
  clearHeader: () => void;
}

const PageHeaderContext = createContext<PageHeaderContextType | undefined>(undefined);

export const usePageHeader = () => {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error('usePageHeader must be used within a PageHeaderProvider');
  }
  return context;
};

interface PageHeaderProviderProps {
  children: ReactNode;
}

export const PageHeaderProvider: React.FC<PageHeaderProviderProps> = ({ children }) => {
  const [header, setHeader] = useState<PageHeader>({});

  const clearHeader = useCallback(() => {
    setHeader({});
  }, []);

  const setHeaderMemo = useCallback((newHeader: PageHeader) => {
    setHeader(newHeader);
  }, []);

  return (
    <PageHeaderContext.Provider value={{ header, setHeader: setHeaderMemo, clearHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
};
