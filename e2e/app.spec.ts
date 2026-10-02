import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

/** Every test fails on uncaught exceptions and console errors unless it clears `errors`. */
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const dataset = (slot: 'A' | 'B', page: Page) => page.getByRole('region', { name: `Datensatz ${slot}` });

/** A copy of a bundled dataset under another name, as a user would open it. */
function testFile(kommune: string) {
  const data = JSON.parse(readFileSync('public/data/09177117_2026.json', 'utf8'));
  data.metadata.kommune = kommune;
  data.metadata.ags = '09999001';
  return { name: 'testkommune.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) };
}

test('compares two budgets with key figures', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  await expect(dataset('A', page).getByRole('combobox', { name: 'Kommune' })).toHaveValue('Kirchheim b. München');
  await expect(dataset('B', page).getByRole('combobox', { name: 'Kommune' })).toHaveValue('Wolfratshausen');
  await expect(page.getByRole('cell', { name: '380 %' })).toBeVisible(); // Gewerbesteuer Wolfratshausen
  const table = page.getByRole('table', { name: 'Vergleich Kirchheim b. München 2026 mit Wolfratshausen 2026' });
  await expect(table.getByRole('rowheader', { name: /Personalausgaben/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('links the original documents behind a dataset', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  const a = dataset('A', page);
  await a.getByText(/^Quelldokumente/).click();
  await expect(
    a.getByRole('link', { name: 'Haushaltsplan 2026 mit Haushaltssatzung (aktualisierte Fassung)' }),
  ).toHaveAttribute(
    'href',
    'https://www.kirchheim-heimstetten.de/wp-content/uploads/2026/07/Haushalt-2026-aktualisiert_.pdf',
  );
  await expect(a).toContainText('abgerufen am 01.10.2026');
});

test('finds municipalities by postal code and offers to contribute missing ones', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  const search = dataset('A', page).getByRole('combobox', { name: 'Kommune' });
  await search.fill('85435');
  await expect(page.getByRole('option', { name: /Erding/ })).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/a=09177117_2026/);
  await expect(search).toHaveValue('Erding');

  await search.fill('Gibtsnichtdorf');
  await expect(page.getByText('Deine Kommune ist noch nicht dabei?')).toBeVisible();
});

test('keeps view settings in the URL and switches them by keyboard', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  await page.getByText('€/EW', { exact: true }).click();
  await expect(page).toHaveURL(/werte=je-ew/);
  await page.getByRole('radio', { name: 'VwH' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/haushalt=vmh/);
  await expect(page.getByRole('radio', { name: 'VmH' })).toBeChecked();
});

test('shows a time series with a chart of selectable lines', async ({ page }) => {
  await page.goto('/#modus=zeitreihe&kommune=09184131');
  const chart = page.getByRole('region', { name: 'Diagramm' });
  await expect(chart.getByRole('img')).toBeVisible();
  await expect(chart.getByRole('list', { name: 'Legende' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('checkbox', { name: /^4 Personalausgaben im Diagramm/ }).uncheck();
  await expect(chart.getByRole('list', { name: 'Legende' })).toHaveCount(0);
  await expect(chart.getByRole('heading')).toContainText('Gewerbesteuer');
});

test('exports the visible rows as CSV for Excel', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('haushaltsvergleich_kirchheim-b-muenchen-2026_wolfratshausen-2026.csv');
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv.startsWith('﻿Haushalt;Seite;Gruppierungsziffer;Ebene;Bezeichnung;')).toBe(true);
  expect(csv).toContain('Verwaltungshaushalt;Ausgaben;4;1;Personalausgaben;');
});

test('keeps opened files when the page is reloaded', async ({ page }) => {
  await page.goto('/#a=09184131_2026&b=09173147_2026');
  await page.locator('input[type=file]').setInputFiles(testFile('Testkommune'));
  await expect(page.getByRole('status').filter({ hasText: 'Testkommune 2026 geöffnet' })).toBeVisible();
  const search = dataset('B', page).getByRole('combobox', { name: 'Kommune' });
  await expect(search).toHaveValue('Testkommune');

  await page.reload();
  await expect(search).toHaveValue('Testkommune');
  await expect(dataset('B', page).getByRole('combobox', { name: 'Haushaltsjahr' })).toContainText('hochgeladen');
});

test('rejects invalid files with the reasons', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"metadata": {"kommune": "X"}}'),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('kaputt.json konnte nicht geöffnet werden');
  await expect(alert).toContainText('metadata.ags: Pflichtfeld fehlt');
});

test('clears a load error once the dataset loads after all', async ({ page, errors }) => {
  const file = '**/data/09177117_2026.json';
  await page.route(file, (route) => route.abort());
  await page.goto('/#a=09184131_2026&b=09177117_2026');
  await expect(page.getByRole('alert')).toContainText('09177117_2026.json konnte nicht geladen werden');

  await page.unroute(file);
  const year = dataset('B', page).getByRole('combobox', { name: 'Haushaltsjahr' });
  await year.selectOption({ label: '2025' });
  await year.selectOption({ label: '2026' });
  await expect(dataset('B', page)).toContainText('37.341 EW');
  await expect(page.getByRole('alert')).toHaveCount(0);
  errors.length = 0; // the aborted request is logged as a console error
});

test('fits small screens without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const hash of ['#a=09184131_2026&b=09173147_2026&haushalt=beide', '#modus=zeitreihe&kommune=09184131']) {
    await page.goto(`/${hash}`);
    await expect(page.getByText('Kernzahlen')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('works without a network connection after the first visit', async ({ page, context }) => {
    await page.goto('/#a=09184131_2026&b=09173147_2026');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    // Under control of the service worker, the data requests are cached as well.
    await page.reload();
    await expect(page.getByRole('cell', { name: '380 %' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(dataset('B', page).getByRole('combobox', { name: 'Kommune' })).toHaveValue('Wolfratshausen');
    await expect(page.getByRole('cell', { name: '380 %' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
