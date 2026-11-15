import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { totp } from "../../lib/security/totp";
async function verify(page: Page, email: string, existing = false) {
  await page.goto("/account");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  const message = page.getByText(/Development only · No email sent/);
  await expect(message).toBeVisible();
  const code = (await message.innerText()).match(/\d{8}/)![0];
  await page.getByLabel("Verification code").fill(code);
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  if (existing)
    await page
      .getByRole("button", {
        name: "Confirm and combine progress",
        exact: true,
      })
      .click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
}
test("owner exports, cancels deletion, re-verifies and receives administrator-reviewed erasure", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(120000);
  const email = crypto.randomUUID() + "@example.test";
  await verify(page, email);
  await page
    .getByRole("button", { name: "Prepare my account export", exact: true })
    .click();
  const exportLink = page.getByRole("link", {
    name: "Download account export",
    exact: true,
  });
  await expect(exportLink).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportLink.click(),
  ]);
  const file = info.outputPath("synthetic-account-export.json");
  await download.saveAs(file);
  const data = JSON.parse(await readFile(file, "utf8"));
  expect(data.profile.email).toBe(email);
  expect(data.preferences.themeIds).toEqual([]);
  expect(JSON.stringify(data)).not.toMatch(
    /code_hash|token_hash|decisiveClueIds|eliminations/,
  );
  await page
    .getByLabel("Type DELETE MY ACCOUNT", { exact: true })
    .fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Submit deletion request", exact: true })
    .click();
  await expect(page.getByText(/Deletion request: pending/)).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel deletion request", exact: true })
    .click();
  await expect(page.getByText(/Deletion request: cancelled/)).toBeVisible();
  await page
    .getByRole("button", { name: "Verify email again", exact: true })
    .click();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  const message = page.getByText(/Development only · No email sent/);
  await expect(message).toBeVisible();
  await page
    .getByLabel("Verification code")
    .fill((await message.innerText()).match(/\d{8}/)![0]);
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Type DELETE MY ACCOUNT", { exact: true })
    .fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Submit deletion request", exact: true })
    .click();
  await expect(page.getByText(/Deletion request: pending/)).toBeVisible();
  const requests = await page.evaluate(
    async () =>
      (await (await fetch("/api/v1/account/privacy-requests")).json()).data,
  );
  const id = requests.find(
    (r: { kind: string; state: string }) =>
      r.kind === "deletion" && r.state === "pending",
  ).id;
  const ctx = await browser.newContext({ baseURL }),
    staff = await ctx.newPage();
  try {
    await verify(staff, `studio-admin-${info.project.name}@example.test`, true);
    await staff.goto("/admin");
    await staff
      .getByRole("button", { name: "Generate setup key", exact: true })
      .click();
    const key = staff.locator('code[aria-label="Authenticator setup key"]');
    await expect(key).toBeVisible();
    await staff
      .getByLabel("Authenticator code")
      .fill(totp((await key.textContent())!, Math.floor(Date.now() / 30000)));
    await staff
      .getByRole("button", { name: "Verify staff access", exact: true })
      .click();
    await expect(
      staff.getByRole("heading", {
        name: "Account privacy requests",
        exact: true,
      }),
    ).toBeVisible();
    await staff
      .getByLabel(`Decision for ${id}`, { exact: true })
      .selectOption("complete");
    await staff
      .getByLabel(`Review reason for ${id}`, { exact: true })
      .fill("Synthetic browser privacy review; no real account affected.");
    await staff
      .getByLabel(`Approved retention reference for ${id}`, { exact: true })
      .fill("Synthetic retention basis for disposable test account.");
    await staff
      .getByLabel(`Backup erasure or replay reference for ${id}`, {
        exact: true,
      })
      .fill("Synthetic isolated recovery-ledger replay test.");
    await staff
      .getByRole("checkbox", {
        name: /I reviewed the applicable retention basis/,
      })
      .check();
    await staff
      .getByRole("button", {
        name: `Review deletion request ${id}`,
        exact: true,
      })
      .click();
    await expect(
      staff.getByText("Privacy review saved.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Email address")).toBeVisible();
    expect(
      (await page.request.get("/api/v1/me/interests/export")).status(),
    ).toBe(401);
  } finally {
    await ctx.close();
  }
});
