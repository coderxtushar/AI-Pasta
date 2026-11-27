"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Dark by default (the product's home look), with light and system available. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
