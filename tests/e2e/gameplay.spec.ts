import { test, expect } from "@playwright/test";
test("autosave survives a lost response, conflicts preserve drafts, and abandonment keeps an accessible transcript", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play a free mystery", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play\//);
  const id = page.url().split("/").pop()!;
  let lost = false;
  await page.route(`**/api/v1/solo/attempts/${id}/notes`, async (route) => {
    if (route.request().method() === "PUT" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("tab", { name: "My notes", exact: true }).click();
  await page
    .getByLabel("Private investigation notes")
    .fill("Autosaved once after lost response.");
  await expect(page.getByText("Notes saved.", { exact: true })).toBeVisible();
  const stored = await page.evaluate(
    async (id) =>
      (await (await fetch(`/api/v1/solo/attempts/${id}/notes`)).json()).data,
    id,
  );
  expect(stored.notesVersion).toBe(1);
  expect(lost).toBe(true);
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("tab", { name: "My notes", exact: true }).click();
  await other
    .getByLabel("Private investigation notes")
    .fill("Other tab's latest notes.");
  await expect(other.getByText("Notes saved.", { exact: true })).toBeVisible();
  await page
    .getByLabel("Private investigation notes")
    .fill("My draft must not be lost.");
  await expect(
    page.getByRole("button", { name: "Load latest notes", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Private investigation notes")).toHaveValue(
    "My draft must not be lost.",
  );
  await page
    .getByRole("button", { name: "Load latest notes", exact: true })
    .click();
  await expect(page.getByLabel("Private investigation notes")).toHaveValue(
    "Other tab's latest notes.",
  );
  const transcript = await page.evaluate(async (id) => {
    const r = await fetch(`/api/v1/solo/attempts/${id}/transcript`);
    return {
      status: r.status,
      text: await r.text(),
      cache: r.headers.get("cache-control"),
    };
  }, id);
  expect(transcript.status).toBe(200);
  expect(transcript.cache).toContain("no-store");
  expect(transcript.text).toContain("Other tab's latest notes.");
  expect(transcript.text).not.toContain("Tunde removed the reserved box");
  await page
    .getByRole("button", { name: "End this investigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm end investigation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved investigation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Other tab's latest notes.", { exact: true }),
  ).toBeVisible();
  await other.close();
  await page
    .getByRole("button", { name: "Start a new replay", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(id));
  await expect(
    page.getByRole("heading", { name: "The Last Slice", exact: true }),
  ).toBeVisible();
});
test("the original host can reopen one linked replacement for a cancelled tutorial", async ({
  page,
}) => {
  await page.goto("/rooms");
  await page.getByLabel("Display name").fill("Recovery host");
  await page
    .getByRole("button", { name: "Create a free room", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The detectives", exact: true }),
  ).toBeVisible();
  const source = page.url();
  await page.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await page.goto(source);
  await expect(
    page.getByRole("heading", { name: "This room has ended.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Rehost without another purchase",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "The detectives", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(source);
  const target = page.url();
  await page.goto(source);
  await page
    .getByRole("button", {
      name: "Rehost without another purchase",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(target);
});
