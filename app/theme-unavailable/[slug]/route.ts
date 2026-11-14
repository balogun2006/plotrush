import { database } from "@/lib/server/database";
import { themePage } from "@/lib/domain/discovery";
import { parseFilters } from "@/lib/domain/catalogue";
import { AppError } from "@/lib/domain/errors";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params,
      p = new URL(req.url).searchParams;
    p.delete("themes");
    p.delete("cursor");
    p.delete("limit");
    const page = await themePage(await database(), slug, parseFilters(p));
    if (page.theme.status !== "retired")
      return Response.redirect(
        new URL("/themes/" + slug + "?" + p, req.url),
        307,
      );
    const links = page.alternatives
      .map(
        (t) =>
          `<li><a href="${escape("/themes/" + t.slug + "?" + p)}">${escape(t.label)} (${t.count} ${t.count === 1 ? "case" : "cases"})</a></li>`,
      )
      .join("");
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Theme unavailable · PlotRush</title><style>body{margin:0;background:#231c34;color:#faf6ed;font:18px system-ui;line-height:1.6}main{max-width:800px;padding:48px 24px;margin:auto}a{color:#dcf76b}li{margin:16px 0}</style></head><body><main><a href="/themes">Browse themes</a><h1>${escape(page.theme.label)} is unavailable</h1><p>This theme has been retired. These alternatives keep your mode and other filters.</p>${links ? "<ul>" + links + "</ul>" : "<p>No alternatives match these filters yet.</p>"}<a href="/explore">Explore all cases</a></main></body></html>`,
      {
        status: 410,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        },
      },
    );
  } catch (e) {
    return new Response(
      e instanceof AppError ? e.message : "Theme unavailable",
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
