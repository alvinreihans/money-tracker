"use client";

import { BaseStyles, ThemeProvider } from "@primer/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider colorMode="night" nightScheme="dark">
      <BaseStyles>{children}</BaseStyles>
    </ThemeProvider>
  );
}
