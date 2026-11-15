"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Lightbulb,
  LockKeyhole,
  NotebookPen,
  RotateCcw,
  Share2,
  Search,
} from "lucide-react";
import { api, ApiError } from "./api";
import type { Snapshot } from "@/lib/domain/game";
import { WeddingComic, WeddingPortrait } from "./wedding-comic";
import { PrivateNotes, type NotesHandle } from "./private-notes";
import { InterestPrompt } from "./interest-prompt";
import { WeddingResultCard } from "./wedding-result-card";
export function Investigation({ id }: { id: string }) {
  const router = useRouter();
  const notesRef = useRef<NotesHandle>(null);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [a, setA] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [opened, setOpened] = useState<string[]>([]),
    [tab, setTab] = useState("evidence"),
    [suspect, setSuspect] = useState(""),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    api<Snapshot>("solo/attempts/" + id)
      .then((r) => {
        if (live) {
          setA(r);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  async function act(action: string, body: Record<string, unknown> = {}) {
    if (!a) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await notesRef.current?.flush();
      const fresh = await api<Snapshot>("solo/attempts/" + id);
      const next = await api<Snapshot>(
        "solo/attempts/" + id + "/" + action,
        action === "notes" ? "PUT" : "POST",
        { expectedVersion: fresh.stateVersion, ...body },
      );
      setA(next);
      setAbandonConfirm(false);
      if (action === "notes") setNotice("Notes saved.");
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        const latest = await api<Snapshot>("solo/attempts/" + id);
        setA(latest);
      }
    } finally {
      setBusy(false);
    }
  }
  if (!a)
    return (
      <div className="page-wrap">
        <div className="empty-state">
          {error ? (
            <>
              <h1>Case unavailable</h1>
              <p role="alert">{error}</p>
              <Link href="/library" className="button dark">
                My cases
              </Link>
            </>
          ) : (
            <p role="status">Opening your investigation…</p>
          )}
        </div>
      </div>
    );
  if (a.state === "abandoned")
    return (
      <div className="page-wrap">
        <h1>Saved investigation</h1>
        <p>
          {a.terminationReason === "expired"
            ? "The seven-day resume window ended. Your saved notes and unlocked evidence are kept."
            : a.terminationReason === "abandoned"
              ? "You ended this investigation. Your saved notes and unlocked evidence are kept."
              : "This duplicate investigation was archived when you combined accounts."}
        </p>
        <a
          className="text-link"
          href={` /api/v1/solo/attempts/${id}/transcript`.trim()}
          download
        >
          Download accessible investigation transcript
        </a>
        <button
          className="button dark"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const next = await api<Snapshot>("solo/attempts", "POST", {
                caseId: a.caseId,
              });
              router.push("/play/" + next.id);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Start a new replay
        </button>
        {error && <p role="alert">{error}</p>}
        <h2>Your saved notes</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {a.notes || "No notes were saved."}
        </p>
        <Link className="button lime" href="/library">
          My cases
        </Link>
      </div>
    );
  const clues = a.rounds.flatMap((r) => r.clues),
    readCount = clues.filter((c) => opened.includes(c.id)).length;
  if (a.result)
    return (
      <div className="result-wrap">
        <div className="result-icon">
          <Search size={40} />
        </div>
        <span className="eyebrow">CASE CLOSED / {a.title}</span>
        <h1>
          {a.result.solved
            ? "That’s your aha moment."
            : "Every case teaches you something."}
        </h1>
        <p className="result-lead">
          {a.result.solved
            ? "You connected the evidence and solved the mystery."
            : a.result.score === 60
              ? "Right suspect. A different piece of evidence tells the full story."
              : "The truth was in the details. Here’s how they fit together."}
        </p>
        <div className="score-card">
          <strong>
            {a.result.score}
            <small>/100</small>
          </strong>
          <span>60 points for the suspect · 40 for the reason</span>
        </div>
        {a.caseId === "wedding-gift" && (
          <WeddingResultCard score={a.result.score} solved={a.result.solved} />
        )}
        <section className="reveal-card">
          <span className="eyebrow">THE FULL PICTURE</span>
          <h2>
            {a.suspects.find((s) => s.id === a.result!.answer.suspectId)?.name}
          </h2>
          <p>{a.result.answer.explanation}</p>
          <h3>The decisive evidence</h3>
          {clues
            .filter((c) => a.result!.answer.decisiveClueIds.includes(c.id))
            .map((c) => (
              <div key={c.id} className="decisive">
                <FileText size={18} />
                <div>
                  <strong>{c.title}</strong>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
          <h3>Ruling out the alternatives</h3>
          {Object.entries(a.result.answer.eliminations).map(([s, text]) => (
            <p key={s}>
              <strong>{a.suspects.find((x) => x.id === s)?.name}:</strong>{" "}
              {text}
            </p>
          ))}
        </section>
        <p>
          <a
            className="text-link"
            href={`/api/v1/solo/attempts/${id}/transcript`}
            download
          >
            Download accessible investigation transcript
          </a>
        </p>
        <div className="result-actions">
          <Link className="button lime" href="/explore?access=free&mode=solo">
            Another mystery <ArrowRight size={17} />
          </Link>
          <button
            className="button outline"
            onClick={async () => {
              const text = `I scored ${a.result!.score}/100 on ${a.title} in PlotRush. Can you crack it?`;
              try {
                if (navigator.share)
                  await navigator.share({
                    title: "PlotRush",
                    text,
                    url: location.origin,
                  });
                else {
                  await navigator.clipboard.writeText(
                    text + " " + location.origin,
                  );
                  setNotice("Spoiler-free result copied.");
                }
              } catch {
                setNotice("Sharing cancelled. You can try again.");
              }
            }}
          >
            <Share2 size={16} /> Share your result
          </button>
        </div>
        <p className="save-note">
          {a.dailyDay ? `Daily result for ${a.dailyDay} UTC. ` : ""}
          Saved for this browser.
        </p>
        <p role="status">{notice}</p>
        <InterestPrompt />
      </div>
    );
  return (
    <div className="game-wrap">
      <Link href="/library" className="back-link">
        <ArrowLeft size={16} /> My cases
      </Link>
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            {a.dailyDay
              ? "DAILY MYSTERY / " + a.dailyDay
              : a.access === "paid"
                ? "PREMIUM SOLO INVESTIGATION"
                : "FREE SOLO INVESTIGATION"}
          </span>
          <h1>{a.title}</h1>
        </div>
        <span className="round-pill">
          <span className="status-dot" /> Round {a.round} of {a.totalRounds}
        </span>
      </div>
      {a.caseId === "wedding-gift" && <WeddingComic />}
      <p className="save-note">
        Resume this investigation until {new Date(a.expiresAt).toLocaleString()}
        . No gameplay countdown.
      </p>
      <div className="room-actions">
        <a
          className="text-link"
          href={`/api/v1/solo/attempts/${id}/transcript`}
          download
        >
          Download accessible investigation transcript
        </a>
        <button className="text-button" onClick={() => setAbandonConfirm(true)}>
          End this investigation
        </button>
      </div>
      {abandonConfirm && (
        <section
          className="room-panel"
          aria-label="Confirm ending investigation"
        >
          <p>
            End this attempt and keep its saved notes? A new replay will not
            restore a ranked daily attempt.
          </p>
          <button
            className="button dark"
            disabled={busy}
            onClick={() => void act("abandon")}
          >
            Confirm end investigation
          </button>
          <button
            className="text-button"
            onClick={() => setAbandonConfirm(false)}
          >
            Keep investigating
          </button>
        </section>
      )}
      <div className="game-layout">
        <aside className="case-brief">
          <div className="brief-top">
            <span className="eyebrow">YOUR BRIEF</span>
            <LockKeyhole size={18} />
          </div>
          <h2>Something doesn’t add up.</h2>
          <p>{a.briefing}</p>
          <div className="brief-facts">
            <span>
              <Check size={15} /> Progress saves automatically
            </span>
            <span>
              <Check size={15} /> No countdown. Take your time.
            </span>
            <span>
              <Check size={15} /> Free hints. No ads required.
            </span>
          </div>
          <div className="suspect-list">
            <span className="eyebrow">PERSONS OF INTEREST</span>
            {a.suspects.map((s, i) => (
              <div key={s.id}>
                {a.caseId === "wedding-gift" ? (
                  <WeddingPortrait id={s.id} name={s.name} />
                ) : (
                  <span aria-hidden="true" className={"avatar avatar-" + i}>
                    {s.name[0]}
                  </span>
                )}
                <strong>{s.name}</strong>
                <span>Suspect {String(i + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
          <p className="save-note">
            Your identity is saved in this browser for 30 days. Account recovery
            is not available in this preview.
          </p>
        </aside>
        <section className="investigation-panel">
          <div
            className="game-tabs"
            role="tablist"
            aria-label="Investigation workspace"
          >
            {[
              ["evidence", "Evidence", FileText],
              ["notes", "My notes", NotebookPen],
              ["accuse", "Make a call", Search],
            ].map(([key, label, Icon]) => {
              const I = Icon as typeof Search;
              return (
                <button
                  key={key as string}
                  role="tab"
                  aria-selected={tab === key}
                  aria-controls={"panel-" + key}
                  id={"tab-" + key}
                  onClick={() => setTab(key as string)}
                >
                  <I size={16} />
                  {label as string}
                </button>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {tab === "evidence" && (
            <div
              role="tabpanel"
              id="panel-evidence"
              aria-labelledby="tab-evidence"
            >
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">LOOK CLOSER</span>
                  <h2>The evidence board</h2>
                </div>
                <span>
                  {readCount}/{clues.length} opened
                </span>
              </div>
              <p className="muted">
                Every detail has a story. Open a file and follow the thread.
              </p>
              {a.rounds.map((r) => (
                <div key={r.number}>
                  <h3 className="round-title">
                    {String(r.number).padStart(2, "0")} / {r.title}
                  </h3>
                  <div className="clue-grid">
                    {r.clues.map((c, i) => (
                      <details
                        key={c.id}
                        className="clue"
                        onToggle={(e) => {
                          if (e.currentTarget.open)
                            setOpened((xs) =>
                              xs.includes(c.id) ? xs : [...xs, c.id],
                            );
                        }}
                      >
                        <summary>
                          <span className="clue-number">
                            EVIDENCE {String(i + 1).padStart(2, "0")}
                          </span>
                          <FileText size={22} />
                          <strong>{c.title}</strong>
                          <span className="clue-open">
                            Open file <ArrowRight size={14} />
                          </span>
                        </summary>
                        <p>{c.body}</p>
                      </details>
                    ))}
                  </div>
                  <div className="hint-box">
                    <Lightbulb size={19} />
                    <div>
                      <strong>A nudge, if you need one.</strong>
                      {r.hints.map((h) =>
                        h.text ? (
                          <p key={h.id}>{h.text}</p>
                        ) : (
                          <button
                            className="text-button"
                            key={h.id}
                            disabled={busy}
                            onClick={() => act("hints", { hintId: h.id })}
                          >
                            Reveal hint {h.tier}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="game-next">
                <p>You can make your call without opening every file.</p>
                {a.round < a.totalRounds ? (
                  <button
                    className="button lime"
                    disabled={busy}
                    onClick={() => act("advance")}
                  >
                    Unlock next round <ArrowRight size={17} />
                  </button>
                ) : (
                  <button
                    className="button lime"
                    onClick={() => setTab("accuse")}
                  >
                    Ready to make a call? <ArrowRight size={17} />
                  </button>
                )}
              </div>
            </div>
          )}
          <div
            hidden={tab !== "notes"}
            role="tabpanel"
            id="panel-notes"
            aria-labelledby="tab-notes"
          >
            <h2>Your private notes</h2>
            <PrivateNotes
              ref={notesRef}
              endpoint={`solo/attempts/${id}/notes`}
              label="Private investigation notes"
              initial={{ notes: a.notes, notesVersion: a.notesVersion }}
              readOnly={a.readOnly}
            />
          </div>
          {tab === "accuse" && (
            <div role="tabpanel" id="panel-accuse" aria-labelledby="tab-accuse">
              <span className="eyebrow">CONNECT THE DOTS</span>
              <h2>What’s your verdict?</h2>
              <p className="muted">
                Choose the person and the evidence that supports your
                conclusion.
              </p>
              <fieldset disabled={busy}>
                <legend>01 / Who’s responsible?</legend>
                <div className="suspect-choices">
                  {a.suspects.map((s, i) => (
                    <label
                      key={s.id}
                      className={
                        suspect === s.id ? "choice selected" : "choice"
                      }
                    >
                      <input
                        type="radio"
                        name="suspect"
                        aria-label={s.name}
                        value={s.id}
                        checked={suspect === s.id}
                        onChange={() => {
                          setSuspect(s.id);
                          setConfirm(false);
                        }}
                      />
                      {a.caseId === "wedding-gift" ? (
                        <WeddingPortrait id={s.id} name={s.name} />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={"avatar avatar-" + i}
                        >
                          {s.name[0]}
                        </span>
                      )}
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>02 / Which reason proves it?</legend>
                {a.reasons.map((r) => (
                  <label
                    key={r.id}
                    className={
                      reason === r.id
                        ? "reason-choice selected"
                        : "reason-choice"
                    }
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.id}
                      checked={reason === r.id}
                      onChange={() => {
                        setReason(r.id);
                        setConfirm(false);
                      }}
                    />
                    {r.text}
                  </label>
                ))}
              </fieldset>
              {a.round < a.totalRounds ? (
                <p>Unlock all rounds before submitting your accusation.</p>
              ) : confirm ? (
                <div className="confirmation">
                  <h3>Ready to close the case?</h3>
                  <p>
                    Your verdict is final. You’ll see the full explanation next.
                  </p>
                  <button
                    disabled={busy}
                    className="button lime"
                    onClick={() =>
                      act("accusation", {
                        suspectId: suspect,
                        reasonId: reason,
                      })
                    }
                  >
                    {busy ? "Revealing…" : "Confirm my verdict"}
                    <Check size={16} />
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Keep investigating
                  </button>
                </div>
              ) : (
                <button
                  className="button lime"
                  disabled={!suspect || !reason || busy}
                  onClick={() => setConfirm(true)}
                >
                  Submit my verdict <ArrowRight size={17} />
                </button>
              )}
              <button
                className="text-button return-evidence"
                onClick={() => setTab("evidence")}
              >
                <RotateCcw size={15} /> Back to the evidence
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
