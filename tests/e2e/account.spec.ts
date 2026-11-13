import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("guest verifies email, retains private notes, signs back in and unlocks premium solo and group purchases", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  const email = crypto.randomUUID() + "@example.test";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play a free mystery", exact: true })
    .click();
  await expect(page).toHaveURL(/\/play\//);
  const attemptUrl = page.url();
  await page.getByRole("tab", { name: "My notes" }).click();
  await page
    .getByLabel("Private investigation notes")
    .fill("Account upgrade keeps this evidence note.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved.", { exact: true })).toBeVisible();
  await page.goto("/account");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  const testCode = page.getByText(/Development only · No email sent/);
  await expect(testCode).toBeVisible();
  const code = (await testCode.innerText()).match(/\d{8}/)![0];
  await page.getByLabel("Verification code").fill(code);
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.goto(attemptUrl);
  await page.getByRole("tab", { name: "My notes" }).click();
  await expect(page.getByLabel("Private investigation notes")).toHaveValue(
    "Account upgrade keeps this evidence note.",
  );
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  // A fresh request proves destination email ownership; a separate explicit
  // confirmation is required before the new guest is merged into that account.
  await page.getByLabel("Email address").fill(email);
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await expect(testCode).toBeVisible();
  const again = (await testCode.innerText()).match(/\d{8}/)![0];
  await page.getByLabel("Verification code").fill(again);
  await page
    .getByRole("button", { name: "Verify and continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Combine your progress?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and combine progress", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Email verified", exact: true }),
  ).toBeVisible();
  await page.goto("/shop?success=true");
  await page
    .getByRole("button", { name: "Create demo solo order", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Demo order", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Status: pending/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Simulate successful development payment",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Demo payment recorded", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Development ownership saved for this mode/),
  ).toBeVisible();
  const owned = await page.evaluate(
    async () => (await (await fetch("/api/v1/me/ownership")).json()).data,
  );
  expect(owned).toEqual([
    { productId: "wedding-gift-solo", mode: "solo", state: "active" },
  ]);
  await page.getByRole("button", { name: "Play premium solo case" }).click();
  await expect(
    page.getByText("PREMIUM SOLO INVESTIGATION", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Round 1 of 3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "The wedding mystery in pictures" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/wedding-comic-${info.project.name}.jpg`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Unlock next round" }).click();
  await expect(page.getByText("Round 2 of 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unlock next round" }).click();
  await expect(page.getByText("Round 3 of 3", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Make a call", exact: true }).click();
  await expect(
    page
      .locator(".suspect-choices")
      .getByRole("img", { name: "Illustrated portrait of Dami", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Dami", exact: true }).check();
  await page
    .getByRole("radio", {
      name: "Withheld it in the van to force payment of an invented handling fee.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Submit my verdict", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm my verdict", exact: true })
    .click();
  await page.getByLabel("Nickname on your card").fill("Detective H");
  const card = page.getByRole("img", {
    name: /Spoiler-free result card for Detective H, 100 out of 100/,
  });
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download result card", exact: true }),
  ).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download result card", exact: true })
    .click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe("plotrush-wedding-result.png");
  const png = await readFile((await downloaded.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  await card.screenshot({
    path: `test-results/wedding-result-${info.project.name}.png`,
  });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Purchased cases" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play premium solo case" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Host premium group case" }),
  ).toHaveCount(0);
  await page.goto("/shop");
  await page.getByRole("button", { name: "Create demo group order" }).click();
  await page
    .getByRole("button", { name: "Simulate successful development payment" })
    .click();
  await page.getByRole("link", { name: "Host premium group case" }).click();
  await page.getByLabel("Display name").fill("Premium host");
  await page.getByRole("button", { name: "Create premium room" }).click();
  await expect(
    page.getByRole("heading", { name: "The Missing Wedding Gift" }),
  ).toBeVisible();
  await expect(page.getByText(/Everyone needs to be ready. 4–6/)).toBeVisible();
  const invite = (await page.locator(".invite-code").innerText()).trim();
  const guest = await browser.newContext({
    baseURL,
    extraHTTPHeaders: {
      "X-Forwarded-For": "premium-guest-" + crypto.randomUUID(),
    },
  });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto("/rooms?code=" + invite);
    await guestPage.getByLabel("Display name").fill("Invited guest");
    await guestPage
      .getByRole("button", { name: "Join room", exact: true })
      .click();
    await expect(
      guestPage.getByRole("heading", { name: "The Missing Wedding Gift" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start investigation" }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.locator(".invite-code")).toHaveText(invite);
  } finally {
    await guest.close();
  }
});
