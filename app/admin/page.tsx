"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ApiError } from "../../components/api";
type Access = {
  roles: string[];
  mfaConfigured: boolean;
  verified: boolean;
  publishEnabled: boolean;
};
type Draft = {
  id: string;
  case_key: string;
  content: Record<string, unknown>;
  state: string;
  revision: number;
  version_id: string | null;
};
type Summary = {
  drafts: {
    id: string;
    title: string;
    case_key: string;
    state: string;
    revision: number;
  }[];
  releases: {
    case_key: string;
    version_id: string;
    title: string;
    enabled: boolean;
  }[];
  calendar: { day: string; title: string; version_id: string }[];
  queueGaps: { day: string }[];
};
type Template = { id: string; content: Record<string, unknown> };
const checks = [
  "logic",
  "accessibility",
  "rights",
  "sensitivity",
  "spoilers",
] as const;
export default function Editorial() {
  const [access, setAccess] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(""),
    [code, setCode] = useState(""),
    [summary, setSummary] = useState<Summary | null>(null),
    [templates, setTemplates] = useState<Template[]>([]),
    [selected, setSelected] = useState<Draft | null>(null),
    [source, setSource] = useState(""),
    [review, setReview] = useState<Record<string, boolean>>({}),
    [notes, setNotes] = useState(""),
    [blindTest, setBlindTest] = useState(""),
    [publishConfirm, setPublishConfirm] = useState(false),
    [day, setDay] = useState(""),
    [versionId, setVersionId] = useState(""),
    [reason, setReason] = useState(""),
    [audit, setAudit] = useState<
      { id: string; action: string; entity_id: string; created_at: string }[]
    >([]);
  const editor = access?.roles.some((r) =>
      ["content_editor", "admin"].includes(r),
    ),
    publisher = access?.roles.some((r) =>
      ["content_publisher", "admin"].includes(r),
    );
  const loadWorkspace = useCallback(async () => {
    const [s, t, a] = await Promise.all([
      api<Summary>("admin/cases"),
      api<Template[]>("admin/templates"),
      api<typeof audit>("admin/audit"),
    ]);
    setSummary(s);
    setTemplates(t);
    setAudit(a);
  }, []);
  useEffect(() => {
    let active = true;
    api<Access>("admin/access")
      .then((a) => {
        if (active) setAccess(a);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (access?.verified) loadWorkspace().catch((e) => setError(e.message));
  }, [access?.verified, loadWorkspace]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.code === "MFA_REQUIRED")
        setAccess((a) => (a ? { ...a, verified: false } : a));
    } finally {
      setBusy(false);
    }
  }
  function show(d: Draft) {
    setSelected(d);
    setSource(JSON.stringify(d.content, null, 2));
    setReview({});
    setNotes("");
    setBlindTest("");
    setPublishConfirm(false);
  }
  async function action(action: string) {
    if (!selected) return;
    await work(async () => {
      const d = await api<Draft>(
        `admin/cases/${selected.id}/${action}`,
        "POST",
        {
          expectedRevision: selected.revision,
          ...(action === "approve"
            ? { review: { ...review, notes, blindTest } }
            : {}),
        },
      );
      show(d);
      await loadWorkspace();
      setNotice(
        `Case ${action === "publish" ? "published" : action === "submit" ? "submitted for independent review" : action === "approve" ? "approved" : action === "revise" ? "copied into a new draft" : "returned to draft"}.`,
      );
    });
  }
  return (
    <div className="editorial-page">
      <div className="editorial-heading">
        <div>
          <span className="eyebrow">PLOTRUSH STUDIO</span>
          <h1>Build the next aha.</h1>
          <p>
            Private editorial workspace · drafts, independent review and
            immutable releases.
          </p>
        </div>
        <Link href="/">Back to games</Link>
      </div>
      {error && (
        <p className="room-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="room-message" role="status">
          {notice}
        </p>
      )}
      {!access ? (
        <section className="room-panel">
          <h2>Staff sign-in required</h2>
          <p>
            Verify your email, then have an authorised operator grant your
            editorial role. Player accounts have no staff permissions by
            default.
          </p>
          <Link className="button lime" href="/account">
            Open account sign-in
          </Link>
        </section>
      ) : !access.verified ? (
        <section className="room-panel editorial-security">
          <span className="eyebrow">SECURE STAFF ACCESS</span>
          <h2>
            {access.mfaConfigured
              ? "Verify your authenticator"
              : "Set up your authenticator"}
          </h2>
          <p>
            Staff access requires a verified email account and a six-digit
            authenticator code. Verification lasts ten minutes and is tied to
            this browser session.
          </p>
          {!access.mfaConfigured && (
            <>
              <p>
                Sign in again if your email session is older than ten minutes.
                Use an authenticator app with SHA-1, six digits and a 30-second
                period.
              </p>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    const r = await api<{ secret: string }>(
                      "admin/mfa/enroll",
                      "POST",
                      {},
                    );
                    setSecret(r.secret);
                  })
                }
              >
                Generate setup key
              </button>
              {secret && (
                <p>
                  Enter this key in your authenticator as PlotRush. Keep it
                  private.
                  <br />
                  <code aria-label="Authenticator setup key">{secret}</code>
                </p>
              )}
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                await api("admin/mfa/verify", "POST", { code });
                setSecret("");
                setCode("");
                setAccess(await api<Access>("admin/access"));
              });
            }}
          >
            <label>
              Authenticator code
              <input
                aria-label="Authenticator code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                required
              />
            </label>
            <button className="button lime" disabled={busy}>
              Verify staff access
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="editorial-toolbar">
            <span>Roles: {access.roles.join(", ")}</span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                work(async () => {
                  await api("admin/mfa/lock", "POST", {});
                  setSummary(null);
                  setTemplates([]);
                  setAudit([]);
                  setSource("");
                  setSelected(null);
                  setAccess({ ...access, verified: false });
                })
              }
            >
              Lock workspace
            </button>
          </div>
          {!access.publishEnabled && (
            <p className="room-message">
              Public publishing is disabled. Drafting and review remain
              available; existing releases can still be withdrawn.
            </p>
          )}
          <div className="editorial-grid">
            <aside className="room-panel">
              <h2>Case desk</h2>
              <button
                className="button outline"
                disabled={!editor || busy}
                onClick={() => {
                  setSelected(null);
                  setSource("");
                  setNotice(
                    "Load a draft example or paste a complete case JSON document.",
                  );
                }}
              >
                New case draft
              </button>
              <label>
                Draft example
                <select
                  aria-label="Draft example"
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates.find((t) => t.id === e.target.value);
                    if (t) {
                      setSelected(null);
                      setSource(JSON.stringify(t.content, null, 2));
                    }
                  }}
                >
                  <option value="">Choose an example…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {String(t.content.title)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="save-note">
                Examples contain public draft solutions. Loading one is not
                editorial approval. Set a new key and slug when authoring a
                different case.
              </p>
              <h3>Review queue</h3>
              {summary?.drafts.length === 0 && <p>No case drafts yet.</p>}
              <ul className="editorial-list">
                {summary?.drafts.map((d) => (
                  <li key={d.id}>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          show(await api<Draft>("admin/cases/" + d.id));
                        })
                      }
                    >
                      {d.title}
                    </button>
                    <small>
                      {d.state} · revision {d.revision}
                    </small>
                  </li>
                ))}
              </ul>
            </aside>
            <section className="room-panel">
              <span className="eyebrow">
                {selected
                  ? `${selected.state.toUpperCase()} · REVISION ${selected.revision}`
                  : "NEW DRAFT"}
              </span>
              <h2>
                {selected
                  ? String(selected.content.title)
                  : "Every detail matters."}
              </h2>
              <p>
                Edit the complete case document below. Validation checks
                references, clue distribution, hints, theme tags and answer
                structure. Human review must establish that the mystery is fair.
              </p>
              <label>
                Case content JSON
                <textarea
                  aria-label="Case content JSON"
                  className="editorial-json"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  spellCheck={false}
                  readOnly={
                    !editor || (!!selected && selected.state !== "draft")
                  }
                />
              </label>
              <div className="room-actions">
                <button
                  className="button lime"
                  disabled={
                    busy ||
                    !editor ||
                    !source ||
                    (!!selected && selected.state !== "draft")
                  }
                  onClick={() =>
                    work(async () => {
                      const content = JSON.parse(source);
                      const d = selected
                        ? await api<Draft>(
                            "admin/cases/" + selected.id,
                            "PUT",
                            { content, expectedRevision: selected.revision },
                          )
                        : await api<Draft>("admin/cases", "POST", { content });
                      show(d);
                      await loadWorkspace();
                      setNotice("Draft saved and machine validation passed.");
                    })
                  }
                >
                  {selected ? "Save draft" : "Create draft"}
                </button>
                {selected?.state === "draft" && editor && (
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => action("submit")}
                  >
                    Submit for review
                  </button>
                )}
                {selected &&
                  ["review", "approved"].includes(selected.state) &&
                  publisher && (
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() => action("return")}
                    >
                      Return to draft
                    </button>
                  )}
                {selected?.state === "published" && editor && (
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => action("revise")}
                  >
                    Create new revision
                  </button>
                )}
              </div>
              {selected?.state === "review" && publisher && (
                <div className="editorial-review">
                  <h3>Independent publisher review</h3>
                  <p>
                    The author and last editor cannot approve their own work.
                    Record checks and actual blind-test evidence; do not claim
                    tests that have not happened.
                  </p>
                  {checks.map((c) => (
                    <label className="editorial-check" key={c}>
                      <input
                        type="checkbox"
                        checked={!!review[c]}
                        onChange={(e) =>
                          setReview({ ...review, [c]: e.target.checked })
                        }
                      />
                      {c[0].toUpperCase() + c.slice(1)} checked
                    </label>
                  ))}
                  <label>
                    Blind-test evidence
                    <textarea
                      aria-label="Blind-test evidence"
                      value={blindTest}
                      onChange={(e) => setBlindTest(e.target.value)}
                      minLength={10}
                    />
                  </label>
                  <label>
                    Review notes
                    <textarea
                      aria-label="Review notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      minLength={10}
                    />
                  </label>
                  <button
                    className="button lime"
                    disabled={
                      busy ||
                      !checks.every((c) => review[c]) ||
                      notes.trim().length < 10 ||
                      blindTest.trim().length < 10
                    }
                    onClick={() => action("approve")}
                  >
                    Approve reviewed draft
                  </button>
                </div>
              )}
              {selected?.state === "approved" && publisher && (
                <div className="editorial-review">
                  <p>
                    Publishing selects this immutable version for new games.
                    Existing games keep their original clues and answers.
                  </p>
                  {publishConfirm ? (
                    <>
                      <p>Confirm release of this reviewed version?</p>
                      <button
                        className="button lime"
                        disabled={busy || !access.publishEnabled}
                        onClick={() => action("publish")}
                      >
                        Confirm publication
                      </button>
                    </>
                  ) : (
                    <button
                      className="button lime"
                      disabled={busy || !access.publishEnabled}
                      onClick={() => setPublishConfirm(true)}
                    >
                      Publish approved version
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
          <section className="room-panel">
            <h2>Release shelf</h2>
            {summary?.releases.length === 0 && (
              <p>
                No editorial releases. The preview continues to use the supplied
                draft fixtures.
              </p>
            )}
            <label>
              Withdrawal reason
              <input
                aria-label="Withdrawal reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why new starts should stop"
              />
            </label>
            <ul className="editorial-list">
              {summary?.releases.map((r) => (
                <li key={r.case_key}>
                  <strong>{r.title}</strong>
                  <small>
                    {r.enabled ? "Released" : "Withdrawn"} · {r.case_key}
                  </small>
                  {r.enabled && publisher && (
                    <button
                      className="text-button"
                      disabled={busy || reason.trim().length < 10}
                      onClick={() =>
                        work(async () => {
                          await api(
                            `admin/releases/${r.case_key}/unpublish`,
                            "POST",
                            { reason },
                          );
                          await loadWorkspace();
                          setNotice(
                            "New starts stopped. Existing games retain their version.",
                          );
                        })
                      }
                    >
                      Withdraw release
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="room-panel">
            <h2>Daily editorial calendar</h2>
            <p>
              Schedule approved free solo mini cases in UTC. Daily selection and
              streak gameplay will be connected in a later increment.
            </p>
            <p role="status">
              {summary?.queueGaps.length ?? 0} unscheduled or unavailable slots
              in the next seven days.
            </p>
            {publisher && (
              <form
                className="editorial-schedule"
                onSubmit={(e) => {
                  e.preventDefault();
                  void work(async () => {
                    await api("admin/calendar", "POST", { day, versionId });
                    await loadWorkspace();
                    setNotice("UTC calendar slot saved.");
                  });
                }}
              >
                <label>
                  Release date
                  <input
                    aria-label="Release date"
                    type="date"
                    required
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                  />
                </label>
                <label>
                  Published version
                  <select
                    aria-label="Published version"
                    value={versionId}
                    onChange={(e) => setVersionId(e.target.value)}
                    required
                  >
                    <option value="">Select a release…</option>
                    {summary?.releases
                      .filter((r) => r.enabled)
                      .map((r) => (
                        <option key={r.version_id} value={r.version_id}>
                          {r.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="button outline"
                  disabled={busy || !access.publishEnabled}
                >
                  Schedule daily case
                </button>
              </form>
            )}
            <ul>
              {summary?.calendar.map((c) => (
                <li key={c.day}>
                  {c.day} · {c.title}
                </li>
              ))}
            </ul>
          </section>
          <section className="room-panel">
            <h2>Editorial audit</h2>
            <p>
              Latest 100 actions. Stored server-side without copying case
              solutions into the log.
            </p>
            <ul className="editorial-list">
              {audit.slice(0, 20).map((a) => (
                <li key={a.id}>
                  <strong>{a.action}</strong>
                  <small>
                    {new Date(a.created_at).toLocaleString()} · {a.entity_id}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
