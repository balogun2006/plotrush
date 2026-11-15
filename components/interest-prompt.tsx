"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";
export function InterestPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    try {
      if (localStorage.getItem("plotrush:interests-prompt-dismissed")) return;
    } catch {
      /* A blocked storage API never blocks play. */
    }
    api<{ eligible: boolean }>("me/interest-prompt")
      .then((r) => {
        if (live) setShow(r.eligible);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  function dismiss() {
    try {
      localStorage.setItem("plotrush:interests-prompt-dismissed", "1");
    } catch {}
    setShow(false);
  }
  if (!show) return null;
  return (
    <section className="room-panel" aria-label="Optional interests">
      <h2>Make your next mystery more your style</h2>
      <p>
        Choose optional themes, moods and difficulty. No email is needed, and
        you can keep playing without choosing.
      </p>
      <Link className="button lime" href="/interests" onClick={dismiss}>
        Choose optional interests
      </Link>
      <button className="text-button" onClick={dismiss}>
        Skip interests
      </button>
    </section>
  );
}
