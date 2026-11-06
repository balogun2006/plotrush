"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { api } from "./api";
const subscribe = () => () => {};
export function StartButton({
  caseId,
  label = "Start investigating",
  className = "",
}: {
  caseId: string;
  label?: string;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className={"start-control " + className}>
      <button
        className="button lime"
        disabled={!hydrated || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const a = await api<{ id: string }>("solo/attempts", "POST", {
              caseId,
            });
            router.push("/play/" + a.id);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <>
            <LoaderCircle className="spin" size={18} /> Opening case…
          </>
        ) : (
          <>
            {label}
            <ArrowUpRight size={18} />
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
