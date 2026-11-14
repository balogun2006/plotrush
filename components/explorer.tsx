"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, X, ArrowLeft } from "lucide-react";
import { api } from "./api";
import { CaseCard as Card } from "@/lib/domain/content";
import { labels, Filters } from "@/lib/domain/catalogue";
import { CaseCard } from "./case-card";
import type { Theme, Mood } from "@/lib/contracts/themes";
type Data = {
  cases: Card[];
  total: number;
  nextCursor: string | null;
  revision: string;
  moods: Mood[];
  filters: Filters;
  facets: Record<string, Record<string, number>>;
  themes: (Theme & { count: number })[];
};
export function Explorer({ theme }: { theme?: Theme }) {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<{
    base: string;
    query: string;
  } | null>(null);
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
  // Discard feedback once navigation settles, including later browser Back.
  if (optimistic && optimistic.base !== query) setOptimistic(null);
  const liveQuery = optimistic?.base === query ? optimistic.query : query;
  function select(key: string, value: string) {
    const p = new URLSearchParams(expanded ? draft : liveQuery);
    p.delete("cursor");
    if (!value || value === "any") p.delete(key);
    else p.set(key, value);
    if (expanded) {
      setDraft(p.toString());
      return;
    }
    setOptimistic({ base: query, query: p.toString() });
    if (theme && key !== "themes") {
      p.delete("themes");
      router.push(basePath + "?" + p.toString(), { scroll: false });
    } else router.push("/explore?" + p.toString(), { scroll: false });
  }
  const controlParams = new URLSearchParams(expanded ? draft : liveQuery);
  const filterLabel = (key: string, value: string) =>
    key === "themes"
      ? (data?.themes.find((t) => t.slug === value)?.label ??
        labels[value] ??
        value)
      : key === "moods"
        ? (data?.moods.find((m) => m.slug === value)?.label ??
          labels[value] ??
          value)
        : (labels[value] ?? value);
  function toggle(key: string, slug: string) {
    const values = controlParams.get(key)?.split(",").filter(Boolean) ?? [];
    select(
      key,
      (values.includes(slug)
        ? values.filter((x) => x !== slug)
        : [...values, slug]
      )
        .sort()
        .join(","),
    );
  }
  const fields = (
    <div className="filter-fields">
      <div className="filter-title">
        <strong>Narrow the search</strong>
        <button
          className="text-button"
          onClick={() => (expanded ? setDraft("") : router.push("/explore"))}
        >
          Clear all
        </button>
      </div>
      <label>
        Play mode
        <select
          aria-label="Play mode"
          value={controlParams.get("mode") ?? "any"}
          onChange={(e) => select("mode", e.target.value)}
        >
          <option value="any">All available</option>
          <option value="solo">Solo</option>
          <option value="group">With friends</option>
        </select>
      </label>
      {(["themes", "moods", "difficulty"] as const).map((key) => (
        <fieldset key={key} className="facet-options">
          <legend>
            {key === "themes"
              ? "Themes"
              : key === "moods"
                ? "Moods"
                : "Difficulty"}
          </legend>
          {(key === "themes"
            ? (data?.themes ?? [])
                .filter((t) => t.status === "enabled")
                .map((t) => ({ slug: t.slug, label: t.label }))
            : key === "moods"
              ? (data?.moods ?? [])
                  .filter((m) => m.status === "enabled")
                  .map((m) => ({ slug: m.slug, label: m.label }))
              : ["beginner", "intermediate", "expert"].map((slug) => ({
                  slug,
                  label: labels[slug],
                }))
          )
            .filter(
              (t) =>
                (data?.facets[key]?.[t.slug] ?? 0) > 0 ||
                controlParams.get(key)?.split(",").includes(t.slug),
            )
            .map((t) => (
              <label key={t.slug}>
                <input
                  type="checkbox"
                  aria-label={`${key}: ${t.label}`}
                  checked={
                    controlParams.get(key)?.split(",").includes(t.slug) ?? false
                  }
                  disabled={
                    !data?.facets[key]?.[t.slug] &&
                    !controlParams.get(key)?.split(",").includes(t.slug)
                  }
                  onChange={() => toggle(key, t.slug)}
                />
                {t.label} ({data?.facets[key]?.[t.slug] ?? 0})
              </label>
            ))}
        </fieldset>
      ))}
      <label>
        Time to solve
        <select
          value={controlParams.get("duration") ?? "any"}
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
          value={controlParams.get("access") ?? "any"}
          onChange={(e) => select("access", e.target.value)}
        >
          <option value="any">All available</option>
          <option value="free">Free</option>
          <option value="paid">Premium</option>
        </select>
      </label>
    </div>
  );
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
          href={
            "/themes?" +
            (() => {
              const p = new URLSearchParams(query);
              p.delete("themes");
              p.delete("cursor");
              p.delete("limit");
              return p.toString();
            })()
          }
        >
          Browse themes
        </Link>
      </div>
      <div className="explore-layout">
        <aside className={"filters " + (expanded ? "expanded" : "")}>
          <button
            className="filter-toggle"
            aria-label="Filters"
            aria-expanded={expanded}
            ref={trigger}
            onClick={() => {
              setDraft(query);
              setExpanded(true);
              requestAnimationFrame(() => dialog.current?.showModal());
            }}
          >
            <SlidersHorizontal size={18} /> Filters{" "}
            <small>
              {["themes", "moods", "difficulty"].reduce(
                (n, k) =>
                  n +
                  (requestParams.get(k)?.split(",").filter(Boolean).length ??
                    0),
                0,
              )}{" "}
              selected
            </small>
          </button>
          {!expanded && fields}
        </aside>
        <dialog
          className="filter-dialog"
          ref={dialog}
          aria-label="Catalogue filters"
          onCancel={() => {
            setExpanded(false);
            trigger.current?.focus();
          }}
        >
          {expanded && fields}
          <button
            className="button lime"
            onClick={() => {
              const p = new URLSearchParams(draft);
              p.delete("cursor");
              const category = theme && p.get("themes") === theme.slug;
              if (category) p.delete("themes");
              router.push((category ? basePath : "/explore") + "?" + p, {
                scroll: false,
              });
              dialog.current?.close();
              setExpanded(false);
              trigger.current?.focus();
            }}
          >
            Apply filters
          </button>
          <button
            className="text-button"
            onClick={() => {
              dialog.current?.close();
              setExpanded(false);
              trigger.current?.focus();
            }}
          >
            Cancel
          </button>
        </dialog>
        <div className="explore-results">
          <div className="results-toolbar">
            <span aria-live="polite">
              {data
                ? `${data.total} ${data.total === 1 ? "case" : "cases"} to explore`
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
              {[...requestParams]
                .filter(([key]) => !["cursor", "limit"].includes(key))
                .flatMap(([key, values]) =>
                  values.split(",").map((value) => ({ key, value })),
                )
                .map(({ key, value }) => (
                  <button
                    key={key + value}
                    onClick={() =>
                      select(
                        key,
                        requestParams
                          .get(key)!
                          .split(",")
                          .filter((v) => v !== value)
                          .join(","),
                      )
                    }
                    aria-label={"Remove " + filterLabel(key, value) + " filter"}
                  >
                    {value
                      .split(",")
                      .map((v) => filterLabel(key, v))
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
                onClick={() => {
                  const p = new URLSearchParams(query);
                  p.delete("cursor");
                  router.push(
                    params.has("cursor") ? "/explore?" + p : "/explore",
                  );
                }}
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
          {data?.nextCursor && (
            <Link
              className="button dark"
              href={
                basePath +
                "?" +
                (() => {
                  const p = new URLSearchParams(query);
                  if (theme) p.delete("themes");
                  p.set("cursor", data.nextCursor!);
                  return p.toString();
                })()
              }
            >
              Next page
            </Link>
          )}
          {params.has("cursor") && (
            <button
              className="text-button"
              onClick={() => {
                const p = new URLSearchParams(query);
                p.delete("cursor");
                if (theme) p.delete("themes");
                router.push(basePath + "?" + p);
              }}
            >
              Restart browsing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
