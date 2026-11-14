"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowUpRight } from "lucide-react";
import { api } from "./api";
import { Explorer } from "./explorer";
import type { Theme } from "@/lib/contracts/themes";
type SupplyTheme = Theme & {
  count: number;
  ready: boolean;
  reviewedCount: number;
  promoted: boolean;
};
type Snapshot = { themes: SupplyTheme[] };
function Tiles({
  themes,
  query,
  empty = true,
}: {
  themes: SupplyTheme[];
  query: string;
  empty?: boolean;
}) {
  return (
    <div className="theme-grid">
      {themes
        .filter((t) => t.status === "enabled" && (empty || t.count > 0))
        .map((t) => {
          const p = new URLSearchParams(query);
          p.delete("themes");
          const body = (
            <>
              <Search size={32} aria-hidden="true" />
              <div>
                <span className="eyebrow">
                  {t.count} {t.count === 1 ? "CASE" : "CASES"} IN THIS VIEW
                </span>
                <h3>{t.label}</h3>
                <p>{t.description}</p>
                {!t.count && (
                  <small>No cases available with these filters.</small>
                )}
              </div>
              {t.count > 0 && <ArrowUpRight aria-hidden="true" />}
            </>
          );
          return t.count > 0 ? (
            <Link
              key={t.id}
              className="theme-card everyday"
              href={`/themes/${t.slug}?${p}`}
              aria-label={`Browse ${t.label}: ${t.count} ${t.count === 1 ? "case" : "cases"}`}
            >
              {body}
            </Link>
          ) : (
            <div key={t.id} className="theme-card future" aria-disabled="true">
              {body}
            </div>
          );
        })}
    </div>
  );
}
export function HomeThemes() {
  const [data, setData] = useState<Snapshot | null>(null);
  useEffect(() => {
    let live = true;
    api<Snapshot>("themes?mode=solo&access=free")
      .then((r) => {
        if (live) setData(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      {data ? (
        <Tiles
          themes={[...data.themes].sort(
            (a, b) =>
              Number(b.promoted) - Number(a.promoted) ||
              a.displayOrder - b.displayOrder ||
              a.slug.localeCompare(b.slug),
          )}
          query="mode=solo&access=free"
          empty={false}
        />
      ) : (
        <p>Browse the available draft themes in the theme directory.</p>
      )}
      <p>
        <Link className="text-link" href="/themes?mode=group&access=free">
          Find a theme to play with friends
        </Link>
      </p>
    </>
  );
}
export function ThemeDirectory({ slug }: { slug?: string }) {
  const params = useSearchParams(),
    router = useRouter(),
    query = params.toString();
  const [response, setResponse] = useState<{
    query: string;
    data?: Snapshot;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams(query);
    if (slug) p.delete("themes");
    api<Snapshot>("themes?" + p)
      .then((data) => {
        if (live) setResponse({ query, data });
      })
      .catch((e) => {
        if (live) setResponse({ query, error: e.message });
      });
    return () => {
      live = false;
    };
  }, [query, slug]);
  const current = response?.query === query ? response : null;
  if (
    slug &&
    params.has("themes") &&
    (params.getAll("themes").length !== 1 || params.get("themes") !== slug)
  )
    return (
      <section className="page-wrap" role="alert">
        <h1>Check the theme filters</h1>
        <p>The query theme must match this theme page.</p>
        <Link href={`/themes/${slug}`}>Reset this theme page</Link>
      </section>
    );
  if (!current)
    return (
      <p className="loading-card" role="status">
        Loading theme availability…
      </p>
    );
  if (current.error)
    return (
      <section className="page-wrap" role="alert">
        <h1>Check the theme filters</h1>
        <p>{current.error}</p>
        <Link href="/themes">Show all themes</Link>
      </section>
    );
  const data = current.data!,
    selected = data.themes.find((t) => t.slug === slug);
  if (slug && selected?.status === "enabled")
    return <Explorer theme={selected} />;
  const mode = params.get("mode") ?? "any";
  return (
    <section className="page-wrap">
      <Link className="back-link" href="/explore">
        Explore all cases
      </Link>
      <span className="eyebrow">AVAILABLE DRAFT THEMES</span>
      <h1>
        {slug
          ? `${selected?.label ?? "This theme"} is unavailable`
          : "Find your kind of mystery."}
      </h1>
      <p>
        {slug
          ? "This shelf has been retired. These alternatives keep your mode and other filters."
          : "Counts reflect the current playable preview, not planned stories. Empty shelves are not playable links."}
      </p>
      <label>
        Play mode
        <select
          aria-label="Play mode"
          value={mode}
          onChange={(event) => {
            const p = new URLSearchParams(query);
            p.delete("themes");
            p.set("mode", event.target.value);
            router.push("/themes?" + p);
          }}
        >
          <option value="any">All available</option>
          <option value="solo">Solo</option>
          <option value="group">With friends</option>
        </select>
      </label>
      <Tiles themes={data.themes} query={query} />
    </section>
  );
}
