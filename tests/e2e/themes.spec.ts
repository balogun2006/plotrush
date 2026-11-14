import { test, expect } from "@playwright/test";
test("theme shelves preserve mode, expose honest empty states and reject unknown routes", async ({
  page,
}, info) => {
  await page.goto("/themes?mode=solo&access=free");
  await expect(
    page.getByRole("link", {
      name: "Browse Everyday Mystery: 3 cases",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Browse Wedding/ })).toHaveCount(
    0,
  );
  await page.getByLabel("Play mode", { exact: true }).selectOption("group");
  await page
    .getByRole("link", {
      name: "Browse Wedding & Family: 1 case",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/themes\/wedding-family\?.*mode=group/);
  await expect(
    page.getByRole("heading", { name: "Wedding & Family", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Missing Microphone", exact: true }),
  ).toBeVisible();
  const selectedCase = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "The Missing Microphone",
      exact: true,
    }),
  });
  await expect(
    selectedCase.getByRole("link", { name: "Play together", exact: true }),
  ).toHaveAttribute("href", "/rooms?case=missing-mic");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Play mode", { exact: true }).selectOption("solo");
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "No cases match these filters yet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Last Slice", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/themes\/wedding-family\?.*mode=solo/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (await page.request.get("/api/v1/themes/unknown-theme")).status(),
  ).toBe(404);
  const unknown = await page.goto("/themes/unknown-theme");
  expect(unknown?.status()).toBe(404);
});

test("multiple filters, removable chips, keyboard cancellation and page URLs survive navigation", async ({
  page,
}, info) => {
  await page.goto("/explore?access=free&limit=2");
  await expect(
    page.getByText("4 cases to explore", { exact: true }),
  ).toBeVisible();
  const first = await page.locator(".case-grid article h3").allTextContents();
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.locator(".case-grid article")).toHaveCount(2);
  const second = await page.locator(".case-grid article h3").allTextContents();
  expect(second.every((t) => !first.includes(t))).toBe(true);
  await page.reload();
  await expect(page.locator(".case-grid article")).toHaveCount(2);
  await page.goBack();
  await expect(page).not.toHaveURL(/cursor=/);
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "themes: Everyday Mystery", exact: true })
    .check();
  if (info.project.name !== "mobile")
    await expect(
      page.getByText("3 cases to explore", { exact: true }),
    ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "themes: Wedding & Family", exact: true })
    .check();
  if (info.project.name === "mobile")
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
  await expect(page).toHaveURL(/themes=everyday-mystery%2Cwedding-family/);
  await expect(
    page.getByText("4 cases to explore", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Remove Wedding & Family filter",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("3 cases to explore", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByText("4 cases to explore", { exact: true }),
  ).toBeVisible();
  if (info.project.name !== "mobile")
    await expect(
      page.getByRole("checkbox", {
        name: "themes: Wedding & Family",
        exact: true,
      }),
    ).toBeChecked();
  if (info.project.name === "mobile") {
    const before = page.url();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "themes: Wedding & Family", exact: true })
      .uncheck();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Filters", exact: true }),
    ).toBeFocused();
    expect(page.url()).toBe(before);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("UUID preferences use public taxonomy identities and reject stale or unsafe writes", async ({
  page,
}) => {
  await page.goto("/interests");
  const taxonomy = (await (await page.request.get("/api/v1/themes")).json())
    .data;
  const ids = {
    themeIds: [
      taxonomy.themes.find(
        (t: { slug: string }) => t.slug === "everyday-mystery",
      ).id,
    ],
    moodIds: [
      taxonomy.moods.find((m: { slug: string }) => m.slug === "lighthearted")
        .id,
    ],
    preferredDifficulty: null,
    personalisationEnabled: true,
    expectedVersion: 0,
  };
  const write = async (method: string, data: unknown) =>
    page.evaluate(
      async ({ method, data }) => {
        const r = await fetch("/api/v1/me/interests", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        return { status: r.status, body: await r.json() };
      },
      { method, data },
    );
  const saved = await write("PUT", ids);
  expect(saved.status).toBe(200);
  const own = saved.body.data;
  expect(own.themeIds).toEqual(ids.themeIds);
  expect(own.preferenceVersion).toBe(1);
  expect(own.themes).toBeUndefined();
  expect((await write("PUT", ids)).status).toBe(409);
  expect(
    (
      await page.request.delete("/api/v1/me/interests", {
        headers: { Origin: "https://example.org" },
        data: { expectedVersion: 1 },
      })
    ).status(),
  ).toBe(403);
  const cleared = await write("DELETE", { expectedVersion: 1 });
  expect(cleared.status).toBe(200);
  expect(cleared.body.data).toMatchObject({
    themeIds: [],
    moodIds: [],
    personalisationEnabled: false,
    preferenceVersion: 2,
  });
});
