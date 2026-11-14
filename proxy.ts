import { NextRequest, NextResponse } from "next/server";
import { database } from "./lib/server/database";
import { resolveTheme } from "./lib/domain/themes";

// Resolve status before streaming a page, so retired links really return410.
export async function proxy(req: NextRequest) {
  const slug = req.nextUrl.pathname.split("/")[2];
  if (!slug) return NextResponse.next();
  const db = await database(),
    canonical = await resolveTheme(db, slug);
  if (!canonical) return NextResponse.next();
  if (canonical !== slug) {
    const target = req.nextUrl.clone();
    target.pathname = "/themes/" + canonical;
    if (target.searchParams.get("themes") === slug)
      target.searchParams.set("themes", canonical);
    return NextResponse.redirect(target, 308);
  }
  const retired =
    (
      await db.query<{ status: string }>(
        "SELECT status FROM app_private.themes WHERE slug=$1",
        [canonical],
      )
    ).rows[0]?.status === "retired";
  if (retired) {
    const target = req.nextUrl.clone();
    target.pathname = "/theme-unavailable/" + canonical;
    return NextResponse.rewrite(target);
  }
  return NextResponse.next();
}
export const config = { matcher: "/themes/:slug" };
