import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";

/** Single editorial palette — indigo (see TopBar / theme picker removed). */
export const THEMES = ["indigo"];

export function ThemeProvider({ children, ...props }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="indigo"
      forcedTheme="indigo"
      enableSystem={false}
      disableTransitionOnChange
      themes={THEMES}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export function useTheme() {
  const { resolvedTheme, setTheme } = useNextTheme();
  return {
    theme: resolvedTheme ?? "indigo",
    setTheme,
    themes: THEMES,
    /** Deprecated — UI no longer exposes theme cycling; palette is fixed Indigo. */
    toggle: () => {},
  };
}
