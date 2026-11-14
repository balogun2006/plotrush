import { Suspense } from "react";
import { notFound } from "next/navigation";
import { themes } from "@/lib/domain/content";
import { ThemeDirectory } from "@/components/theme-directory";
export default async function ThemePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!themes.includes(slug as (typeof themes)[number])) notFound();
  return (
    <Suspense fallback={<p>Loading theme…</p>}>
      <ThemeDirectory slug={slug} />
    </Suspense>
  );
}
