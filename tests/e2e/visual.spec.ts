import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PALETTES } from "../../src/shared/themes";

const TABS = ["Setup", "Devices", "Prompt", "Voices", "Live call", "Monitor", "Demo call", "History"] as const;

async function openTab(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("tab", { name }).click();
}

test.describe("dashboard", () => {
  test("setup heading and credential card render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Mother's Little Helper" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Credential health" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Voices" })).toBeVisible();
  });

  test("create assistant, add device, generate demo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Create assistant|Update assistant/ }).click();
    await expect(page.getByText(/Assistant created|Assistant updated/)).toBeVisible({ timeout: 15_000 });
    await openTab(page, "Devices");
    await page.getByPlaceholder("Device (e.g. Samsung TV)").fill("Samsung TV");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("ready")).toBeVisible({ timeout: 15_000 });
    await openTab(page, "Voices");
    await expect(page.getByRole("heading", { name: "Instant clone from audio" })).toBeVisible();
    await expect(page.getByText("Coco (your clone)")).toBeVisible();
    await openTab(page, "Demo call");
    await page.getByRole("button", { name: "Generate call" }).click();
    await expect(page.getByText("Sample call ready — press Play the call.")).toBeVisible({ timeout: 15_000 });
  });

  test("axe serious+ on every tab", async ({ page }) => {
    await page.goto("/");
    for (const name of TABS) {
      await openTab(page, name);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, `${name}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
    }
  });
});

test.describe("visual", () => {
  test("tabs and themes", async ({ page }) => {
    await page.goto("/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const palette of PALETTES) {
      for (const appearance of ["Light", "Dark"] as const) {
        await page.getByRole("button", { name: appearance, exact: true }).click();
        await page.getByRole("button", { name: palette[0].toUpperCase() + palette.slice(1) }).click();
        for (const name of TABS) {
          await openTab(page, name);
          await expect(page.locator(".page")).toHaveScreenshot(`${palette}-${appearance.toLowerCase()}-${name.replace(/\s+/g, "-")}.png`, {
            animations: "disabled",
            mask: [page.locator("canvas.wave")],
          });
        }
      }
    }
  });
});
