import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AuthHeader from "./components/AuthHeader";
import ProfileGate from "./components/ProfileGate";
import { ThemeProvider } from "./components/ThemeProvider";
import { OnboardingHelpPanel } from "./components/OnboardingHelp";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import { PwaInstallProvider } from "./components/PwaInstallProvider";
import { AppNavigationProvider } from "./components/navigation/AppNavigationProvider";
import "./globals.css";
import "./beta-admin-theme.css";

export const metadata: Metadata = {
  title: "Clay Performance Lab",
  applicationName: "Clay Performance Lab",
  description: "Performance analysis and training tools for clay target shooters.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Clay Performance Lab",
    statusBarStyle: "black",
  },
  icons: {
    icon: [
      { url: "/pwa-icons/192", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icons/512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa-icons/apple", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070a0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-appearance="system" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var key='cpl-appearance';var mode=localStorage.getItem(key);if(mode!=='light'&&mode!=='dark')mode='system';var theme=mode==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):mode;document.documentElement.dataset.appearance=mode;document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;}catch(e){}})();` }} />
      </head>
      <body>
        <ThemeProvider>
          <PwaInstallProvider>
            <ServiceWorkerRegistration />
            <AuthHeader />
            <OnboardingHelpPanel />
            <Suspense fallback={null}>
              <AppNavigationProvider>
                <ProfileGate>{children}</ProfileGate>
              </AppNavigationProvider>
            </Suspense>
          </PwaInstallProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
