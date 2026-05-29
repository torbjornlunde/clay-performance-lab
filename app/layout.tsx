import type { Metadata } from "next";
import AuthHeader from "./components/AuthHeader";
import "./globals.css";

export const metadata: Metadata = { title: "Clay Performance Lab", description: "Performance analysis for clay target shooters." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthHeader />
        {children}
      </body>
    </html>
  );
}
