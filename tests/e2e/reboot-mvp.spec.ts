import { expect, test, type Page } from "@playwright/test";

const QUERY = "如何面对困境";
const FIRST_PASSAGE =
  "孟子曰：“舜发於畎亩之中，傅说举於版筑之间，胶鬲举於鱼盐之中，管夷吾举於士，孙叔敖举於海，百里奚举於市。故天将降大任於是人也，必先苦其心志，劳其筋骨，饿其体肤，空乏其身，行拂乱其所为，所以动心忍性，曾益其所不能。人恒过，然后能改。困於心，衡於虑，而后作。征於色，发於声，而后喻。";
const SECOND_PASSAGE =
  "在陈绝粮，从者病，莫能兴。子路愠见曰：“君子亦有穷乎？”子曰：“君子固穷，小人穷斯滥矣。”";

let pageErrors: string[] = [];
let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];

  page.on("pageerror", error => {
    pageErrors.push(error.stack ?? error.message);
  });
  page.on("console", message => {
    if (message.type() !== "error") {
      return;
    }

    const location = message.location();
    const suffix = location.url ? ` (${location.url}:${location.lineNumber})` : "";
    consoleErrors.push(`${message.text()}${suffix}`);
  });
});

test.afterEach(async () => {
  expect.soft(pageErrors, "pageerror events").toEqual([]);
  expect.soft(consoleErrors, "browser console errors").toEqual([]);
});

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth, "document should not overflow horizontally").toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
}

async function continueThroughReadingGate(page: Page) {
  const gate = page.getByRole("region", { name: "入经前停顿" });
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: "继续入经" }).click();
}

async function closeMobileReaderIfVisible(page: Page) {
  const backToResults = page.getByRole("button", { name: "回到回应列表" });

  if (await backToResults.isVisible()) {
    await backToResults.click();
  }
}

async function currentAnnotationText(page: Page) {
  await expect(page.getByRole("button", { name: /进入下一句/u }).first()).toBeVisible();
  const annotationStatus = page.getByRole("status");
  await expect(annotationStatus).toHaveCount(1);

  return (await annotationStatus.getAttribute("aria-label")) ?? "";
}

test("completes the Reboot MVP search, annotation, and exploration path", async ({ page }) => {
  await page.goto("/");

  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page).toHaveTitle("六经注我 - 以此刻一念进入经典");
  await expect(page.getByRole("heading", { level: 1, name: "六经注我" })).toBeVisible();
  const queryInput = page.getByRole("textbox", { name: "输入此刻的一念" });
  await expect(queryInput).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await queryInput.fill(QUERY);
  await page.getByRole("button", { name: "请经典回应" }).click();

  const resultCards = page.getByRole("article");
  await expect(resultCards).toHaveCount(5);
  const firstResult = resultCards.nth(0);
  const secondResult = resultCards.nth(1);
  await expect(firstResult).toContainText("孟子 · 第10章 卷十二 告子下 · 第 20 节");
  await expect(firstResult).toContainText(FIRST_PASSAGE);
  await expect(secondResult).toContainText(SECOND_PASSAGE);
  await expectNoHorizontalOverflow(page);

  await firstResult.getByRole("button", { name: "用这一句回应我" }).click();
  await continueThroughReadingGate(page);

  await expect(page.getByRole("heading", { name: "注我卷轴" })).toBeAttached();
  await expect(page.getByText(FIRST_PASSAGE, { exact: true }).first()).toBeVisible();
  const rootAnnotation = await currentAnnotationText(page);
  expect(rootAnnotation).not.toBe("");
  await expectNoHorizontalOverflow(page);

  await page
    .getByRole("button", { name: /进入下一句/u })
    .first()
    .click();
  const previousLevel = page.getByRole("button", { name: /上一层/u });
  await expect(previousLevel).toBeVisible();
  await expect(page.getByText(/由此进入/u).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await previousLevel.click();
  await expect(page.getByRole("status", { name: rootAnnotation })).toBeAttached();
  await expect(page.getByText(FIRST_PASSAGE, { exact: true }).first()).toBeVisible();

  await closeMobileReaderIfVisible(page);
  await secondResult.getByRole("button", { name: "用这一句回应我" }).click();
  await continueThroughReadingGate(page);

  await expect(page.getByText(SECOND_PASSAGE, { exact: true }).first()).toBeVisible();
  const secondAnnotation = await currentAnnotationText(page);
  expect(secondAnnotation).not.toBe(rootAnnotation);
  await expect(page.getByRole("button", { name: /上一层/u })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await closeMobileReaderIfVisible(page);
  await page.getByRole("button", { name: "回到一念" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "六经注我" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "输入此刻的一念" })).toHaveValue("");
  expect(new URL(page.url()).pathname).toBe("/");
  await expectNoHorizontalOverflow(page);
});
