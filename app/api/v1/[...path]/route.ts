import { NextRequest } from "next/server";
import { handle } from "@/lib/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function route(req: NextRequest, context: Context) {
  return handle(req, (await context.params).path);
}
export { route as GET, route as POST, route as PUT };
