import { test, expect } from "@playwright/test";
test("guest completes, resumes and shares a spoiler-free solo mystery", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little mystery. A big aha." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play a free mystery", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play\//);
  await expect(
    page.getByRole("heading", { name: "The Last Slice", exact: true }),
  ).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "plotrush_guest")?.httpOnly).toBe(true);
  await page.getByText("Door sensor", { exact: true }).click();
  await expect(page.getByText(/The fridge door opened once/)).toBeVisible();
  await page.getByRole("tab", { name: "My notes" }).click();
  await page
    .getByLabel("Private investigation notes")
    .fill("Follow the kitchen camera.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "My notes" }).click();
  await expect(page.getByLabel("Private investigation notes")).toHaveValue(
    "Follow the kitchen camera.",
  );
  await page.getByRole("tab", { name: "Make a call" }).click();
  await page.getByRole("radio", { name: "Tunde", exact: true }).check();
  await page.getByRole("radio", { name: /The fridge opened during/ }).check();
  await page.getByRole("button", { name: "Submit my verdict" }).click();
  await page.getByRole("button", { name: "Confirm my verdict" }).click();
  await expect(
    page.getByRole("heading", { name: "That’s your aha moment." }),
  ).toBeVisible();
  await expect(
    page.getByText("Tunde removed the reserved box", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "That’s your aha moment." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My cases", exact: true }).click();
  await expect(page.getByText("100/100 · View your reveal")).toBeVisible();
});
test("filters persist in URL and honest empty states never substitute paid/group content", async ({
  page,
}) => {
  await page.goto(
    "/explore?themes=cold-case,thriller&mode=solo&access=free&duration=lt10",
  );
  await expect(
    page.getByRole("heading", { name: "No cases match these filters yet." }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/themes=cold-case,thriller/);
  await expect(page.getByText("0 cases to explore")).toBeVisible();
  await page.getByRole("link", { name: "Show free solo cases" }).click();
  await expect(page.getByText("3 cases to explore")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("another browser cannot read notes, hints or result and unsafe origins are rejected", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play a free mystery", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play\//);
  const id = page.url().split("/").pop();
  const other = await browser.newContext({ baseURL });
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await otherPage
    .getByRole("button", { name: "Play a free mystery", exact: true })
    .click();
  await expect(otherPage).toHaveURL(/\/play\//);
  const status = await otherPage.evaluate(
    async (target) => (await fetch("/api/v1/solo/attempts/" + target)).status,
    id,
  );
  expect(status).toBe(404);
  const attack = await page.request.post("/api/v1/solo/attempts", {
    headers: { Origin: "https://example.org" },
    data: { caseId: "last-slice" },
  });
  expect(attack.status()).toBe(403);
  await other.close();
});
