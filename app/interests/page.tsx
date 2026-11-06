"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { api } from "@/components/api";
import { themes } from "@/lib/domain/content";
import { labels } from "@/lib/domain/catalogue";
export default function Interests() {
  const [selected, setSelected] = useState<string[]>([]),
    [version, setVersion] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ themes: string[]; version: number }>("interests")
      .then((r) => {
        setSelected(r.themes);
        setVersion(r.version);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(clear = false) {
    setBusy(true);
    setError("");
    try {
      const next = await api<{ themes: string[]; version: number }>(
        "interests",
        "PUT",
        { themes: clear ? [] : selected, expectedVersion: version },
      );
      setVersion(next.version);
      setSelected(next.themes);
      setNotice(
        clear
          ? "Interests cleared."
          : "Your interests are saved in this browser.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="interests-wrap">
      <span className="eyebrow">COMPLETELY OPTIONAL</span>
      <h1>
        Your kind of <em>plot twist.</em>
      </h1>
      <p>
        Choose the worlds you’d like to explore. We’ll use these for case
        recommendations, never advertising audiences.
      </p>
      <p className="save-note">
        Only Everyday Mystery is playable in this preview. Other themes are
        preferences for future content.
      </p>
      <div className="interest-grid">
        {themes.map((t) => (
          <button
            className={"interest " + (selected.includes(t) ? "selected" : "")}
            key={t}
            aria-pressed={selected.includes(t)}
            disabled={!ready || busy}
            onClick={() => {
              setNotice("");
              setSelected((xs) =>
                xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t],
              );
            }}
          >
            {labels[t]}
            {selected.includes(t) ? <Check size={18} /> : <span>+</span>}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      <div className="interest-actions">
        <button
          className="button lime"
          disabled={!ready || busy}
          onClick={() => save()}
        >
          Save my interests <Check size={17} />
        </button>
        <Link className="text-link" href="/explore">
          Skip and explore <ArrowRight size={16} />
        </Link>
        <button
          className="text-button"
          disabled={!ready || busy}
          onClick={() => save(true)}
        >
          Clear interests
        </button>
      </div>
      <p className="save-note">
        No email needed. Preferences and progress belong to this browser;
        clearing cookies removes access.
      </p>
    </div>
  );
}
