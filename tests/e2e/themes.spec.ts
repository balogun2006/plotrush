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
  const selectedCase = page
    .getByRole("article")
    .filter({
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
