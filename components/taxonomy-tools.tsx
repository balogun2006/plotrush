"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Mood } from "@/lib/contracts/themes";

function MoodEditor({
  mood,
  canEdit,
  saved,
}: {
  mood: Mood;
  canEdit: boolean;
  saved: () => Promise<void>;
}) {
  const [label, setLabel] = useState(mood.label),
    [status, setStatus] = useState(mood.status),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("admin/moods/" + mood.slug, "PUT", {
            label,
            status,
            reason,
            expectedRevision: mood.revision,
          });
          await saved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4>
        {mood.label} · {mood.slug} · revision {mood.revision}
      </h4>
      <fieldset disabled={!canEdit || busy}>
        <label>
          Label for mood {mood.slug}
          <input
            aria-label={`Label for mood ${mood.slug}`}
            required
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Status for mood {mood.slug}
          <select
            aria-label={`Status for mood ${mood.slug}`}
            value={status}
            onChange={(e) => setStatus(e.target.value as Mood["status"])}
          >
            <option value="enabled">Enabled</option>
            <option value="retired">Retired</option>
          </select>
        </label>
        <label>
          Reason for mood {mood.slug}
          <input
            aria-label={`Reason for mood ${mood.slug}`}
            required
            minLength={10}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="button lime">Save mood {mood.slug}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function TaxonomyTools({
  canEdit,
  changed,
}: {
  canEdit: boolean;
  changed: () => Promise<void>;
}) {
  const [moods, setMoods] = useState<Mood[]>([]),
    [kind, setKind] = useState("theme"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<Mood[]>("admin/moods")
      .then((r) => {
        if (live) setMoods(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function reload() {
    setMoods(await api<Mood[]>("admin/moods"));
    await changed();
    setNotice("Taxonomy changes saved.");
  }
  return (
    <div>
      <details>
        <summary>Create a theme or mood</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              values = new FormData(form);
            setError("");
            setNotice("");
            setBusy(true);
            try {
              await api(
                "admin/" + (kind === "theme" ? "themes" : "moods"),
                "POST",
                {
                  slug: values.get("slug"),
                  label: values.get("label"),
                  status: "enabled",
                  reason: values.get("reason"),
                  ...(kind === "theme"
                    ? {
                        description: values.get("description"),
                        displayOrder: Number(values.get("displayOrder")),
                      }
                    : {}),
                },
              );
              form.reset();
              await reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!canEdit || busy}>
            <label>
              Taxonomy kind
              <select
                aria-label="Taxonomy kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="theme">Theme</option>
                <option value="mood">Mood</option>
              </select>
            </label>
            <label>
              New taxonomy slug
              <input
                aria-label="New taxonomy slug"
                name="slug"
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label>
              New taxonomy label
              <input
                aria-label="New taxonomy label"
                name="label"
                required
                maxLength={60}
              />
            </label>
            {kind === "theme" && (
              <>
                <label>
                  New theme description
                  <textarea
                    aria-label="New theme description"
                    name="description"
                    required
                    maxLength={400}
                  />
                </label>
                <label>
                  New theme display order
                  <input
                    aria-label="New theme display order"
                    name="displayOrder"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={20}
                    required
                  />
                </label>
              </>
            )}
            <label>
              Creation reason
              <input
                aria-label="Creation reason"
                name="reason"
                required
                minLength={10}
                maxLength={1000}
              />
            </label>
            <p>
              Taxonomy creates no cases. Review each case&rsquo;s tags
              independently before publication.
            </p>
            <button className="button lime">Create taxonomy entry</button>
          </fieldset>
        </form>
      </details>
      {error && <p role="alert">{error}</p>}
      <p role="status">{notice}</p>
      <details>
        <summary>Manage moods</summary>
        {moods.map((m) => (
          <MoodEditor
            key={m.id + ":" + m.revision}
            mood={m}
            canEdit={canEdit}
            saved={reload}
          />
        ))}
      </details>
    </div>
  );
}
