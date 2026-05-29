import type { Metadata } from "next";
import Link from "next/link";
import { PrimaryNav } from "./PrimaryNav";
import "./globals.css";

export const metadata: Metadata = { title: "Clay Performance Lab", description: "Performance analysis for clay target shooters." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="logoRow">
            <Link href="/" className="brandLockup" aria-label="Clay Performance Lab home">
              <span className="mark" />
              <div>
                <h1>Clay Performance Lab</h1>
                <div className="small muted">Performance analysis for clay target shooters</div>
              </div>
            </Link>
            <PrimaryNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
