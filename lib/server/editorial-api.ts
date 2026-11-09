import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "./database";
import { identity, limit, hash } from "../domain/identity";
import { AppError, assert } from "../domain/errors";
import { authSecret } from "../providers/email";
import { staffMember, enroll, unlock, requireStaff } from "../domain/staff";
import { reconcileDisputeInput } from "../contracts/disputes";
import { reconcileDispute } from "../domain/disputes";
import { closeRefundInput, reconcileRefundInput } from "../contracts/refunds";
import {
  closeRefundRequest,
  financeOrders,
  reconcileRefund,
} from "../domain/refunds";
import { paystackConfig, PaystackClient } from "../providers/paystack";
import * as editorial from "../domain/editorial";
import {
  draftInput,
  saveDraftInput,
  revisionInput,
  reviewInput,
  codeInput,
  scheduleInput,
  unpublishInput,
} from "../contracts/editorial";
async function jsonBody(req: NextRequest) {
  assert(
    req.headers.get("content-type")?.split(";")[0] === "application/json",
    400,
    "JSON_REQUIRED",
    "Send a JSON request.",
  );
  const reader = req.body?.getReader();
  assert(reader, 400, "BODY_REQUIRED", "Request body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 200000) {
      await reader.cancel();
      throw new AppError(413, "BODY_TOO_LARGE", "Case import is too large.");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON_INVALID", "Invalid JSON.");
  }
}
export async function handleEditorial(req: NextRequest, path: string[]) {
  const requestId = randomUUID();
  const reply = (data: unknown, status = 200) =>
    NextResponse.json(
      { data, meta: { requestId } },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    if (req.method !== "GET")
      assert(
        req.headers.get("origin") ===
          new URL(process.env.APP_URL ?? req.nextUrl.origin).origin,
        403,
        "ORIGIN_DENIED",
        "This request must come from PlotRush.",
      );
    const db = await database(),
      playerToken = req.cookies.get("plotrush_guest")?.value ?? "",
      actor = await identity(db, playerToken);
    assert(
      actor,
      401,
      "SESSION_REQUIRED",
      "Sign in with your verified staff account first.",
    );
    await staffMember(db, actor);
    if (req.method !== "GET") await limit(db, "editorial:" + actor, 30, 60);
    const ctx = {
        actor,
        playerToken,
        staffToken: req.cookies.get("plotrush_staff")?.value,
      },
      route = path.join("/");
    if (route === "access" && req.method === "GET") {
      const m = await staffMember(db, actor);
      let verified = false;
      try {
        await requireStaff(db, actor, playerToken, ctx.staffToken, "read");
        verified = true;
      } catch {}
      return reply({
        roles: m.roles,
        mfaConfigured: !!m.secret_cipher,
        verified,
        publishEnabled: process.env.FEATURE_EDITORIAL_PUBLISH === "true",
      });
    }
    if (route === "mfa/enroll" && req.method === "POST") {
      z.object({})
        .strict()
        .parse(await jsonBody(req));
      return reply(await enroll(db, actor, playerToken, authSecret()));
    }
    if (route === "mfa/verify" && req.method === "POST") {
      const { code } = codeInput.parse(await jsonBody(req));
      const token = await unlock(db, actor, playerToken, code, authSecret());
      const res = reply({ verified: true });
      res.cookies.set("plotrush_staff", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 600,
      });
      return res;
    }
    if (route === "mfa/lock" && req.method === "POST") {
      z.object({})
        .strict()
        .parse(await jsonBody(req));
      if (ctx.staffToken)
        await db.query(
          "DELETE FROM app_private.staff_sessions WHERE token_hash=$1 AND principal_id=$2",
          [hash(ctx.staffToken), actor],
        );
      const res = reply({ verified: false });
      res.cookies.set("plotrush_staff", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });
      return res;
    }
    if (route === "finance/orders" && req.method === "GET") {
      const search = z
        .string()
        .trim()
        .max(100)
        .parse(req.nextUrl.searchParams.get("search") ?? "");
      return reply(await financeOrders(db, ctx, search));
    }
    if (
      path[0] === "finance" &&
      path[1] === "orders" &&
      path.length === 4 &&
      req.method === "POST"
    ) {
      const orderId = z.uuid().parse(path[2]);
      if (path[3] === "reconcile-dispute") {
        await requireStaff(db, actor, playerToken, ctx.staffToken, "finance");
        const { providerId } = reconcileDisputeInput.parse(await jsonBody(req));
        const config = paystackConfig();
        assert(
          config?.environment === "test",
          503,
          "PAYMENT_CONFIG_REQUIRED",
          "Paystack test credentials are required.",
        );
        return reply(
          await reconcileDispute(
            db,
            ctx,
            orderId,
            providerId,
            new PaystackClient(config),
          ),
        );
      }
      if (path[3] === "reconcile-refund") {
        await requireStaff(db, actor, playerToken, ctx.staffToken, "finance");
        const { providerId } = reconcileRefundInput.parse(await jsonBody(req));
        const config = paystackConfig();
        assert(
          config?.environment === "test",
          503,
          "PAYMENT_CONFIG_REQUIRED",
          "Paystack test credentials are required.",
        );
        return reply(
          await reconcileRefund(
            db,
            ctx,
            orderId,
            providerId,
            new PaystackClient(config),
          ),
        );
      }
      if (path[3] === "close-refund-request") {
        const { requestId, reason } = closeRefundInput.parse(
          await jsonBody(req),
        );
        return reply(
          await closeRefundRequest(db, ctx, orderId, requestId, reason),
        );
      }
    }
    if (route === "cases" && req.method === "GET")
      return reply(await editorial.listEditorial(db, ctx));
    if (route === "templates" && req.method === "GET")
      return reply(await editorial.templates(db, ctx));
    if (route === "audit" && req.method === "GET")
      return reply(await editorial.editorialAudit(db, ctx));
    if (route === "cases" && req.method === "POST") {
      const b = draftInput.parse(await jsonBody(req));
      return reply(await editorial.createDraft(db, ctx, b.content), 201);
    }
    if (path[0] === "cases" && path[1]) {
      const id = z.uuid().parse(path[1]);
      if (path.length === 2 && req.method === "GET")
        return reply(await editorial.readDraft(db, ctx, id));
      if (path.length === 2 && req.method === "PUT") {
        const b = saveDraftInput.parse(await jsonBody(req));
        return reply(
          await editorial.saveDraft(db, ctx, id, b.expectedRevision, b.content),
        );
      }
      if (path.length === 3 && req.method === "POST") {
        if (path[2] === "approve") {
          const b = reviewInput.parse(await jsonBody(req));
          return reply(
            await editorial.transition(
              db,
              ctx,
              id,
              b.expectedRevision,
              "approve",
              b.review,
            ),
          );
        }
        const action = z
            .enum(["submit", "return", "publish", "revise"])
            .parse(path[2]),
          b = revisionInput.parse(await jsonBody(req));
        return reply(
          await editorial.transition(
            db,
            ctx,
            id,
            b.expectedRevision,
            action,
            undefined,
            process.env.FEATURE_EDITORIAL_PUBLISH === "true",
          ),
        );
      }
    }
    if (
      path[0] === "releases" &&
      path[1] &&
      path[2] === "unpublish" &&
      path.length === 3 &&
      req.method === "POST"
    ) {
      const b = unpublishInput.parse(await jsonBody(req));
      return reply(await editorial.unpublish(db, ctx, path[1], b.reason));
    }
    if (route === "calendar" && req.method === "POST") {
      const b = scheduleInput.parse(await jsonBody(req));
      return reply(
        await editorial.schedule(
          db,
          ctx,
          b.day,
          b.versionId,
          process.env.FEATURE_EDITORIAL_PUBLISH === "true",
        ),
      );
    }
    throw new AppError(404, "NOT_FOUND", "Staff endpoint unavailable.");
  } catch (e) {
    const known = e instanceof AppError,
      validation = e instanceof z.ZodError;
    return NextResponse.json(
      {
        error: {
          code: known ? e.code : validation ? "INVALID_INPUT" : "UNAVAILABLE",
          message: known
            ? e.message
            : validation
              ? "Check the case schema, review fields and identifiers."
              : "Staff workspace temporarily unavailable.",
          requestId,
        },
      },
      {
        status: known ? e.status : validation ? 400 : 503,
        headers: {
          "Cache-Control": "private, no-store",
          ...(known && e.status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}
