import { NextRequest } from "next/server";
import { handleEditorial } from "@/lib/server/editorial-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function route(req: NextRequest, ctx: Context) {
  return handleEditorial(req, (await ctx.params).path);
}
export { route as GET, route as POST, route as PUT };
