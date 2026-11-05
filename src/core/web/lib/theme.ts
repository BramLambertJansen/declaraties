// Licht of donker thema (framework §7: dark mode via [data-theme=dark] op <html>). De keuze blijft in deze browser bewaard;
// zonder keuze is het thema licht. localStorage kan ontbreken of weigeren (privévenster): dan geldt de keuze alleen nu.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'thema';

export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  return root.dataset['theme'] === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset['theme'] = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Niet bewaard; het thema geldt nog wel tot de pagina herlaadt.
  }
}

// Bij het opstarten (main.tsx), vóór de eerste render: het bewaarde thema terugzetten.
export function applyStoredTheme(root: HTMLElement = document.documentElement): void {
  root.dataset['theme'] = storedTheme();
}

function storedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
