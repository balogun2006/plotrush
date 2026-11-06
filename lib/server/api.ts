import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "./database";
import { AppError, assert } from "../domain/errors";
import {
  identity,
  createIdentity,
  limit,
  hash,
  interests,
  saveInterests,
} from "../domain/identity";
import { catalogue, start, read, mutate, library } from "../domain/game";
import { filterCases, parseFilters, facets } from "../domain/catalogue";
import { themes } from "../domain/content";
import {
  createRoom,
  joinRoom,
  roomAction,
  roomLibrary,
  displayName,
  inviteCode,
} from "../domain/rooms";
const version = z.number().int().positive();
const cookie = "plotrush_guest";
async function body(req: NextRequest) {
  assert(
    req.headers.get("content-type")?.split(";")[0] === "application/json",
    400,
    "JSON_REQUIRED",
    "Send a JSON request.",
  );
  // Bound the actual stream, including chunked requests without Content-Length.
  const reader = req.body?.getReader();
  assert(reader, 400, "BODY_REQUIRED", "Request body required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 12000) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "Request too large.");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON_INVALID", "Invalid JSON request.");
  }
}
export async function handle(req: NextRequest, path: string[]) {
  const requestId = randomUUID();
  let token: string | undefined;
  const json = (data: unknown, status = 200) => {
    const response = NextResponse.json(
      { data, meta: { requestId, serverTime: new Date().toISOString() } },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
    if (token)
      response.cookies.set(cookie, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 86400,
      });
    return response;
  };
  try {
    const write = req.method !== "GET";
    if (write) {
      const allowed = process.env.APP_URL
        ? new URL(process.env.APP_URL).origin
        : req.nextUrl.origin;
      assert(
        req.headers.get("origin") === allowed,
        403,
        "ORIGIN_DENIED",
        "This request must come from PlotRush.",
      );
    }
    const db = await database();
    let actor = await identity(db, req.cookies.get(cookie)?.value);
    const route = path.join("/");
    if (req.method === "GET" && route === "cases") {
      const f = parseFilters(req.nextUrl.searchParams);
      const all = (await catalogue(db)).filter(
        (c) => c.access === "free" && c.modes.includes("solo"),
      );
      return json({
        cases: filterCases(all, f),
        facets: facets(all, f),
        filters: f,
        preview: true,
      });
    }
    if (req.method === "GET" && route === "taxonomy") {
      const all = (await catalogue(db)).filter(
        (c) => c.access === "free" && c.modes.includes("solo"),
      );
      return json({
        themes: themes.map((id) => ({
          id,
          count: all.filter((c) => c.discovery.themes.includes(id)).length,
        })),
        preview: true,
      });
    }
    if (req.method === "GET" && route === "daily") {
      const all = (await catalogue(db)).filter(
        (c) => c.access === "free" && c.modes.includes("solo"),
      );
      const day = new Date().toISOString().slice(0, 10);
      return json({
        case: all[Math.floor(Date.now() / 86400000) % all.length],
        releaseDate: day,
        ranked: false,
        preview: true,
      });
    }
    if (req.method === "GET" && route === "interests")
      return json(
        actor ? await interests(db, actor) : { themes: [], version: 0 },
      );
    if (req.method === "GET" && route === "recommendations") {
      const all = (await catalogue(db)).filter(
        (c) => c.access === "free" && c.modes.includes("solo"),
      );
      const saved = actor ? (await interests(db, actor)).themes : [];
      const completed = actor
        ? (await library(db, actor)).filter((a) => a.state === "revealed")
        : [];
      const completedIds = actor
        ? (
            await db.query<{ case_key: string }>(
              "SELECT DISTINCT v.case_key FROM app_private.attempts a JOIN app_private.case_versions v ON v.id=a.case_version_id WHERE a.principal_id=$1 AND a.state='revealed'",
              [actor],
            )
          ).rows.map((x) => x.case_key)
        : [];
      const ranked = all
        .filter((c) => !completedIds.includes(c.id))
        .map((c) => ({
          ...c,
          recommendationReason: saved.some((t) =>
            c.discovery.themes.includes(t as (typeof themes)[number]),
          )
            ? "Matches your chosen themes"
            : "A quick mystery to try",
          rank: c.discovery.themes.filter((t) => saved.includes(t)).length,
        }))
        .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
      return json({
        label: saved.length ? "For you" : "Featured",
        cases: ranked,
        completedCount: completed.length,
      });
    }
    if (
      (req.method === "POST" && route === "solo/attempts") ||
      (req.method === "PUT" && route === "interests") ||
      (req.method === "POST" && ["rooms", "rooms/join"].includes(route))
    ) {
      if (!actor) {
        await limit(
          db,
          "guest:" +
            hash(
              req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                "unknown",
            ),
          10,
          60,
        );
        const created = await createIdentity(db);
        actor = created.id;
        token = created.token;
      }
    }
    assert(
      actor,
      401,
      "SESSION_REQUIRED",
      "Start a case in this browser to continue.",
    );
    if (write) await limit(db, "principal:" + actor, 60, 60);
    if (req.method === "GET" && route === "me/rooms")
      return json(await roomLibrary(db, actor));
    if (req.method === "POST" && route === "rooms") {
      const b = z
        .object({ caseId: z.string().max(80), displayName })
        .strict()
        .parse(await body(req));
      await limit(db, "create-room:" + actor, 5, 3600);
      return json(await createRoom(db, actor, b.caseId, b.displayName), 201);
    }
    if (req.method === "POST" && route === "rooms/join") {
      const b = z
        .object({ code: inviteCode, displayName })
        .strict()
        .parse(await body(req));
      await limit(db, "join-room:" + actor, 10, 60);
      return json(await joinRoom(db, actor, b.code, b.displayName));
    }
    if (path[0] === "rooms" && path[1]) {
      const id = z.uuid().parse(path[1]);
      if (req.method === "GET" && path.length === 2)
        return json(await roomAction(db, actor, id));
      if (req.method === "POST" && path.length === 3) {
        const action = z
          .enum([
            "ready",
            "start",
            "advance",
            "share",
            "vote",
            "heartbeat",
            "leave",
          ])
          .parse(path[2]);
        const schema =
          action === "ready"
            ? z.object({ expectedVersion: version, ready: z.boolean() })
            : action === "share"
              ? z.object({
                  expectedVersion: version,
                  clueId: z.string().max(80),
                })
              : action === "vote"
                ? z.object({
                    expectedVersion: version,
                    suspectId: z.string().max(80),
                    reasonId: z.string().max(80),
                  })
                : z.object({ expectedVersion: version });
        return json(
          await roomAction(
            db,
            actor,
            id,
            action,
            schema.strict().parse(await body(req)),
          ),
        );
      }
    }
    if (req.method === "POST" && route === "solo/attempts") {
      const b = z
        .object({ caseId: z.string().min(1).max(80) })
        .strict()
        .parse(await body(req));
      return json(await start(db, actor, b.caseId), 201);
    }
    if (req.method === "PUT" && route === "interests") {
      const b = z
        .object({
          themes: z
            .array(z.enum(themes))
            .max(6)
            .refine((xs) => new Set(xs).size === xs.length),
          expectedVersion: z.number().int().nonnegative(),
        })
        .strict()
        .parse(await body(req));
      return json(await saveInterests(db, actor, b.themes, b.expectedVersion));
    }
    if (req.method === "GET" && route === "me/library")
      return json(await library(db, actor));
    if (path[0] === "solo" && path[1] === "attempts" && path[2]) {
      const id = z.uuid().parse(path[2]);
      if (req.method === "GET" && path.length === 3)
        return json(await read(db, actor, id));
      if (req.method === "GET" && path[3] === "result" && path.length === 4) {
        const a = await read(db, actor, id);
        assert(
          a.result,
          409,
          "NOT_COMPLETE",
          "Complete the investigation first.",
        );
        return json(a.result);
      }
      const action = path[3];
      assert(path.length === 4, 404, "NOT_FOUND", "Page not found.");
      if (
        (req.method === "POST" &&
          ["advance", "hints", "accusation"].includes(action)) ||
        (req.method === "PUT" && action === "notes")
      ) {
        const schema =
          action === "accusation"
            ? z.object({
                expectedVersion: version,
                suspectId: z.string().max(80),
                reasonId: z.string().max(80),
              })
            : action === "notes"
              ? z.object({
                  expectedVersion: version,
                  text: z.string().max(2000),
                })
              : action === "hints"
                ? z.object({
                    expectedVersion: version,
                    hintId: z.string().max(80),
                  })
                : z.object({ expectedVersion: version });
        return json(
          await mutate(
            db,
            actor,
            id,
            action,
            schema.strict().parse(await body(req)),
          ),
        );
      }
    }
    throw new AppError(404, "NOT_FOUND", "Route not found.");
  } catch (e) {
    const known = e instanceof AppError;
    const validation = e instanceof z.ZodError;
    const status = known ? e.status : validation ? 400 : 503;
    if (!known && !validation)
      console.error(
        JSON.stringify({
          event: "api_failure",
          requestId,
          route: path.join("/"),
        }),
      );
    return NextResponse.json(
      {
        error: {
          code: known ? e.code : validation ? "INVALID_INPUT" : "UNAVAILABLE",
          message: known
            ? e.message
            : validation
              ? "Please check the request fields."
              : "PlotRush is temporarily unavailable. Please try again.",
          retryable: status === 503 || status === 429,
          requestId,
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
