import type { Metadata } from "next";
import AuthHeader from "./components/AuthHeader";
import ProfileGate from "./components/ProfileGate";
import { ThemeProvider } from "./components/ThemeProvider";
import "./globals.css";
import "./theme-final-fixes.css";

export const metadata: Metadata = { title: "Clay Performance Lab", description: "Performance analysis for clay target shooters." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-appearance="system" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var key='cpl-appearance';var mode=localStorage.getItem(key);if(mode!=='light'&&mode!=='dark')mode='system';var theme=mode==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):mode;document.documentElement.dataset.appearance=mode;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();` }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthHeader />
          <ProfileGate>{children}</ProfileGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
