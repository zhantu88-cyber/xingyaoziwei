'use client';
import { createContext, useContext } from 'react';

export type Theme = 'light';

const ThemeContext = createContext<Theme>('light');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value="light">
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => ({ theme: useContext(ThemeContext) });
