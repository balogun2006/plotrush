import { NextRequest } from "next/server";
import { database } from "@/lib/server/database";
import { identity, limit } from "@/lib/domain/identity";
import { roomAction } from "@/lib/domain/rooms";
import { AppError } from "@/lib/domain/errors";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await params).id),
      db = await database(),
      token = req.cookies.get("plotrush_guest")?.value,
      actor = await identity(db, token);
    if (!actor)
      throw new AppError(
        401,
        "SESSION_REQUIRED",
        "Sign in to this room first.",
      );
    await limit(db, "room-stream:" + actor, 12, 60);
    const initial = await roomAction(db, actor, id);
    const raw =
      req.headers.get("last-event-id") ??
      req.nextUrl.searchParams.get("after") ??
      "0";
    if (!/^\d{1,10}$/.test(raw) || Number(raw) > initial.stateVersion)
      throw new AppError(400, "CURSOR_INVALID", "Invalid room revision.");
    let stopped = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          const send = (value: string) =>
            controller.enqueue(encoder.encode(value));
          let cursor = initial.stateVersion;
          try {
            send(
              `id: ${cursor}\nevent: room_changed\ndata: ${JSON.stringify({ revision: cursor })}\n\n`,
            );
            const until = Date.now() + 30000;
            while (!stopped && !req.signal.aborted && Date.now() < until) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              if (stopped || req.signal.aborted) break;
              if ((await identity(db, token)) !== actor) {
                send("event: closed\ndata: {}\n\n");
                break;
              }
              const allowed = await db.query(
                "SELECT 1 FROM app_private.room_members m JOIN app_private.rooms r ON r.id=m.room_id WHERE m.room_id=$1 AND m.principal_id=$2 AND (NOT m.departed OR (r.host_id=$2 AND r.state->>'phase' IN ('revealed','expired','cancelled')))",
                [id, actor],
              );
              if (!allowed.rows.length) {
                send("event: closed\ndata: {}\n\n");
                break;
              }
              const events = (
                await db.query<{ revision: number }>(
                  "SELECT revision FROM app_private.room_events WHERE room_id=$1 AND revision>$2 ORDER BY revision LIMIT 50",
                  [id, cursor],
                )
              ).rows;
              for (const event of events) {
                cursor = event.revision;
                send(
                  `id: ${cursor}\nevent: room_changed\ndata: ${JSON.stringify({ revision: cursor })}\n\n`,
                );
              }
              if (!events.length) send(": heartbeat\n\n");
            }
            if (!stopped) controller.close();
          } catch {
            if (!stopped)
              controller.error(new Error("Room stream interrupted"));
          }
        })();
      },
      cancel() {
        stopped = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private, no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      {
        error: {
          code: e instanceof AppError ? e.code : "UNAVAILABLE",
          message:
            e instanceof AppError ? e.message : "Room stream unavailable.",
        },
      },
      {
        status:
          e instanceof AppError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
