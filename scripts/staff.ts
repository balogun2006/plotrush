// Operator-only command. No public role-grant endpoint or automatic email allowlist.
import { postgres } from "../lib/db/adapters";
import { audit, staffRoles } from "../lib/domain/staff";
import { z } from "zod";
const [action, email, role] = process.argv.slice(2);
if (
  !["grant", "revoke"].includes(action) ||
  !z.email().safeParse(email).success ||
  (action === "grant" && !staffRoles.some((item) => item === role))
)
  throw Error(
    "Usage: pnpm staff:manage grant <verified-email> <content_editor|content_publisher|finance|admin> OR revoke <verified-email>",
  );
if (!process.env.DATABASE_URL)
  throw Error(
    "Set the private PostgreSQL DATABASE_URL in the authorised operator environment.",
  );
const db = await postgres(process.env.DATABASE_URL);
try {
  await db.transaction(async (tx) => {
    const a = (
      await tx.query<{ principal_id: string }>(
        "SELECT principal_id FROM app_private.accounts WHERE email=$1",
        [email.toLowerCase()],
      )
    ).rows[0];
    if (!a) throw Error("The account must complete email verification first.");
    if (action === "grant")
      await tx.query(
        "INSERT INTO app_private.staff_members(principal_id,roles) VALUES($1,$2) ON CONFLICT(principal_id) DO UPDATE SET roles=excluded.roles,active=true,updated_at=now()",
        [a.principal_id, [role]],
      );
    else
      await tx.query(
        "UPDATE app_private.staff_members SET active=false,updated_at=now() WHERE principal_id=$1",
        [a.principal_id],
      );
    await tx.query(
      "DELETE FROM app_private.staff_sessions WHERE principal_id=$1",
      [a.principal_id],
    );
    await audit(
      tx,
      a.principal_id,
      "staff.operator_" + action,
      a.principal_id,
      { role: action === "grant" ? role : null },
    );
  });
  console.log("Staff membership updated; previous staff sessions invalidated.");
} finally {
  await db.close();
}
