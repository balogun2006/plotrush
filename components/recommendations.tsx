"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "./api";
import { CaseCard as Card } from "@/lib/domain/content";
import { CaseCard } from "./case-card";
export function Recommendations() {
  const [data, setData] = useState<{
      label: string;
      cases: (Card & { recommendationReason: string })[];
      replays: (Card & { recommendationReason: string })[];
    } | null>(null),
    [error, setError] = useState(""),
    [includeCompleted, setIncludeCompleted] = useState(false);
  useEffect(() => {
    let live = true;
    let sequence = 0;
    function refresh() {
      const request = ++sequence;
      api<typeof data>(`recommendations?includeCompleted=${includeCompleted}`)
        .then((r) => {
          if (live && request === sequence) {
            setData(r);
            setError("");
          }
        })
        .catch(() => {
          if (live && request === sequence)
            setError("Cases could not load. Please refresh to try again.");
        });
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "plotrush:interests-changed") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("plotrush:interests-changed", refresh);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("plotrush:interests-changed", refresh);
    };
  }, [includeCompleted]);
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SMALL CASES. BIG DETECTIVE ENERGY.</span>
          <h2>
            {data?.label === "For you"
              ? "Your next plot twist"
              : "Featured mysteries"}
          </h2>
        </div>
        <Link className="text-link" href="/interests">
          Make it yours <ArrowRight size={17} />
        </Link>
      </div>
      <label>
        <input
          type="checkbox"
          checked={includeCompleted}
          onChange={(event) => setIncludeCompleted(event.target.checked)}
        />
        Include completed and started cases
      </label>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !data ? (
        <div className="loading-card" role="status">
          Finding your next mystery…
        </div>
      ) : data.cases.length ? (
        <div className="case-grid">
          {data.cases.map((c) => (
            <div key={c.id}>
              <CaseCard item={c} />
              {data.label === "For you" && (
                <p className="recommendation-reason">
                  {c.recommendationReason}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>More mysteries are coming.</h3>
          <p>
            Revisit a favourite from your case library while we prepare more
            stories.
          </p>
          <Link className="button dark" href="/library">
            My cases
          </Link>
        </div>
      )}
      {includeCompleted && !!data?.replays.length && (
        <div>
          <h3>Previously played mysteries</h3>
          <p>These cases may contain clues or solutions you already know.</p>
          <div className="case-grid">
            {data.replays.map((c) => (
              <CaseCard key={c.id} item={c} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
