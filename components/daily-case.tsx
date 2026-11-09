"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Daily } from "@/lib/contracts/daily";
import { api } from "./api";
import { StartButton } from "./start-button";

export function DailyCase() {
  const [daily, setDaily] = useState<Daily | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const refresh = useCallback(() => {
    void api<Daily>("daily")
      .then(setDaily)
      .catch(() => setDaily(null));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  useEffect(() => {
    if (!daily) return;
    const wait = Date.parse(daily.resetsAt) - Date.parse(daily.serverTime);
    const deadline = performance.now() + wait;
    const update = () =>
      setRemaining(
        Math.max(0, Math.ceil((deadline - performance.now()) / 60000)),
      );
    const countdown = window.setInterval(update, 1000);
    const reset = window.setTimeout(refresh, Math.max(1000, wait));
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(reset);
    };
  }, [daily, refresh]);
  if (!daily) return null;

  const { release, archive, resume, day, streak } = daily;
  const localReset = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(daily.resetsAt));

  return (
    <section className="group-teaser daily-card" aria-label="Daily mystery">
      <div>
        <span className="eyebrow">
          {release ? "DAILY MYSTERY" : "FROM THE ARCHIVE"}
        </span>
        <h2>{release?.title ?? archive?.title ?? "Find a free mystery"}</h2>
        <p>
          {release
            ? `${streak} day${streak === 1 ? "" : "s"} in your streak. Resets at midnight UTC (${localReset} locally).`
            : "There’s no scheduled case today. Archive play is free and does not count towards a streak."}
        </p>
        {release && remaining !== null && (
          <p>
            Next UTC reset in {Math.floor(remaining / 60)}h {remaining % 60}m.
          </p>
        )}
        {resume && (
          <Link className="text-link" href={`/play/${resume.attemptId}`}>
            Resume {resume.title} from {resume.day}
          </Link>
        )}
      </div>
      {release?.attemptId ? (
        <Link className="button lime" href={`/play/${release.attemptId}`}>
          {release.completed ? "View today’s result" : "Resume today’s case"}
        </Link>
      ) : release ? (
        <StartButton
          caseId={release.caseId}
          label="Play today’s case"
          daily={{ day, versionId: release.versionId, onChanged: refresh }}
        />
      ) : archive ? (
        <StartButton caseId={archive.caseId} label="Play archive case" />
      ) : (
        <Link href="/explore?access=free&mode=solo" className="button lime">
          Browse free cases
        </Link>
      )}
    </section>
  );
}
