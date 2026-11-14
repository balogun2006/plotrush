"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { api } from "@/components/api";
import { themes, moods, difficulties } from "@/lib/domain/content";
import type { Interests } from "@/lib/contracts/interests";
import { labels } from "@/lib/domain/catalogue";
export default function Interests() {
  const [selected, setSelected] = useState<string[]>([]),
    [selectedMoods, setSelectedMoods] = useState<string[]>([]),
    [difficulty, setDifficulty] = useState<string>(""),
    [enabled, setEnabled] = useState(true),
    [version, setVersion] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<Interests>("interests")
      .then((r) => {
        setSelected(r.themes);
        setSelectedMoods(r.moods);
        setDifficulty(r.preferredDifficulty ?? "");
        setEnabled(r.personalisationEnabled);
        setVersion(r.version);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(clear = false) {
    setBusy(true);
    setError("");
    try {
      const next = await api<Interests>(
        "interests",
        clear ? "DELETE" : "PUT",
        clear
          ? { expectedVersion: version }
          : {
              themes: selected,
              moods: selectedMoods,
              preferredDifficulty: difficulty || null,
              personalisationEnabled: enabled,
              expectedVersion: version,
            },
      );
      setVersion(next.version);
      setSelected(next.themes);
      setSelectedMoods(next.moods);
      setDifficulty(next.preferredDifficulty ?? "");
      setEnabled(next.personalisationEnabled);
      // Notify another open homepage without storing the private choices locally.
      try {
        localStorage.setItem("plotrush:interests-changed", String(Date.now()));
      } catch {
        /* Saving works when browser storage is unavailable. */
      }
      window.dispatchEvent(new Event("plotrush:interests-changed"));
      setNotice(
        clear
          ? "Interests cleared. Personalised recommendations are off. Your cases and purchases are kept."
          : "Your private interests are saved.",
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
        This preview has Everyday Mystery and Wedding & Family cases. Other
        themes are preferences for future content.
      </p>
      <h2>Themes</h2>
      <div className="interest-grid" role="group" aria-label="Preferred themes">
        {themes.map((t) => (
          <button
            className={"interest " + (selected.includes(t) ? "selected" : "")}
            key={t}
            aria-label={labels[t]}
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
      <h2>Moods</h2>
      <div className="interest-grid" role="group" aria-label="Preferred moods">
        {moods.map((m) => (
          <button
            key={m}
            aria-label={labels[m]}
            className={
              "interest " + (selectedMoods.includes(m) ? "selected" : "")
            }
            aria-pressed={selectedMoods.includes(m)}
            disabled={!ready || busy}
            onClick={() => {
              setNotice("");
              setSelectedMoods((xs) =>
                xs.includes(m) ? xs.filter((x) => x !== m) : [...xs, m],
              );
            }}
          >
            {labels[m]}
            {selectedMoods.includes(m) ? <Check size={18} /> : <span>+</span>}
          </button>
        ))}
      </div>
      <label htmlFor="preferred-difficulty">Preferred difficulty</label>
      <select
        id="preferred-difficulty"
        value={difficulty}
        disabled={!ready || busy}
        onChange={(event) => {
          setNotice("");
          setDifficulty(event.target.value);
        }}
      >
        <option value="">No preference</option>
        {difficulties.map((d) => (
          <option key={d} value={d}>
            {labels[d]}
          </option>
        ))}
      </select>
      <p>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!ready || busy}
            onChange={(event) => {
              setNotice("");
              setEnabled(event.target.checked);
            }}
          />{" "}
          Use my interests for personalised recommendations
        </label>
      </p>
      <p className="save-note">
        When switched off and saved, your choices stay private and
        recommendations use the default selection. Explicit catalogue filters
        always apply.
      </p>
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
          disabled={!ready || busy || version === 0}
          onClick={() => save(true)}
        >
          Clear interests
        </button>
      </div>
      <p className="save-note">
        No email needed. Guest preferences stay with this browser identity;
        verify an account to keep them across devices. Clearing cookies removes
        guest access.
      </p>
    </div>
  );
}
