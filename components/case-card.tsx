import Link from "next/link";
import {
  Clock3,
  ArrowUpRight,
  FileSearch,
  Package,
  Music2,
} from "lucide-react";
import { CaseCard as Card } from "@/lib/domain/content";
import { labels, duration, Filters } from "@/lib/domain/catalogue";
import { StartButton } from "./start-button";
const styles: Record<
  string,
  { icon: typeof FileSearch; number: string; label: string; className: string }
> = {
  "missing-mic": {
    icon: Music2,
    number: "004",
    label: "ONE MYSTERY. DIFFERENT CLUES.",
    className: "playlist",
  },
  "last-slice": {
    icon: FileSearch,
    number: "001",
    label: "A SMALL DISAPPEARANCE",
    className: "slice",
  },
  "wrong-parcel": {
    icon: Package,
    number: "002",
    label: "SIGNED. SEALED. MISSING.",
    className: "parcel",
  },
  "playlist-switch": {
    icon: Music2,
    number: "003",
    label: "SOMEBODY CHANGED THE RECORD",
    className: "playlist",
  },
};
export function CaseCard({ item, filters }: { item: Card; filters?: Filters }) {
  const s = styles[item.id] ?? styles["last-slice"];
  const Icon = s.icon;
  const minutes = filters
    ? duration(item, filters)
    : (item.discovery.estimatedDurationMinutes.solo ??
      item.discovery.estimatedDurationMinutes.group);
  return (
    <article className="case-card">
      <div className={"case-cover " + s.className}>
        <span className="file-number">CASE / {s.number}</span>
        <span className="free-badge">
          {item.modes.includes("solo") ? "FREE SOLO" : "FREE GROUP"}
        </span>
        <div className="cover-orbit" />
        <Icon className="cover-icon" size={95} strokeWidth={1.1} />
        <span className="cover-caption">{s.label}</span>
        <span className="cover-arrow">
          <ArrowUpRight size={21} />
        </span>
      </div>
      <div className="case-content">
        <div className="case-meta">
          {labels[item.discovery.primaryTheme]}
          <span>·</span>
          {labels[item.discovery.difficulty]}
        </div>
        <h3>{item.title}</h3>
        <p>{item.synopsis}</p>
        <div className="case-bottom">
          <span>
            <Clock3 size={15} />
            {minutes} min
          </span>
          {item.modes.includes("solo") ? (
            <StartButton caseId={item.id} label="Play case" />
          ) : (
            <Link href="/rooms" className="button lime">
              Play together
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
