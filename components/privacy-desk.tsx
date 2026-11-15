"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { PrivacyRequest } from "@/lib/contracts/privacy";
type Row = PrivacyRequest & { principalId: string; blockers: string[] };
function Review({ row, reload }: { row: Row; reload: () => Promise<void> }) {
  const [decision, setDecision] = useState("defer"),
    [reason, setReason] = useState(""),
    [retentionReference, setRetention] = useState(""),
    [backupReference, setBackup] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(`admin/privacy-requests/${row.id}/review`, "POST", {
            decision,
            reason,
            retentionReference,
            backupReference,
            retentionReviewed: reviewed,
            expectedRevision: row.revision,
          });
          await reload();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Deletion request {row.id}</h3>
      <p>
        Requested {row.requestedAt} · {row.state} · revision {row.revision}
      </p>
      <p>
        Blockers:{" "}
        {row.blockers.length
          ? row.blockers.join(", ")
          : "No operational blockers detected"}
      </p>
      <fieldset disabled={busy}>
        <label>
          Decision for {row.id}
          <select
            aria-label={`Decision for ${row.id}`}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="defer">Defer for review</option>
            <option value="complete" disabled={row.blockers.length > 0}>
              Complete eligible deletion
            </option>
          </select>
        </label>
        <label>
          Review reason for {row.id}
          <textarea
            aria-label={`Review reason for ${row.id}`}
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Approved retention reference for {row.id}
          <input
            aria-label={`Approved retention reference for ${row.id}`}
            required
            minLength={10}
            maxLength={300}
            value={retentionReference}
            onChange={(e) => setRetention(e.target.value)}
          />
        </label>
        <label>
          Backup erasure or replay reference for {row.id}
          <input
            aria-label={`Backup erasure or replay reference for ${row.id}`}
            required
            minLength={10}
            maxLength={300}
            value={backupReference}
            onChange={(e) => setBackup(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            required
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed the applicable retention basis and backup deletion/replay
          handling. This is not approval invented by the application.
        </label>
        <button className="button dark">
          Review deletion request {row.id}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function PrivacyDesk() {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    api<Row[]>("admin/privacy-requests")
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
  return (
    <section className="room-panel">
      <h2>Account privacy requests</h2>
      <p>
        Only administrators with fresh MFA can review deletion. Do not complete
        a request without an approved retention and backup process. Accounts
        with financial records remain deferred until a finance-specific erasure
        plan is approved and implemented. No email, private interests, notes or
        case canon are exposed here.
      </p>
      <p>
        <a
          className="text-link"
          href="/api/v1/admin/privacy/deletion-ledger"
          download
        >
          Download private deletion ledger for recovery
        </a>
      </p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{notice}</p>
      {rows.length ? (
        rows.map((row) => (
          <Review
            key={row.id + ":" + row.revision}
            row={row}
            reload={async () => {
              setRows(await api<Row[]>("admin/privacy-requests"));
              setNotice("Privacy review saved.");
            }}
          />
        ))
      ) : (
        <p>No pending deletion requests.</p>
      )}
    </section>
  );
}
