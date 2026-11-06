import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Bookmark, ScanSearch, ArrowUpRight } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "PlotRush · Every clue changes everything",
    template: "%s · PlotRush",
  },
  description:
    "A little mystery. A big aha. Play free fictional investigations, at your own pace.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="header">
          <Link href="/" className="brand" aria-label="PlotRush home">
            <span className="brand-mark">
              <ScanSearch size={24} />
            </span>
            plotrush<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/explore">
              <Compass size={17} /> Explore
            </Link>
            <Link href="/rooms">Play together</Link>
            <Link href="/library">
              <Bookmark size={17} /> My cases
            </Link>
            <Link className="nav-cta" href="/explore?mode=solo&access=free">
              Find a mystery <ArrowUpRight size={16} />
            </Link>
          </nav>
        </header>
        <div className="preview-bar">
          <span className="status-dot" /> EARLY PREVIEW{" "}
          <span className="preview-copy">
            Fictional draft cases · free to play · no ads or payments
          </span>
        </div>
        <main id="main">{children}</main>
        <footer>
          <Link href="/" className="brand footer-brand">
            plotrush.
          </Link>
          <p>Every clue changes everything.</p>
          <span>Made for curious minds. All stories are fictional.</span>
          <Link href="/interests">Your interests</Link>
        </footer>
      </body>
    </html>
  );
}
