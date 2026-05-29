import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Clay Performance Lab", description: "Performance analysis for clay target shooters." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="logoRow">
            <Link href="/dashboard" className="brandLockup" aria-label="Clay Performance Lab dashboard">
              <span className="mark" />
              <div>
                <h1>Clay Performance Lab</h1>
                <div className="small muted">Performance analysis for clay target shooters</div>
              </div>
            </Link>
            <nav className="topNav" aria-label="Primary navigation">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/stats">Stats</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
