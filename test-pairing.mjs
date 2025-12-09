import { chromium } from '@playwright/test';

(async () => {
  console.log('Starting Playwright pairing test...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.text()}`);
  });

  // Navigate to WIAB app pair wizard
  console.log('Navigating to WIAB pair wizard...');
  await page.goto('http://localhost:3000/pair/com.ndygen.wiab/wiab-device');

  // Wait for page to load
  await page.waitForTimeout(2000);

  // Page 1: Motion sensors
  console.log('\\n=== PAGE 1: Motion Sensors ===');
  await page.waitForSelector('#trigger-device-list', { timeout: 10000 });

  const page1Devices = await page.locator('.device-item').count();
  console.log(`Found ${page1Devices} motion sensor devices on page 1`);

  const page1Screenshot = 'page1-motion-sensors.png';
  await page.screenshot({ path: page1Screenshot });
  console.log(`Screenshot saved: ${page1Screenshot}`);

  // Click Continue
  console.log('Clicking Continue to go to page 2...');
  await page.getByRole('button', { name: /continue|next/i }).click();
  await page.waitForTimeout(2000);

  // Page 2: Contact sensors
  console.log('\\n=== PAGE 2: Contact Sensors ===');
  await page.waitForSelector('#reset-device-list', { timeout: 10000 });

  const page2Devices = await page.locator('#reset-device-list .device-item').count();
  console.log(`Found ${page2Devices} contact sensor devices on page 2`);

  // Check if loading indicator is still visible
  const loadingVisible = await page.locator('#reset-loading').isVisible();
  console.log(`Loading indicator visible: ${loadingVisible}`);

  // Check container dimensions
  const container = page.locator('#reset-device-list');
  const boundingBox = await container.boundingBox();
  console.log(`Container dimensions: ${JSON.stringify(boundingBox)}`);

  const page2Screenshot = 'page2-contact-sensors.png';
  await page.screenshot({ path: page2Screenshot, fullPage: true });
  console.log(`Screenshot saved: ${page2Screenshot}`);

  // Verify no duplicate IDs
  console.log('\\n=== Checking for duplicate IDs ===');
  const duplicateCheck = await page.evaluate(() => {
    const ids = {};
    const allElements = document.querySelectorAll('[id]');
    const duplicates = [];

    allElements.forEach(el => {
      const id = el.id;
      if (ids[id]) {
        duplicates.push(id);
      } else {
        ids[id] = true;
      }
    });

    return {
      totalIDs: Object.keys(ids).length,
      duplicates
    };
  });

  console.log(`Total unique IDs: ${duplicateCheck.totalIDs}`);
  if (duplicateCheck.duplicates.length > 0) {
    console.log(`DUPLICATE IDS FOUND: ${duplicateCheck.duplicates.join(', ')}`);
  } else {
    console.log('No duplicate IDs found ✓');
  }

  console.log('\\n=== Test Complete ===');
  console.log(`Motion sensors (page 1): ${page1Devices}`);
  console.log(`Contact sensors (page 2): ${page2Devices}`);
  console.log(`Loading indicator visible: ${loadingVisible}`);

  await browser.close();
})();
