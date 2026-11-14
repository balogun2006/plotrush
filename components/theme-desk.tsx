"use client";
import { useEffect, useState } from "react";
import { TaxonomyTools } from "./taxonomy-tools";
import { api } from "./api";
import type { Theme } from "@/lib/contracts/themes";
type Row = Theme & { reviewedCount: number; ready: boolean };
function ThemeEditor({
  theme,
  canEdit,
  saved,
  saving,
}: {
  theme: Row;
  canEdit: boolean;
  saved: () => Promise<void>;
  saving: () => void;
}) {
  const [value, setValue] = useState(theme),
    [newSlug, setNewSlug] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        saving();
        setBusy(true);
        setError("");
        try {
          await api(`admin/themes/${theme.slug}`, "PUT", {
            label: value.label,
            description: value.description,
            status: value.status,
            displayOrder: value.displayOrder,
            promoteOnHome: value.promoteOnHome,
            expectedRevision: theme.revision,
            reason,
          });
          await saved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{theme.label}</h3>
      <p>
        {theme.slug} · revision {theme.revision} · {theme.reviewedCount}{" "}
        reviewed playable cases ·{" "}
        {theme.ready ? "Supply ready" : "Supply below promotion threshold"}
      </p>
      <fieldset disabled={!canEdit || busy}>
        <label>
          Label for {theme.slug}
          <input
            aria-label={`Label for ${theme.slug}`}
            maxLength={60}
            required
            value={value.label}
            onChange={(event) =>
              setValue({ ...value, label: event.target.value })
            }
          />
        </label>
        <label>
          Description for {theme.slug}
          <textarea
            aria-label={`Description for ${theme.slug}`}
            required
            maxLength={400}
            value={value.description}
            onChange={(event) =>
              setValue({ ...value, description: event.target.value })
            }
          />
        </label>
        <label>
          Status for {theme.slug}
          <select
            aria-label={`Status for ${theme.slug}`}
            value={value.status}
            onChange={(event) =>
              setValue({
                ...value,
                status: event.target.value as Theme["status"],
              })
            }
          >
            <option value="enabled">Enabled</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label>
          Display order for {theme.slug}
          <input
            aria-label={`Display order for ${theme.slug}`}
            type="number"
            min={0}
            max={100}
            step={1}
            value={value.displayOrder}
            onChange={(event) =>
              setValue({ ...value, displayOrder: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            aria-label={`Promote ${theme.slug} when reviewed supply is ready`}
            checked={value.promoteOnHome}
            onChange={(event) =>
              setValue({ ...value, promoteOnHome: event.target.checked })
            }
          />{" "}
          Promote {theme.slug} when reviewed supply is ready
        </label>
        <label>
          Change reason for {theme.slug}
          <input
            required
            aria-label={`Change reason for ${theme.slug}`}
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label>
          New URL slug for {theme.slug}
          <input
            aria-label={`New URL slug for ${theme.slug}`}
            value={newSlug}
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => setNewSlug(e.target.value)}
          />
        </label>
        <p>
          Rename only when necessary. The old URL permanently redirects, and the
          same theme identity and saved games are retained.
        </p>
        <button
          type="button"
          className="text-button"
          disabled={
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug) ||
            reason.trim().length < 10
          }
          onClick={async () => {
            saving();
            setBusy(true);
            setError("");
            try {
              await api(`admin/themes/${theme.slug}/rename`, "POST", {
                slug: newSlug,
                expectedRevision: theme.revision,
                reason,
              });
              await saved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Rename theme {theme.slug}
        </button>
        <button className="button lime" disabled={reason.trim().length < 10}>
          Save theme {theme.slug}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
export function ThemeDesk({
  publisher,
  publishEnabled,
}: {
  publisher: boolean;
  publishEnabled: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    api<Row[]>("admin/themes")
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
      <h2>Theme registry</h2>
      <p>
        Stable theme identities are retained. Publishers can edit labels and
        descriptions, retire unused shelves and request promotion. Three
        distinct reviewed playable cases, including a free solo case, are
        required for promotion. Current public drafts do not satisfy that gate.
      </p>
      {!publishEnabled && (
        <p>Taxonomy changes are disabled by the publication switch.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <p role="status">{notice}</p>
      <TaxonomyTools
        canEdit={publisher && publishEnabled}
        changed={async () => setRows(await api<Row[]>("admin/themes"))}
      />
      {rows?.map((theme) => (
        <ThemeEditor
          key={`${theme.id}:${theme.revision}`}
          theme={theme}
          canEdit={publisher && publishEnabled}
          saving={() => setNotice("")}
          saved={async () => {
            setRows(await api<Row[]>("admin/themes"));
            setNotice("Theme changes saved.");
          }}
        />
      ))}
    </section>
  );
}
