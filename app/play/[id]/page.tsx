import { Investigation } from "@/components/investigation";
export default async function Play({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Investigation id={(await params).id} />;
}
