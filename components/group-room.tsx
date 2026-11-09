"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Users, LockKeyhole, Share2, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { api, ApiError } from "./api";
import type { RoomSnapshot } from "../lib/domain/rooms";
type SavedRoom = { id: string; title: string; phase: string };
export function GroupRoom({ caseId = "missing-mic" }: { caseId?: string }) {
  const premiumHost = caseId !== "missing-mic";
  const [room, setRoom] = useState<RoomSnapshot | null>(null),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [invite, setInvite] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState<SavedRoom[]>([]);
  const [suspect, setSuspect] = useState(""),
    [reason, setReason] = useState("");
  const latest = useRef(room);
  useEffect(() => {
    latest.current = room;
  }, [room]);
  const apply = useCallback((next: RoomSnapshot) => {
    setRoom((old) =>
      !old || old.id !== next.id || next.stateVersion >= old.stateVersion
        ? next
        : old,
    );
  }, []);
  const load = useCallback(
    async (id: string) => {
      const r = await api<RoomSnapshot>("rooms/" + id);
      apply(r);
      setInvite(sessionStorage.getItem("plotrush-invite:" + id) ?? "");
      window.history.replaceState(null, "", "/rooms?room=" + id);
    },
    [apply],
  );
  useEffect(() => {
    queueMicrotask(() => {
      const q = new URLSearchParams(window.location.search),
        id = q.get("room");
      if (id) load(id).catch((e) => setError(e.message));
      const incoming = q.get("code");
      if (incoming) setCode(incoming);
      api<SavedRoom[]>("me/rooms")
        .then(setSaved)
        .catch(() => {});
    });
  }, [load]);
  useEffect(() => {
    if (!room || ["revealed", "expired", "cancelled"].includes(room.phase))
      return;
    let cancelled = false,
      inFlight = false,
      lastBeat = 0;
    const poll = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const current = latest.current!;
        const beat = Date.now() - lastBeat > 20000;
        const next = beat
          ? await api<RoomSnapshot>(
              "rooms/" + current.id + "/heartbeat",
              "POST",
              { expectedVersion: current.stateVersion },
            )
          : await api<RoomSnapshot>("rooms/" + current.id);
        if (beat) lastBeat = Date.now();
        if (!cancelled) apply(next);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Connection interrupted. Retrying…",
          );
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [room?.id, room?.phase, apply]); // eslint-disable-line react-hooks/exhaustive-deps
  async function enter(join: boolean) {
    setBusy(true);
    setError("");
    try {
      if (join) {
        const r = await api<RoomSnapshot>("rooms/join", "POST", {
          code,
          displayName: name,
        });
        setInvite("");
        apply(r);
        window.history.replaceState(null, "", "/rooms?room=" + r.id);
      } else {
        const r = await api<{ room: RoomSnapshot; inviteCode: string }>(
          "rooms",
          "POST",
          { caseId, displayName: name },
        );
        setInvite(r.inviteCode);
        sessionStorage.setItem("plotrush-invite:" + r.room.id, r.inviteCode);
        apply(r.room);
        window.history.replaceState(null, "", "/rooms?room=" + r.room.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to enter room.");
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (!room) return;
    setBusy(true);
    setError("");
    try {
      const submit = (stateVersion: number) =>
        api<RoomSnapshot>(`rooms/${room.id}/${action}`, "POST", {
          expectedVersion: stateVersion,
          ...data,
        });
      let r: RoomSnapshot;
      try {
        r = await submit(room.stateVersion);
      } catch (e) {
        // Retry only a player-local intent whose phase has not changed.
        if (
          !(e instanceof ApiError) ||
          e.status !== 409 ||
          !["ready", "share", "vote"].includes(action)
        )
          throw e;
        const fresh = await api<RoomSnapshot>("rooms/" + room.id);
        apply(fresh);
        if (fresh.phase !== room.phase) throw e;
        r = await submit(fresh.stateVersion);
      }
      apply(r);
      if (action === "leave") {
        setRoom(null);
        setInvite("");
        window.history.replaceState(
          null,
          "",
          premiumHost ? "/rooms?case=" + encodeURIComponent(caseId) : "/rooms",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      try {
        await load(room.id);
      } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function copyInvite() {
    if (!room) return;
    const value = sessionStorage.getItem("plotrush-invite:" + room.id);
    if (!value) {
      setNotice(
        "The creator can share the original invite code. If it was lost, create a new room from your case library.",
      );
      return;
    }
    setInvite(value);
    const url = new URL("/rooms", window.location.origin);
    url.searchParams.set("code", value);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice("Invite link copied. Send it to your friends.");
    } catch {
      setNotice("Invite code: " + value);
    }
  }
  const ended =
    room && ["revealed", "expired", "cancelled"].includes(room.phase);
  return (
    <div className="group-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BETTER TOGETHER</span>
          <h1>{room ? room.title : "One mystery. Different clues."}</h1>
          <p>
            {room
              ? "Compare your evidence. Trust the details."
              : premiumHost
                ? "Host your purchased case for 4–6 players. Guests join with an invite."
                : "Gather 2–6 curious minds for The Missing Microphone. Free, no account needed."}
          </p>
        </div>
        <Users size={36} />
      </div>
      {error && (
        <div role="alert" className="room-message">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="room-message">
          {notice}
        </p>
      )}
      {!room ? (
        <>
          <div className="room-entry">
            <section className="room-panel">
              <span className="eyebrow">YOUR DETECTIVE NAME</span>
              <label htmlFor="detective-name">Display name</label>
              <input
                id="detective-name"
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Detective H"
              />
              <p>
                Your browser keeps your seat. A name alone cannot recover it.
              </p>
              <button
                className="button lime"
                disabled={busy || !name.trim()}
                onClick={() => enter(false)}
              >
                {premiumHost ? "Create premium room" : "Create a free room"}{" "}
                <ArrowRight size={17} />
              </button>
            </section>
            <section className="room-panel">
              <span className="eyebrow">ALREADY INVITED?</span>
              <label htmlFor="room-code">Invite code</label>
              <input
                id="room-code"
                autoCapitalize="characters"
                maxLength={12}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="12-character code"
              />
              <p>Enter your display name, then join your friends.</p>
              <button
                className="button outline"
                disabled={busy || !name.trim() || code.length !== 12}
                onClick={() => enter(true)}
              >
                Join room
              </button>
            </section>
          </div>
          {saved.length > 0 && (
            <section className="room-panel">
              <h2>Your rooms</h2>
              {saved.map((r) => (
                <p key={r.id}>
                  <button
                    className="text-button"
                    onClick={() => load(r.id).catch((e) => setError(e.message))}
                  >
                    {r.title} · {r.phase}
                  </button>
                </p>
              ))}
            </section>
          )}
          <p className="room-fineprint">
            {premiumHost
              ? "Premium group preview · Guests join free. "
              : "Draft tutorial · 8 minutes · free play. "}
            Keep this browser to reconnect.
          </p>
        </>
      ) : (
        <>
          <div className="room-status">
            <span className="pill">
              {room.access === "paid" && "PREMIUM · "}
              {room.phase.toUpperCase()}
              {room.round > 0
                ? ` · ROUND ${room.round}/${room.totalRounds}`
                : ""}
            </span>
            {room.deadline && !room.paused && (
              <span>
                Phase deadline:{" "}
                {new Date(room.deadline).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {room.paused && (
              <strong>
                Paused: waiting up to five minutes for a second player.
              </strong>
            )}
          </div>
          <div className="room-layout">
            <aside className="room-panel">
              <h2>The detectives</h2>
              <ul className="room-roster">
                {room.members
                  .filter((m) => !m.departed)
                  .map((m) => (
                    <li key={m.seat}>
                      <span className="room-avatar">
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        {m.name}
                        {m.isYou ? " (you)" : ""}
                        <small>
                          {m.isHost ? "Host · " : ""}
                          {m.away ? "Away" : m.ready ? "Ready" : "Here"}
                        </small>
                      </span>
                      {m.ready && <Check size={18} />}
                    </li>
                  ))}
              </ul>
              {room.phase === "lobby" && (
                <>
                  <button className="button outline" onClick={copyInvite}>
                    <Share2 size={16} /> Copy invite
                  </button>
                  {invite && <p className="invite-code">{invite}</p>}
                  <p>
                    Everyone needs to be ready. {room.minPlayers}–
                    {room.maxPlayers} players.
                  </p>
                </>
              )}
              {!ended && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => act("leave")}
                >
                  Leave room
                </button>
              )}
            </aside>
            <div className="room-main">
              {(room.phase === "lobby" || room.phase === "briefing") && (
                <section className="room-panel">
                  <span className="eyebrow">THE BRIEF</span>
                  <h2>A mic. A rehearsal. A mystery.</h2>
                  <p>{room.briefing}</p>
                  <p>
                    Each detective receives different evidence. Share what
                    matters, discuss together, then vote privately. Your vote
                    stays private; the group verdict appears at the reveal.
                  </p>
                  {room.phase === "lobby" ? (
                    <div className="room-actions">
                      <button
                        className="button lime"
                        disabled={busy}
                        onClick={() =>
                          act("ready", {
                            ready: !room.members.find((m) => m.isYou)?.ready,
                          })
                        }
                      >
                        {room.members.find((m) => m.isYou)?.ready
                          ? "Not ready"
                          : "I'm ready"}
                      </button>
                      {room.isHost && (
                        <button
                          className="button outline"
                          disabled={
                            busy ||
                            room.members.filter((m) => !m.departed).length <
                              room.minPlayers ||
                            room.members.some((m) => !m.departed && !m.ready)
                          }
                          onClick={() => act("start")}
                        >
                          Start investigation
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {room.isHost && (
                        <button
                          className="button lime"
                          disabled={busy || room.paused}
                          onClick={() => act("advance")}
                        >
                          Open the evidence
                        </button>
                      )}
                      <p>The evidence opens automatically after one minute.</p>
                    </>
                  )}
                </section>
              )}
              {["investigating", "voting"].includes(room.phase) && (
                <>
                  <section className="room-panel">
                    <span className="eyebrow">
                      <LockKeyhole size={14} /> ONLY YOU CAN SEE THESE
                    </span>
                    <h2>Your private evidence</h2>
                    <div className="room-clues">
                      {room.privateClues.map((c) => (
                        <article key={c.id} className="room-clue">
                          <h3>{c.title}</h3>
                          <p>{c.body}</p>
                          <button
                            className="text-button"
                            disabled={
                              busy ||
                              room.sharedClues.some((x) => x.id === c.id)
                            }
                            onClick={() => act("share", { clueId: c.id })}
                          >
                            {room.sharedClues.some((x) => x.id === c.id)
                              ? "Shared with everyone"
                              : "Share with the group"}
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="room-panel">
                    <span className="eyebrow">CONNECT THE DOTS</span>
                    <h2>Shared evidence board</h2>
                    {!room.sharedClues.length && (
                      <p>
                        No clues shared yet. Start with something that caught
                        your eye.
                      </p>
                    )}
                    <div className="room-clues">
                      {room.sharedClues.map((c) => (
                        <article className="room-clue" key={c.id}>
                          <h3>{c.title}</h3>
                          <p>{c.body}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {room.phase === "investigating" && (
                <section className="room-panel">
                  <h2>Ready to compare theories?</h2>
                  <p>
                    When everyone is ready, the host can continue. Otherwise the
                    server advances at the deadline.
                  </p>
                  <div className="room-actions">
                    <button
                      className="button lime"
                      disabled={busy || room.paused}
                      onClick={() =>
                        act("ready", {
                          ready: !room.members.find((m) => m.isYou)?.ready,
                        })
                      }
                    >
                      {room.members.find((m) => m.isYou)?.ready
                        ? "Keep investigating"
                        : "Ready to continue"}
                    </button>
                    {room.isHost && (
                      <button
                        className="button outline"
                        disabled={
                          busy ||
                          room.paused ||
                          room.members.some(
                            (m) => !m.departed && !m.away && !m.ready,
                          )
                        }
                        onClick={() => act("advance")}
                      >
                        {room.round === room.totalRounds
                          ? "Open voting"
                          : "Next round"}
                      </button>
                    )}
                  </div>
                </section>
              )}
              {room.phase === "voting" && (
                <section className="room-panel">
                  <h2>Your private verdict</h2>
                  {room.ownVote ? (
                    <p role="status">
                      Vote locked. Waiting for the others or the deadline.
                    </p>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act("vote", {
                          suspectId: suspect,
                          reasonId: reason,
                        });
                      }}
                    >
                      <fieldset>
                        <legend>Who moved the microphone?</legend>
                        {room.suspects.map((s) => (
                          <label className="room-option" key={s.id}>
                            <input
                              type="radio"
                              name="suspect"
                              value={s.id}
                              checked={suspect === s.id}
                              onChange={() => setSuspect(s.id)}
                            />
                            {s.name}
                          </label>
                        ))}
                      </fieldset>
                      <fieldset>
                        <legend>What proves it?</legend>
                        {room.reasons.map((r) => (
                          <label className="room-option" key={r.id}>
                            <input
                              type="radio"
                              name="reason"
                              checked={reason === r.id}
                              onChange={() => setReason(r.id)}
                            />
                            {r.text}
                          </label>
                        ))}
                      </fieldset>
                      <p>
                        Your vote is final. Missing votes count as abstentions.
                      </p>
                      <button
                        className="button lime"
                        disabled={busy || !suspect || !reason || room.paused}
                      >
                        Lock my vote
                      </button>
                    </form>
                  )}
                </section>
              )}
              {room.result && (
                <section className="room-panel room-result">
                  <span className="eyebrow">CASE CLOSED</span>
                  <h2>
                    {room.result.solved
                      ? "You cracked it, together."
                      : !room.result.suspectId || !room.result.reasonId
                        ? "No consensus. Here's what happened."
                        : "A twist in the evidence."}
                  </h2>
                  <div className="room-score">
                    {room.result.score}
                    <small>/100</small>
                  </div>
                  <p>{room.result.answer.explanation}</p>
                  <p>
                    {room.result.abstentions} abstention(s). Tied votes never
                    choose a winner.
                  </p>
                  <a className="button lime" href="/rooms">
                    Start another room
                  </a>
                </section>
              )}
              {(room.phase === "expired" || room.phase === "cancelled") && (
                <section className="room-panel">
                  <h2>This room has ended.</h2>
                  <p>
                    {room.access === "paid" ? (
                      <Link href="/library">
                        Open My cases to host another room
                      </Link>
                    ) : (
                      "Start a new free tutorial whenever your group is ready."
                    )}
                  </p>
                  <a className="button lime" href="/rooms">
                    Create another room
                  </a>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
