import { test, expect } from "@playwright/test";
test("guest verifies email, retains private notes, signs back in and completes a demo order", async ({
  page,
}) => {
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
});
