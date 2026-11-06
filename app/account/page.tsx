"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Mail, ArrowRight, Bookmark } from "lucide-react";
import { api, ApiError } from "../../components/api";
type Account = { kind: "guest" | "verified"; email?: string };
type Config = { available: boolean; development: boolean };
export default function AccountPage() {
  const [me, setMe] = useState<Account | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [devCode, setDevCode] = useState(""),
    [merge, setMerge] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([api<Account>("account"), api<Config>("auth/config")])
      .then(([a, c]) => {
        if (live) {
          setMe(a);
          setConfig(c);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  async function request() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ challengeId: string; developmentCode?: string }>(
        "auth/request-code",
        "POST",
        { email },
      );
      setChallenge(r.challengeId);
      setDevCode(r.developmentCode ?? "");
      setCode("");
      setMerge(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(confirmMerge = false) {
    setBusy(true);
    setError("");
    try {
      const a = await api<Account>("auth/verify-code", "POST", {
        challengeId: challenge,
        code,
        confirmMerge,
      });
      setMe(a);
      setChallenge("");
      setCode("");
      setDevCode("");
      setMerge(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === "MERGE_CONFIRMATION_REQUIRED")
        setMerge(true);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("auth/sign-out", "POST", {});
      setMe({ kind: "guest" });
      setChallenge("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-page">
      <span className="eyebrow">YOUR DETECTIVE IDENTITY</span>
      <h1>Keep your story going.</h1>
      <p className="account-lead">
        Save your progress, return to your clues and pick up on another device.
      </p>
      {error && (
        <p className="room-message" role="alert">
          {error}
        </p>
      )}
      {!me || !config ? (
        <p role="status">Opening your account…</p>
      ) : me.kind === "verified" ? (
        <section className="room-panel">
          <ShieldCheck size={32} />
          <h2>Email verified</h2>
          <p>{me.email}</p>
          <p>
            Your cases, notes and private interests stay with this account.
            Group seats remain tied to your authenticated identity.
          </p>
          <div className="room-actions">
            <Link className="button lime" href="/library">
              My cases <Bookmark size={16} />
            </Link>
            <button className="button outline" disabled={busy} onClick={logout}>
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="room-panel">
            <Mail size={30} />
            <h2>
              {config.available
                ? "Sign in with an email code"
                : "Email recovery is coming soon"}
            </h2>
            {!config.available ? (
              <>
                <p>
                  Email delivery has not been configured for this preview. You
                  can keep playing free solo and group mysteries in this
                  browser.
                </p>
                <Link
                  className="button lime"
                  href="/explore?mode=solo&access=free"
                >
                  Play a free mystery <ArrowRight size={16} />
                </Link>
              </>
            ) : !challenge ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void request();
                }}
              >
                <label htmlFor="account-email">Email address</label>
                <input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p>
                  We’ll send a one-time code. Verification preserves this
                  browser’s progress. No marketing signup.
                </p>
                <button className="button lime" disabled={busy}>
                  Send sign-in code
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void verify(merge);
                }}
              >
                <p>
                  Enter the eight-digit code sent to {email}. It expires in 10
                  minutes.
                </p>
                {devCode && (
                  <p className="room-message" role="status">
                    Development only · No email sent. Test code:{" "}
                    <strong>{devCode}</strong>
                  </p>
                )}
                <label htmlFor="account-code">Verification code</label>
                <input
                  id="account-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                {merge && (
                  <div className="room-message">
                    <h3>Combine your progress?</h3>
                    <p>
                      This email already has a PlotRush account. Continue to
                      move this browser’s cases and interests into it. Both
                      histories are kept; duplicate active cases are saved
                      separately. Finish or leave active group rooms first.
                    </p>
                  </div>
                )}
                <div className="room-actions">
                  <button
                    className="button lime"
                    disabled={busy || code.length !== 8}
                  >
                    {merge
                      ? "Confirm and combine progress"
                      : "Verify and continue"}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChallenge("");
                      setDevCode("");
                      setCode("");
                      setMerge(false);
                    }}
                  >
                    Use another email or request a new code
                  </button>
                </div>
              </form>
            )}
          </section>
          <p>
            Free play always works without email. Guest progress is available
            for the lifetime of your browser session.
          </p>
        </>
      )}
    </div>
  );
}
