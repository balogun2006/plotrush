"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, X, ArrowLeft } from "lucide-react";
import { api } from "./api";
import { CaseCard as Card } from "@/lib/domain/content";
import { labels, Filters } from "@/lib/domain/catalogue";
import { CaseCard } from "./case-card";
import type { Theme } from "@/lib/contracts/themes";
type Data = {
  cases: Card[];
  filters: Filters;
  facets: Record<string, Record<string, number>>;
  themes: (Theme & { count: number })[];
};
export function Explorer({ theme }: { theme?: Theme }) {
  const params = useSearchParams(),
    router = useRouter(),
    rawQuery = params.toString();
  const requestParams = new URLSearchParams(rawQuery);
  if (theme) requestParams.set("themes", theme.slug);
  const query = requestParams.toString();
  const basePath = theme ? "/themes/" + theme.slug : "/explore";
  const [response, setResponse] = useState<{
      query: string;
      data: Data | null;
      error: string;
    } | null>(null),
    [expanded, setExpanded] = useState(false);
  const data = response?.query === query ? response.data : null,
    error = response?.query === query ? response.error : "";
  useEffect(() => {
    let live = true;
    api<Data>("cases?" + query)
      .then((r) => {
        if (live) setResponse({ query, data: r, error: "" });
      })
      .catch((e) => {
        if (live) setResponse({ query, data: null, error: e.message });
      });
    return () => {
      live = false;
    };
  }, [query]);
  function select(key: string, value: string) {
    const p = new URLSearchParams(query);
    if (!value || value === "any") p.delete(key);
    else p.set(key, value);
    if (theme && key !== "themes") {
      p.delete("themes");
      router.push(basePath + "?" + p.toString(), { scroll: false });
    } else router.push("/explore?" + p.toString(), { scroll: false });
  }
  return (
    <div className="page-wrap">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Back to home
      </Link>
      <div className="page-heading">
        <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
        <h1>
          {theme ? (
            theme.label
          ) : (
            <>
              Find your next <em>mystery.</em>
            </>
          )}
        </h1>
        <p>
          {theme
            ? theme.description
            : "One case. A handful of clues. Your call."}
        </p>
        <Link
          className="text-link"
          href={"/themes?mode=" + (params.get("mode") ?? "any")}
        >
          Browse themes
        </Link>
      </div>
      <div className="explore-layout">
        <aside className={"filters " + (expanded ? "expanded" : "")}>
          <button
            className="filter-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={18} /> Filters
          </button>
          <div className="filter-fields">
            <div className="filter-title">
              <strong>Narrow the search</strong>
              <button
                className="text-button"
                onClick={() => router.push("/explore")}
              >
                Clear all
              </button>
            </div>
            <label>
              Play mode
              <select
                aria-label="Play mode"
                value={params.get("mode") ?? "any"}
                onChange={(e) => select("mode", e.target.value)}
              >
                <option value="any">All available</option>
                <option value="solo">Solo</option>
                <option value="group">With friends</option>
              </select>
            </label>
            <label>
              Theme
              <select
                value={theme?.slug ?? params.get("themes") ?? ""}
                aria-label="Theme"
                onChange={(e) => select("themes", e.target.value)}
              >
                <option value="">All themes</option>
                {data?.themes
                  .filter(
                    (t) =>
                      t.status === "enabled" &&
                      (t.count > 0 ||
                        (theme?.slug ?? params.get("themes") ?? "")
                          .split(",")
                          .includes(t.slug)),
                  )
                  .map((t) => (
                    <option value={t.slug} key={t.id} disabled={t.count === 0}>
                      {t.label} ({t.count})
                    </option>
                  ))}
                {params.get("themes")?.includes(",") && (
                  <option value={params.get("themes")!}>
                    {params
                      .get("themes")!
                      .split(",")
                      .map((t) => labels[t] ?? t)
                      .join(" + ")}
                  </option>
                )}
              </select>
            </label>
            <label>
              Mood
              <select
                value={params.get("moods") ?? ""}
                onChange={(e) => select("moods", e.target.value)}
              >
                <option value="">Any mood</option>
                {["lighthearted", "suspenseful", "dark"].map((x) => (
                  <option key={x} value={x}>
                    {labels[x]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulty
              <select
                value={params.get("difficulty") ?? ""}
                onChange={(e) => select("difficulty", e.target.value)}
              >
                <option value="">Any difficulty</option>
                {["beginner", "intermediate", "expert"].map((x) => (
                  <option key={x} value={x}>
                    {labels[x]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Time to solve
              <select
                value={params.get("duration") ?? "any"}
                onChange={(e) => select("duration", e.target.value)}
              >
                <option value="any">Any length</option>
                <option value="lt10">Under 10 min</option>
                <option value="10to19">10–19 min</option>
                <option value="20to30">20–30 min</option>
                <option value="gt30">Over 30 min</option>
              </select>
            </label>
            <label>
              Access
              <select
                value={params.get("access") ?? "any"}
                onChange={(e) => select("access", e.target.value)}
              >
                <option value="any">All available</option>
                <option value="free">Free</option>
                <option value="paid">Premium</option>
              </select>
            </label>
          </div>
        </aside>
        <div className="explore-results">
          <div className="results-toolbar">
            <span aria-live="polite">
              {data
                ? `${data.cases.length} ${data.cases.length === 1 ? "case" : "cases"} to explore`
                : "Searching…"}
            </span>
            <label className="sort-label">
              Sort
              <select
                aria-label="Sort cases"
                value={params.get("sort") ?? "newest"}
                onChange={(e) => select("sort", e.target.value)}
              >
                <option value="newest">Newest releases</option>
                <option value="duration_asc">Shortest first</option>
                <option value="difficulty_asc">Easiest first</option>
              </select>
            </label>
          </div>
          {query && (
            <div className="applied-filters">
              {[...params].map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => select(key, "")}
                  aria-label={"Remove " + key + " filter"}
                >
                  {value
                    .split(",")
                    .map((v) => labels[v] ?? v)
                    .join(", ")}
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
          {error ? (
            <div className="empty-state" role="alert">
              <h3>Let’s check those filters.</h3>
              <p>{error}</p>
              <button
                className="button dark"
                onClick={() => router.push("/explore")}
              >
                Reset filters
              </button>
            </div>
          ) : !data ? (
            <div className="loading-card" role="status">
              Opening the case files…
            </div>
          ) : data.cases.length ? (
            <div className="case-grid two">
              {data.cases.map((c) => (
                <CaseCard key={c.id} item={c} filters={data.filters} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No cases match these filters yet.</h3>
              <p>
                No cases are available in this view. Clear filters or choose
                another available theme; filters are never silently relaxed.
              </p>
              <Link
                className="button dark"
                href="/explore?mode=solo&access=free"
              >
                Show free solo cases
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
