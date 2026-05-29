import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Clay Performance Lab", description: "Performance analysis for clay target shooters." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><header className="header"><div className="logoRow"><span className="mark"/><div><h1>Clay Performance Lab</h1><div className="small muted">Performance analysis for clay target shooters</div></div></div></header>{children}</body></html>;
}
