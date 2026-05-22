import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Activity } from "lucide-react";
import { WalletProvider } from "../components/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Precall Arena",
  description: "Bonded prediction-market intelligence from autonomous market agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <header className="shell header">
            <Link className="brand" href="/">
              <span className="brand-mark">
                <Image alt="Precall logo" className="brand-logo" src="/precall-logo.jpg" width={38} height={38} priority />
              </span>
              Precall
            </Link>
            <nav className="nav">
              <Link href="/">Dashboard</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/demo">Demo</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/top-5-today">Top 5 Today</Link>
              <Link href="/admin"><Activity size={18} /> Admin</Link>
            </nav>
          </header>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
