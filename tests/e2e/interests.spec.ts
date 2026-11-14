import { test, expect } from "@playwright/test";
test("private preferences persist, refresh another tab, reject stale writes and clear without losing a case", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await page.goto("/interests");
  await expect(
    page.getByRole("button", { name: "Save my interests" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Everyday Mystery", exact: true })
    .click();
  await page.getByRole("button", { name: "Lighthearted", exact: true }).click();
  await page.getByLabel("Preferred difficulty").selectOption("beginner");
  await page.getByRole("button", { name: "Save my interests" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your private interests are saved.",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Lighthearted", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Preferred difficulty")).toHaveValue("beginner");
  const home = await context.newPage();
  await home.goto("/");
  await expect(
    home.getByRole("heading", { name: "Your next plot twist" }),
  ).toBeVisible();
  const stale = await context.newPage();
  await stale.goto("/interests");
  await expect(
    stale.getByRole("button", { name: "Save my interests" }),
  ).toBeEnabled();
  await page
    .getByLabel("Use my interests for personalised recommendations")
    .uncheck();
  await page.getByRole("button", { name: "Save my interests" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your private interests are saved.",
  );
  await expect(
    home.getByRole("heading", { name: "Featured mysteries", exact: true }),
  ).toBeVisible();
  await stale.getByRole("button", { name: "Save my interests" }).click();
  await expect(
    stale.getByRole("alert").filter({ hasText: "Your interests changed" }),
  ).toBeVisible();
  const other = await browser.newContext({ baseURL });
  const outsider = await other.newPage();
  await outsider.goto("/interests");
  await expect(
    outsider.getByRole("button", { name: "Lighthearted", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const attempt = await page.evaluate(
    async () =>
      (
        await (
          await fetch("/api/v1/solo/attempts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseId: "last-slice" }),
          })
        ).json()
      ).data,
  );
  const attack = await page.request.delete("/api/v1/interests", {
    headers: { Origin: "https://example.org" },
    data: { expectedVersion: 2 },
  });
  expect(attack.status()).toBe(403);
  await page
    .getByRole("button", { name: "Clear interests", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Interests cleared.");
  await expect(
    page.getByLabel("Use my interests for personalised recommendations"),
  ).not.toBeChecked();
  const stored = await page.evaluate(
    async () => (await (await fetch("/api/v1/interests")).json()).data,
  );
  expect(stored).toMatchObject({
    themes: [],
    moods: [],
    preferredDifficulty: null,
    personalisationEnabled: false,
    version: 3,
  });
  await page.goto("/play/" + attempt.id);
  await expect(
    page.getByRole("heading", { name: "The Last Slice", exact: true }),
  ).toBeVisible();
  await other.close();
  await home.close();
  await stale.close();
});
