import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { currentTheme, setTheme } from '../lib/theme.ts';
import { Button } from './button.tsx';

// Schakelaar tussen licht en donker thema (in de topbalk via AppShell, en op /design-system). Een toggle-knop: de naam
// blijft "Donker thema", aria-pressed zegt of het aan staat; het icoon toont wat je krijgt bij klikken.
export function ThemeToggle() {
  const [dark, setDark] = useState(() => currentTheme() === 'dark');
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={uiTexts.darkTheme}
      aria-pressed={dark}
      onClick={() => {
        setTheme(dark ? 'light' : 'dark');
        setDark(!dark);
      }}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
