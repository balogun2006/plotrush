"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "./api";
type Notes = {
  notes: string;
  notesVersion: number;
  readOnly?: boolean;
  archivedNotes?: { id: string; notes: string }[];
};
export type NotesHandle = { flush: () => Promise<void> };
export const PrivateNotes = forwardRef<
  NotesHandle,
  { endpoint: string; label: string; initial?: Notes; readOnly?: boolean }
>(function PrivateNotes({ endpoint, label, initial, readOnly = false }, ref) {
  const [archives, setArchives] = useState<NonNullable<Notes["archivedNotes"]>>(
    [],
  );
  const [text, setText] = useState(initial?.notes ?? ""),
    [ready, setReady] = useState(!!initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [conflict, setConflict] = useState(false),
    [remoteReadOnly, setRemoteReadOnly] = useState(false);
  const current = useRef(text),
    saved = useRef(initial?.notes ?? ""),
    version = useRef(initial?.notesVersion ?? 0),
    flight = useRef<Promise<void> | null>(null),
    paused = useRef(false);
  const blocked = readOnly || remoteReadOnly;
  useEffect(() => {
    let live = true;
    if (initial) return;
    api<Notes>(endpoint)
      .then((n) => {
        if (live) {
          setText(n.notes);
          setArchives(n.archivedNotes ?? []);
          current.current = n.notes;
          saved.current = n.notes;
          version.current = n.notesVersion;
          setRemoteReadOnly(!!n.readOnly);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [endpoint, initial]);
  async function flush(): Promise<void> {
    if (flight.current) {
      await flight.current;
      return flush();
    }
    if (!ready || current.current === saved.current || blocked) return;
    if (paused.current)
      throw new Error("Review the notes conflict before continuing.");
    const sending = current.current;
    const task = (async () => {
      setBusy(true);
      try {
        const n = await api<Notes>(endpoint, "PUT", {
          text: sending,
          expectedNotesVersion: version.current,
        });
        saved.current = n.notes;
        version.current = n.notesVersion;
        setRemoteReadOnly(!!n.readOnly);
        setMessage("Notes saved.");
      } catch (e) {
        paused.current = true;
        if (e instanceof ApiError && e.code === "READ_ONLY")
          setRemoteReadOnly(true);
        if (e instanceof ApiError && e.status === 409) setConflict(true);
        setMessage((e as Error).message);
        throw e;
      } finally {
        setBusy(false);
        flight.current = null;
      }
    })();
    flight.current = task;
    return task;
  }
  useImperativeHandle(ref, () => ({ flush }));
  useEffect(() => {
    if (!ready || blocked || text === saved.current || paused.current) return;
    const timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (current.current !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function resolve(keep: boolean) {
    try {
      const n = await api<Notes>(endpoint);
      version.current = n.notesVersion;
      saved.current = n.notes;
      setRemoteReadOnly(!!n.readOnly);
      paused.current = false;
      setConflict(false);
      if (!keep) {
        current.current = n.notes;
        setText(n.notes);
        setMessage("Latest notes loaded.");
      } else {
        await flush();
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <div className="private-notes">
      <p>
        Only you can see these notes. Changes save automatically. Unsaved
        offline text stays in this tab.
      </p>
      <label className="sr-only" htmlFor={label.replace(/[^a-z0-9]/gi, "-")}>
        {label}
      </label>
      <textarea
        id={label.replace(/[^a-z0-9]/gi, "-")}
        aria-label={label}
        rows={10}
        maxLength={2000}
        value={text}
        disabled={!ready}
        readOnly={blocked}
        onChange={(e) => {
          current.current = e.target.value;
          setText(e.target.value);
          setMessage("Unsaved changes");
        }}
      />
      <div className="notes-bottom">
        <span>{text.length}/2000</span>
        <button
          className="button dark"
          disabled={!ready || busy || blocked}
          onClick={() => {
            paused.current = false;
            void flush().catch(() => {});
          }}
        >
          Save notes
        </button>
      </div>
      <button
        className="text-button"
        onClick={() => {
          const url = URL.createObjectURL(
              new Blob([current.current], { type: "text/plain;charset=utf-8" }),
            ),
            a = document.createElement("a");
          a.href = url;
          a.download = "plotrush-private-notes.txt";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download notes from this tab
      </button>
      {archives.length > 0 && (
        <details>
          <summary>Notes saved when accounts were combined</summary>
          {archives.map((n) => (
            <p key={n.id} style={{ whiteSpace: "pre-wrap" }}>
              {n.notes}
            </p>
          ))}
        </details>
      )}
      {blocked && <p>These saved notes are read-only.</p>}
      <p role={conflict ? "alert" : "status"}>{message}</p>
      {conflict && (
        <div className="room-actions">
          <button onClick={() => void resolve(false)}>Load latest notes</button>
          <button onClick={() => void resolve(true)}>
            Replace latest with my draft
          </button>
        </div>
      )}
      {paused.current && !conflict && (
        <button
          className="text-button"
          onClick={() => {
            paused.current = false;
            void flush().catch(() => {});
          }}
        >
          Retry saving notes
        </button>
      )}
    </div>
  );
});
