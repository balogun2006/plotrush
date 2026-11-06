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
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<typeof data>("recommendations")
      .then((r) => {
        if (live) setData(r);
      })
      .catch(() => {
        if (live)
          setError("Cases could not load. Please refresh to try again.");
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SMALL CASES. BIG DETECTIVE ENERGY.</span>
          <h2>
            {data?.label === "For you"
              ? "Your next plot twist"
              : "Your next five-minute obsession"}
          </h2>
        </div>
        <Link className="text-link" href="/interests">
          Make it yours <ArrowRight size={17} />
        </Link>
      </div>
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
          <h3>You’ve solved every preview case.</h3>
          <p>
            Revisit a favourite from your case library while we prepare more
            stories.
          </p>
          <Link className="button dark" href="/library">
            My cases
          </Link>
        </div>
      )}
    </section>
  );
}
