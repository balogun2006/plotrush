import Link from "next/link";
import { StartButton } from "./start-button";

export function PremiumPlay({
  caseId,
  mode,
}: {
  caseId: string;
  mode: "solo" | "group";
}) {
  return mode === "solo" ? (
    <StartButton caseId={caseId} label="Play premium solo case" />
  ) : (
    <Link
      className="button lime"
      href={"/rooms?case=" + encodeURIComponent(caseId)}
    >
      Host premium group case
    </Link>
  );
}
