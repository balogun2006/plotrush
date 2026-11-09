import { GroupRoom } from "../../components/group-room";

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
  return <GroupRoom caseId={caseId} />;
}
