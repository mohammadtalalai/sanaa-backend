import { createContext, useContext, type ReactNode } from 'react';
import { useAppState } from './useAppState';

type AppContextValue = ReturnType<typeof useAppState>;
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ page, children }: { page: string; children: ReactNode }) {
  const value = useAppState(page);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
