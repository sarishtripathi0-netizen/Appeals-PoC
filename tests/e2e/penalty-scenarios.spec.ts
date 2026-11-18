// Penalty module: Scenario 2 (unpaid to closed) and Scenario 5 (late payment and double recovery), clicked through the UI.
import { expect, test, type Page } from "@playwright/test";

async function start(page: Page, id: number) {
  await page.goto("/demo");
  await page.getByTestId(`start-penalty-${id}`).click();
  await page.waitForURL((u) => u.pathname !== "/demo", { timeout: 150_000 });
  await expect(page.getByText(`Scenario ${id} (`)).toBeVisible();
}

/** Switches user with the scenario's own "Open as …" link on the Demo page. */
async function openAs(page: Page, scenario: number, name: RegExp) {
  await page.goto("/demo");
  await page.getByTestId(`penalty-scenario-${scenario}`).getByRole("button", { name }).first().click();
  await page.waitForLoadState("networkidle");
}

async function goToDate(page: Page, date: string) {
  await page.locator("#jump-date").fill(date);
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await expect(page.getByText(`The date is now ${date}.`)).toBeVisible();
}

test("Scenario 2: unpaid penalty confirmed, deducted from salary, verified, credited and closed", async ({ page }) => {
  await start(page, 2);
  // Sewa Setu DDO confirms it unpaid: a ticket goes to Finance.
  await expect(page).toHaveURL(/\/recovery\?tab=confirm/);
  await page.locator('[data-testid^="confirm-PEN-"]').first().click();
  await expect(page.getByText("Confirmed as not paid.", { exact: false })).toBeVisible();

  // Finance nodal officer records the December deduction.
  await openAs(page, 2, /Open as Arup Kumar Das/);
  await page.locator('a[href^="/finance/tickets/"]').first().click();
  await page.getByLabel("Treasury voucher number").fill("TV/2026/12/0042");
  await page.getByLabel("Proof of deduction").setInputFiles({ name: "salary-deduction-dec-2026.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
  await page.getByTestId("record-deduction").click();
  await expect(page.getByText("Deduction recorded.")).toBeVisible();

  // Sewa Setu DDO checks the proof.
  await openAs(page, 2, /Open as Dipika Choudhury/);
  await page.goto("/recovery?tab=verify");
  await page.getByTestId("verify-deduction").first().click();

  // The treasury credit arrives, then the December statement closes the penalty.
  await goToDate(page, "2026-12-08");
  await page.goto("/recovery?tab=all");
  await expect(page.getByText("Credit to the head of account confirmed").first()).toBeVisible();
  await goToDate(page, "2027-01-01");
  await page.goto("/recovery?tab=statement");
  await expect(page.getByText(/December 2026/).first()).toBeVisible();
  await page.goto("/recovery?tab=all");
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
});

test("Scenario 5: late payments stop recovery; the already-deducted one becomes a refund", async ({ page }) => {
  await start(page, 5);
  // Anjali Baruah pays her Rs. 3,000 by challan (the QR is off after confirmation).
  await expect(page).toHaveURL(/\/penalties/);
  await expect(page.getByTestId("pay-egras")).toHaveCount(0);
  await page.getByRole("link", { name: "eGRAS challan" }).first().click();
  await expect(page.getByTestId("pay-exact")).toHaveCount(0);
  await page.getByTestId("pay-challan").click();

  // Pallab Dutta pays Rs. 2,500, although it was already deducted from his salary.
  await openAs(page, 5, /Open as Pallab Dutta/);
  await expect(page.getByTestId("pay-egras")).toHaveCount(0);
  await page.getByRole("link", { name: "eGRAS challan" }).first().click();
  await page.getByTestId("pay-challan").click();

  await page.getByTestId("clock-plus-1").click();
  await expect(page.getByText(/The date is now 2026-12-04/)).toBeVisible();

  // Finance sees the stop-deduction task and the refund due, and records the refund.
  await openAs(page, 5, /Open as Arup Kumar Das/);
  await expect(page.getByTestId("stop-done").first()).toBeVisible();
  await expect(page.getByText("paid through eGRAS and also deducted")).toBeVisible();
  await page.getByLabel("Refund reference").fill("REF/2026/12/0007");
  await page.getByTestId("record-refund").click();
  await expect(page.getByText("No refunds due.")).toBeVisible();

  // The Commission sees the double recovery in its ledger.
  await openAs(page, 5, /Open as Pallavi Choudhury/);
  await expect(page.getByText("Double recoveries (1)")).toBeVisible();
});
