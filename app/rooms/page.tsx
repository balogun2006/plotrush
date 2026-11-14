import { GroupRoom } from "../../components/group-room";
import { notFound } from "next/navigation";
import { catalogue } from "@/lib/domain/game";
import { database } from "@/lib/server/database";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string | string[] }>;
}) {
  const selected = (await searchParams).case;
  const caseId =
    typeof selected === "string" && /^[a-z0-9-]{1,80}$/.test(selected)
      ? selected
      : undefined;
  const meta = caseId
    ? (await catalogue(await database())).find(
        (c) => c.id === caseId && c.modes.includes("group"),
      )
    : undefined;
  if (caseId && !meta) notFound();
  return <GroupRoom caseId={caseId} caseAccess={meta?.access} />;
}
