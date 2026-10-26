"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "college_erp_theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDocument(resolved: ResolvedTheme, explicitTheme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }

  // Update meta[name="color-scheme"]
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute(
      "content",
      explicitTheme === "system" ? "light dark" : resolved
    );
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage (defaulting to "system")
  useEffect(() => {
    let initialTheme: Theme = "system";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialTheme = stored;
      }
    } catch {}

    const resolved = initialTheme === "system" ? getSystemTheme() : initialTheme;
    setThemeState(initialTheme);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved, initialTheme);
    setMounted(true);
  }, []);

  // Listen for OS system theme changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      setThemeState((currentTheme) => {
        if (currentTheme === "system") {
          const newResolved: ResolvedTheme = media.matches ? "dark" : "light";
          setResolvedTheme(newResolved);
          applyThemeToDocument(newResolved, "system");
        }
        return currentTheme;
      });
    };

    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    } else if (media.addListener) {
      // Legacy Safari
      media.addListener(handleChange);
      return () => media.removeListener(handleChange);
    }
  }, []);

  // Listen for storage events across browser tabs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const val = event.newValue as Theme | null;
        const newTheme: Theme = val === "light" || val === "dark" ? val : "system";
        const newResolved = newTheme === "system" ? getSystemTheme() : newTheme;
        setThemeState(newTheme);
        setResolvedTheme(newResolved);
        applyThemeToDocument(newResolved, newTheme);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    try {
      if (newTheme === "system") {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, newTheme);
      }
    } catch {}

    const newResolved: ResolvedTheme = newTheme === "system" ? getSystemTheme() : newTheme;
    setThemeState(newTheme);
    setResolvedTheme(newResolved);
    applyThemeToDocument(newResolved, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    // Quick toggle: switch to opposite of current resolved theme
    const next: ResolvedTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
