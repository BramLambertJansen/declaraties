import type { Page, TestInfo } from '@playwright/test';

// UX-screenshots voor de reviewer in Modus UX (spec ontwerp-overnemen, `.claude/agents/reviewer.md`). Per breedte een
// screenshot van de hele pagina als `ux-<naam>-<breedte>.png` in de uitvoermap van de test (in de runner onder
// `.runner-output/test-results/`). Geen baseline-vergelijking; daarna staat de viewport weer zoals hij was.
const BREEDTES = [375, 1280] as const;
const HOOGTE = 900;

export async function uxScreenshot(page: Page, testInfo: TestInfo, naam: string): Promise<string[]> {
  const origineel = page.viewportSize();
  const paden: string[] = [];
  try {
    for (const breedte of BREEDTES) {
      await page.setViewportSize({ width: breedte, height: HOOGTE });
      const pad = testInfo.outputPath(`ux-${naam}-${String(breedte)}.png`);
      await page.screenshot({ path: pad, fullPage: true });
      paden.push(pad);
    }
  } finally {
    if (origineel !== null) await page.setViewportSize(origineel);
  }
  return paden;
}
