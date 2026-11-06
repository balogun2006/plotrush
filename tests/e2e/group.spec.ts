import { test, expect, devices } from "@playwright/test";
test("four browsers share only their own clues and reach a durable group reveal", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120000);
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        ...(testInfo.project.name === "mobile"
          ? devices["Pixel 7"]
          : devices["Desktop Chrome"]),
        baseURL,
        extraHTTPHeaders: {
          "X-Forwarded-For": "test-group-" + crypto.randomUUID(),
        },
      }),
    ),
  );
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const host = pages[0];
    await host.goto("/rooms");
    await host.getByLabel("Display name").fill("Host");
    await host.getByRole("button", { name: "Create a free room" }).click();
    await expect(
      host.getByRole("heading", { name: "The detectives" }),
    ).toBeVisible();
    const code = (await host.locator(".invite-code").innerText()).trim();
    for (let i = 1; i < 4; i++) {
      await pages[i].goto("/rooms?code=" + code);
      await pages[i].getByLabel("Display name").fill("Guest " + i);
      await pages[i]
        .getByRole("button", { name: "Join room", exact: true })
        .click();
      await expect(
        pages[i].getByRole("heading", { name: "The detectives" }),
      ).toBeVisible();
    }
    // Polling can deliver the roster asynchronously. Ready in sequence and wait
    // for the host to observe each new ready state before the next command.
    for (const p of pages) {
      await p.getByRole("button", { name: "I'm ready", exact: true }).click();
      await expect(
        p.getByRole("button", { name: "Not ready", exact: true }),
      ).toBeVisible();
    }
    await expect(
      host.getByRole("button", { name: "Start investigation", exact: true }),
    ).toBeEnabled();
    await host
      .getByRole("button", { name: "Start investigation", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Open the evidence", exact: true })
      .click();
    const id = new URL(host.url()).searchParams.get("room")!;
    const bodies = [];
    for (const p of pages) {
      await expect(
        p.getByRole("heading", { name: "Your private evidence" }),
      ).toBeVisible();
      bodies.push(
        await p.evaluate(
          async (id) =>
            (await (await fetch("/api/v1/rooms/" + id)).json()).data,
          id,
        ),
      );
    }
    expect(
      new Set(
        bodies.flatMap((b) => b.privateClues.map((c: { id: string }) => c.id)),
      ).size,
    ).toBe(6);
    expect(
      bodies.every((b) => b.result === null && b.sharedClues.length === 0),
    ).toBe(true);
    const intrusion = await host.evaluate(
      async ({ id, version, clueId }) =>
        (
          await fetch(`/api/v1/rooms/${id}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedVersion: version, clueId }),
          })
        ).status,
      {
        id,
        version: bodies[0].stateVersion,
        clueId: bodies[1].privateClues[0].id,
      },
    );
    expect(intrusion).toBe(404);
    await host
      .getByRole("button", { name: "Share with the group", exact: true })
      .first()
      .click();
    await expect(
      pages[1].getByRole("heading", {
        name: bodies[0].privateClues[0].title,
        exact: true,
      }),
    ).toBeVisible();
    await pages[1].reload();
    await expect(
      pages[1].getByRole("heading", { name: "Your private evidence" }),
    ).toBeVisible();
    for (const p of pages) {
      await p
        .getByRole("button", { name: "Ready to continue", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Keep investigating", exact: true }),
      ).toBeVisible();
    }
    await host
      .getByRole("button", { name: "Open voting", exact: true })
      .click();
    for (const p of pages) {
      await expect(
        p.getByRole("heading", { name: "Your private verdict" }),
      ).toBeVisible();
      await p.getByRole("radio", { name: "Kunle", exact: true }).check();
      await p.getByRole("radio", { name: /A timestamped photo/ }).check();
      await p
        .getByRole("button", { name: "Lock my vote", exact: true })
        .click();
      await expect(
        p.getByText(/Vote locked|You cracked it, together/),
      ).toBeVisible();
    }
    for (const p of pages)
      await expect(
        p.getByRole("heading", { name: "You cracked it, together." }),
      ).toBeVisible();
    await host.reload();
    await expect(
      host.getByRole("heading", { name: "You cracked it, together." }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
