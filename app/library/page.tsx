"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, Check } from "lucide-react";
import { api, ApiError } from "@/components/api";
import { PremiumPlay } from "@/components/premium-play";
type OwnedCase = { caseId: string; title: string; mode: "solo" | "group" };
type Item = {
  id: string;
  title: string;
  state: string;
  result: { score: number } | null;
  started_at: string;
};
export default function Library() {
  const [items, setItems] = useState<Item[] | null>(null),
    [error, setError] = useState(""),
    [owned, setOwned] = useState<OwnedCase[]>([]),
    [ownedError, setOwnedError] = useState("");
  useEffect(() => {
    api<Item[]>("me/library")
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setItems([]);
        else setError(e.message);
      });
    api<OwnedCase[]>("me/premium")
      .then(setOwned)
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 401))
          setOwnedError(e.message);
      });
  }, []);
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <span className="eyebrow">YOUR DETECTIVE DESK</span>
        <h1>
          The plot <em>continues.</em>
        </h1>
        <p>Pick up a thread. Revisit an aha moment.</p>
      </div>
      {ownedError && (
        <p role="alert" className="error">
          {ownedError}
        </p>
      )}
      {owned.length > 0 && (
        <section className="room-panel">
          <h2>Purchased cases</h2>
          {owned.map((c) => (
            <div key={c.caseId + ":" + c.mode} className="room-actions">
              <strong>
                {c.title} · {c.mode}
              </strong>
              <PremiumPlay caseId={c.caseId} mode={c.mode} />
            </div>
          ))}
        </section>
      )}
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !items ? (
        <p role="status" className="loading-card">
          Finding your case files…
        </p>
      ) : !items.length && !owned.length ? (
        <div className="empty-state">
          <Bookmark size={37} />
          <h2>Your first case is waiting.</h2>
          <p>Start a free mystery. We’ll keep your progress here.</p>
          <Link className="button lime" href="/explore?access=free&mode=solo">
            Explore free cases <ArrowUpRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="library-grid">
          {items.map((a) => (
            <Link key={a.id} className="library-item" href={"/play/" + a.id}>
              <span
                className={
                  "library-status " + (a.state === "revealed" ? "closed" : "")
                }
              >
                {a.state === "revealed" ? (
                  <Check size={17} />
                ) : (
                  <Bookmark size={17} />
                )}
              </span>
              <div>
                <span className="eyebrow">
                  {a.state === "revealed"
                    ? "CASE CLOSED"
                    : a.state === "abandoned"
                      ? "SAVED AT ACCOUNT MERGE"
                      : "IN PROGRESS"}
                </span>
                <h2>{a.title}</h2>
                <p>
                  {a.result
                    ? `${a.result.score}/100 · View your reveal`
                    : a.state === "abandoned"
                      ? "View saved notes"
                      : "Continue investigating"}
                </p>
              </div>
              <ArrowUpRight size={22} />
            </Link>
          ))}
        </div>
      )}
      <p className="save-note">
        Guest progress stays with this browser. Email verification, when
        available, saves it to your account.
      </p>
    </div>
  );
}
