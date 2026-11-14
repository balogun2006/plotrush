import { Suspense } from "react";
import { notFound } from "next/navigation";
import { database } from "@/lib/server/database";
import { resolveTheme } from "@/lib/domain/themes";
import { ThemeDirectory } from "@/components/theme-directory";
export default async function ThemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await resolveTheme(await database(), slug))) notFound();
  return (
    <Suspense fallback={<p>Loading theme…</p>}>
      <ThemeDirectory slug={slug} />
    </Suspense>
  );
}
