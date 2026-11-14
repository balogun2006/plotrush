import { test, expect, devices, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { totp } from "../../lib/security/totp";
async function call(
  page: Page,
  path: string,
  options?: { data?: unknown; headers?: Record<string, string> },
) {
  const result = await page.evaluate(
    async ({ path, data }) => {
      const r = await fetch(path, {
        method: data === undefined ? "GET" : "POST",
        headers:
          data === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, data: options?.data },
  );
  return { status: () => result.status, json: async () => result.body };
}
async function signIn(page: Page, email: string, desk = "Case desk") {
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
  await page
    .getByRole("button", { name: "Confirm and combine progress", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "Generate setup key", exact: true })
    .click();
  const key = page.locator('code[aria-label="Authenticator setup key"]');
  await expect(key).toBeVisible();
  const secret = (await key.textContent())!;
  await page
    .getByLabel("Authenticator code")
    .fill(totp(secret, Math.floor(Date.now() / 30000)));
  await page
    .getByRole("button", { name: "Verify staff access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: desk, exact: true }),
  ).toBeVisible();
}

test("finance staff can download a private sandbox CSV after MFA", async ({
  page,
}, info) => {
  const endpoint =
    "/api/v1/admin/finance/revenue.csv?from=2025-02-01&to=2025-02-01";
  const denied = await page.request.get(endpoint);
  expect(denied.status()).toBe(401);
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `finance-report-${info.project.name}`,
  });
  await signIn(
    page,
    `studio-finance-${info.project.name}@example.test`,
    "Finance desk",
  );
  await page.getByLabel("From (UTC)").fill("2025-02-01");
  await page.getByLabel("Through (UTC)").fill("2025-02-01");
  const response = page.waitForResponse((r) => r.url().endsWith(endpoint));
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download revenue CSV", exact: true })
    .click();
  const csv = await response;
  expect(csv.status()).toBe(200);
  expect(csv.headers()["cache-control"]).toBe("private, no-store");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const file = await download;
  expect(file.suggestedFilename()).toBe(
    "plotrush-test-revenue-2025-02-01-2025-02-01.csv",
  );
  expect(await readFile((await file.path())!, "utf8")).toBe(
    "environment,from_utc,to_utc,currency,play_mode,gross_minor,confirmed_refund_minor,net_before_fees_minor\r\n",
  );
});
test("independent staff draft, review, publish and withdraw a version without exposing solutions to players", async ({
  browser,
  baseURL,
  page,
}, info) => {
  test.setTimeout(120000);
  await page.context().setExtraHTTPHeaders({
    "X-Forwarded-For": `daily-guest-${info.project.name}`,
  });
  const denied = await page.request.get("/api/v1/admin/templates");
  expect(denied.status()).toBe(401);
  expect(JSON.stringify(await denied.json())).not.toContain("explanation");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Staff sign-in required", exact: true }),
  ).toBeVisible();
  const contexts = await Promise.all(
    ["editor", "publisher"].map((role) =>
      browser.newContext({
        ...(info.project.name === "mobile"
          ? devices["Pixel 7"]
          : devices["Desktop Chrome"]),
        baseURL,
        extraHTTPHeaders: {
          "X-Forwarded-For": `studio-${role}-${info.project.name}`,
        },
      }),
    ),
  );
  try {
    const [editor, publisher] = await Promise.all(
      contexts.map((c) => c.newPage()),
    );
    await signIn(editor, `studio-editor-${info.project.name}@example.test`);
    const locked = await page.request.get("/api/v1/admin/cases");
    expect(locked.status()).toBe(401);
    await editor
      .getByLabel("Draft example")
      .selectOption({ label: "The Last Slice" });
    const field = editor.getByLabel("Case content JSON");
    const content = JSON.parse(await field.inputValue());
    content.key = "studio-" + crypto.randomUUID();
    content.slug = content.key;
    content.title = "Studio test " + info.project.name;
    await field.fill(JSON.stringify(content, null, 2));
    await editor
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await expect(
      editor.getByText("Draft saved and machine validation passed.", {
        exact: true,
      }),
    ).toBeVisible();
    const draft = (
      await (await call(editor, "/api/v1/admin/cases")).json()
    ).data.drafts.find((d: { case_key: string }) => d.case_key === content.key);
    const forged = await call(
      editor,
      `/api/v1/admin/cases/${draft.id}/publish`,
      {
        headers: { Origin: baseURL! },
        data: { expectedRevision: draft.revision },
      },
    );
    expect(forged.status()).toBe(403);
    await editor
      .getByRole("button", { name: "Submit for review", exact: true })
      .click();
    await expect(
      editor.getByText("Case submitted for independent review.", {
        exact: true,
      }),
    ).toBeVisible();
    await signIn(
      publisher,
      `studio-publisher-${info.project.name}@example.test`,
    );
    await publisher
      .getByRole("button", { name: content.title, exact: true })
      .click();
    for (const check of [
      "Logic",
      "Accessibility",
      "Rights",
      "Sensitivity",
      "Spoilers",
    ])
      await publisher
        .getByRole("checkbox", { name: check + " checked", exact: true })
        .check();
    await publisher
      .getByLabel("Blind-test evidence")
      .fill("Synthetic browser test only; no external blind test claimed.");
    await publisher
      .getByLabel("Review notes")
      .fill("Synthetic review of a public fixture for automated acceptance.");
    await publisher
      .getByRole("button", { name: "Approve reviewed draft", exact: true })
      .click();
    await expect(
      publisher.getByText("Case approved.", { exact: true }),
    ).toBeVisible();
    await publisher
      .getByRole("button", { name: "Publish approved version", exact: true })
      .click();
    await publisher
      .getByRole("button", { name: "Confirm publication", exact: true })
      .click();
    await expect(
      publisher.getByText("Case published.", { exact: true }),
    ).toBeVisible();
    const catalogue = await (await page.request.get("/api/v1/cases")).json();
    expect(JSON.stringify(catalogue)).toContain(content.title);
    expect(JSON.stringify(catalogue)).not.toContain(content.answer.explanation);
    const start = await call(editor, "/api/v1/solo/attempts", {
      headers: { Origin: baseURL! },
      data: { caseId: content.key },
    });
    expect(start.status()).toBe(201);
    const attempt = (await start.json()).data;
    const releases = (
      await (await call(publisher, "/api/v1/admin/cases")).json()
    ).data.releases;
    const version = releases.find(
      (r: { case_key: string }) => r.case_key === content.key,
    ).version_id;
    await publisher
      .getByLabel(`Featured position for ${content.title}`, { exact: true })
      .fill("1");
    await publisher
      .getByRole("button", {
        name: `Save featured position for ${content.title}`,
        exact: true,
      })
      .click();
    await expect(
      publisher.getByText("Featured selection saved.", { exact: true }),
    ).toBeVisible();
    const picks = await (
      await page.request.get("/api/v1/recommendations")
    ).json();
    expect(picks.data.cases[0].id).toBe(content.key);
    expect(picks.data.cases[0].firstPublishedAt).toBeTruthy();
    expect(picks.data.cases[0].caseUuid).toMatch(/^[0-9a-f-]{36}$/);
    await publisher
      .getByLabel("Release date")
      .fill(new Date().toISOString().slice(0, 10));
    await publisher.getByLabel("Published version").selectOption(version);
    await publisher
      .getByRole("button", { name: "Schedule daily case", exact: true })
      .click();
    await expect(
      publisher.getByText("UTC calendar slot saved.", { exact: true }),
    ).toBeVisible();
    await page.goto("/");
    const daily = page.getByRole("region", { name: "Daily mystery" });
    await expect(
      daily.getByRole("heading", { name: content.title }),
    ).toBeVisible();
    await daily.getByRole("button", { name: "Play today’s case" }).click();
    await expect(page).toHaveURL(/\/play\//);
    await expect(
      page.getByText(/DAILY MYSTERY \/ \d{4}-\d{2}-\d{2}/),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Make a call" }).click();
    await page.getByRole("radio", { name: "Tunde", exact: true }).check();
    await page.getByRole("radio", { name: /The fridge opened during/ }).check();
    await page.getByRole("button", { name: "Submit my verdict" }).click();
    await page.getByRole("button", { name: "Confirm my verdict" }).click();
    await expect(page.getByText(/Daily result for/)).toBeVisible();
    const dailyAttempt = page.url();
    await page.goto("/");
    await expect(daily.getByText(/1 day in your streak/)).toBeVisible();
    await daily.getByRole("link", { name: "View today’s result" }).click();
    await expect(page).toHaveURL(dailyAttempt);
    if (info.project.name === "chromium") {
      await publisher.evaluate(() => window.scrollTo(0, 0));
      await publisher.screenshot({
        path: "docs/previews/plotrush-editorial-studio.jpg",
        fullPage: false,
      });
    }
    await publisher
      .getByLabel("Withdrawal reason")
      .fill("Synthetic test complete; prevent public fixture duplication.");
    await publisher
      .getByRole("button", { name: "Withdraw release", exact: true })
      .click();
    await expect(
      publisher.getByText(
        "New starts stopped. Existing games retain their version.",
        { exact: true },
      ),
    ).toBeVisible();
    await editor.goto("/");
    await expect(
      editor
        .getByRole("region", { name: "Daily mystery" })
        .getByText("FROM THE ARCHIVE"),
    ).toBeVisible();
    const after = await call(editor, "/api/v1/solo/attempts/" + attempt.id);
    expect(after.status()).toBe(200);
    expect((await after.json()).data.title).toBe(content.title);
    const again = await call(editor, "/api/v1/solo/attempts", {
      headers: { Origin: baseURL! },
      data: { caseId: content.key },
    });
    expect(again.status()).toBe(404);
    await publisher
      .getByLabel("Status for supernatural", { exact: true })
      .selectOption("retired");
    await publisher
      .getByLabel("Change reason for supernatural", { exact: true })
      .fill("Synthetic taxonomy retirement check; no content changed.");
    await publisher
      .getByRole("button", { name: "Save theme supernatural", exact: true })
      .click();
    await expect(
      publisher.getByText("Theme changes saved.", { exact: true }),
    ).toBeVisible();
    const retired = await page.request.get(
      "/api/v1/themes/supernatural?mode=group&access=free",
    );
    expect(retired.status()).toBe(410);
    expect(
      (await retired.json()).error.details.alternatives.map(
        (t: { slug: string }) => t.slug,
      ),
    ).toContain("wedding-family");
    expect(
      (await page.request.get("/api/v1/cases?themes=supernatural")).status(),
    ).toBe(409);
    const retiredPage = await page.goto(
      "/themes/supernatural?mode=group&access=free",
    );
    expect(retiredPage?.status()).toBe(410);
    await expect(
      page.getByRole("heading", {
        name: "Supernatural is unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await publisher
      .getByLabel("Status for supernatural", { exact: true })
      .selectOption("enabled");
    await publisher
      .getByLabel("Change reason for supernatural", { exact: true })
      .fill("Restore synthetic taxonomy seed after the test.");
    await publisher
      .getByRole("button", { name: "Save theme supernatural", exact: true })
      .click();
    await expect(
      publisher.getByText("Theme changes saved.", { exact: true }),
    ).toBeVisible();
    const customSlug = "browser-theme-" + info.project.name,
      renamedSlug = customSlug + "-renamed";
    await publisher
      .getByText("Create a theme or mood", { exact: true })
      .click();
    await publisher
      .getByLabel("New taxonomy slug", { exact: true })
      .fill(customSlug);
    await publisher
      .getByLabel("New taxonomy label", { exact: true })
      .fill("Synthetic browser theme");
    await publisher
      .getByLabel("New theme description", { exact: true })
      .fill("Synthetic taxonomy browser acceptance only.");
    await publisher
      .getByLabel("Creation reason", { exact: true })
      .fill("Synthetic creation check without new public content.");
    await publisher
      .getByRole("button", { name: "Create taxonomy entry", exact: true })
      .click();
    await expect(
      publisher.getByRole("button", {
        name: "Save theme " + customSlug,
        exact: true,
      }),
    ).toBeVisible();
    await publisher
      .getByLabel("New URL slug for " + customSlug, { exact: true })
      .fill(renamedSlug);
    await publisher
      .getByLabel("Change reason for " + customSlug, { exact: true })
      .fill("Synthetic managed rename redirect acceptance check.");
    await publisher
      .getByRole("button", { name: "Rename theme " + customSlug, exact: true })
      .click();
    await expect(
      publisher.getByRole("button", {
        name: "Save theme " + renamedSlug,
        exact: true,
      }),
    ).toBeVisible();
    const alias = await page.request.get(
      "/themes/" + customSlug + "?mode=group&access=free",
      { maxRedirects: 0 },
    );
    expect(alias.status()).toBe(308);
    expect(alias.headers().location).toContain(
      "/themes/" + renamedSlug + "?mode=group&access=free",
    );
    expect(
      (
        await page.request.get("/api/v1/themes/" + customSlug, {
          maxRedirects: 0,
        })
      ).status(),
    ).toBe(308);
    await publisher
      .getByLabel("Status for " + renamedSlug, { exact: true })
      .selectOption("retired");
    await publisher
      .getByLabel("Change reason for " + renamedSlug, { exact: true })
      .fill("Synthetic empty theme retirement acceptance check.");
    await publisher
      .getByRole("button", { name: "Save theme " + renamedSlug, exact: true })
      .click();
    await expect(
      publisher.getByText("Theme changes saved.", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await page.goto("/themes/" + renamedSlug + "?mode=group&access=free")
      )?.status(),
    ).toBe(410);
    const moodSlug = "browser-mood-" + info.project.name;
    await publisher
      .getByLabel("Taxonomy kind", { exact: true })
      .selectOption("mood");
    await publisher
      .getByLabel("New taxonomy slug", { exact: true })
      .fill(moodSlug);
    await publisher
      .getByLabel("New taxonomy label", { exact: true })
      .fill("Synthetic browser mood");
    await publisher
      .getByLabel("Creation reason", { exact: true })
      .fill("Synthetic mood creation acceptance check.");
    await publisher
      .getByRole("button", { name: "Create taxonomy entry", exact: true })
      .click();
    await expect(
      publisher.getByText(
        "Synthetic browser mood · " + moodSlug + " · revision 1",
        { exact: true },
      ),
    ).toBeAttached();
    await publisher.getByText("Manage moods", { exact: true }).click();
    await publisher
      .getByLabel("Status for mood " + moodSlug, { exact: true })
      .selectOption("retired");
    await publisher
      .getByLabel("Reason for mood " + moodSlug, { exact: true })
      .fill("Synthetic empty mood retirement acceptance check.");
    await publisher
      .getByRole("button", { name: "Save mood " + moodSlug, exact: true })
      .click();
    await expect(
      publisher.getByText(
        "Synthetic browser mood · " + moodSlug + " · revision 2",
        { exact: true },
      ),
    ).toBeVisible();
    await publisher
      .getByRole("button", { name: "Lock workspace", exact: true })
      .click();
    await expect(
      publisher.getByRole("heading", {
        name: "Verify your authenticator",
        exact: true,
      }),
    ).toBeVisible();
    expect((await call(publisher, "/api/v1/admin/templates")).status()).toBe(
      403,
    );
    expect(
      await editor.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
