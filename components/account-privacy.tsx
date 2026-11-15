"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { PrivacyRequest } from "@/lib/contracts/privacy";
export function AccountPrivacy({
  reauthenticate,
}: {
  reauthenticate: () => void;
}) {
  const [rows, setRows] = useState<PrivacyRequest[]>([]),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<PrivacyRequest[]>("account/privacy-requests")
      .then((r) => {
        if (live) setRows(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function action(path: string, data: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, "POST", data);
      setRows(await api<PrivacyRequest[]>("account/privacy-requests"));
      setNotice(
        "Your request is saved. Deletion requests require review; your account has not been deleted.",
      );
      setConfirmation("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="room-panel">
      <h2>Your data and account</h2>
      <p>
        Exports and deletion requests require an email verification from the
        last ten minutes.
      </p>
      <button className="text-button" onClick={reauthenticate}>
        Verify email again
      </button>
      <p>
        <a className="text-link" href="/api/v1/me/interests/export" download>
          Download my private interests
        </a>{" "}
        ·{" "}
        <a className="text-link" href="/interests">
          Edit or clear interests
        </a>
      </p>
      <button
        className="button outline"
        disabled={busy}
        onClick={() => action("account/export-request", {})}
      >
        Prepare my account export
      </button>
      <p>
        The account export contains your profile, preferences, notes,
        investigation summaries, your group memberships and orders. It excludes
        other players’ private evidence and votes.
      </p>
      {rows
        .filter((r) => r.kind === "export" && r.state === "ready")
        .map((r) => (
          <p key={r.id}>
            <a
              className="button lime"
              href={`/api/v1/account/exports/${r.id}`}
              download
            >
              Download account export
            </a>
          </p>
        ))}
      <h3>Request account deletion</h3>
      <p>
        Submitting a request does not immediately delete your account. Accounts
        with purchases need a separate finance review before deletion can be
        completed. An administrator reviews active games, purchases and
        retention requirements first. Financial/editorial references, other
        players’ group history, minimal audit/deletion records and backup copies
        may need to remain under an approved retention and backup process. No
        fixed legal retention period is asserted by this preview.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action("account/delete-request", { confirmation });
        }}
      >
        <label>
          Type DELETE MY ACCOUNT
          <input
            aria-label="Type DELETE MY ACCOUNT"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          className="button dark"
          disabled={busy || confirmation !== "DELETE MY ACCOUNT"}
        >
          Submit deletion request
        </button>
      </form>
      {rows
        .filter((r) => r.kind === "deletion")
        .map((r) => (
          <div key={r.id}>
            <p>
              Deletion request: {r.state} · revision {r.revision}
            </p>
            {["pending", "deferred"].includes(r.state) && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  action(`account/privacy-requests/${r.id}/cancel`, {
                    expectedRevision: r.revision,
                  })
                }
              >
                Cancel deletion request
              </button>
            )}
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
      <p role="status">{notice}</p>
    </section>
  );
}
