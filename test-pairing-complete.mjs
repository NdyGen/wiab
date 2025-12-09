import { chromium } from '@playwright/test';

(async () => {
  console.log('Starting comprehensive WIAB pairing test...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console messages from the browser
  const browserLogs = [];
  page.on('console', msg => {
    const logEntry = `[BROWSER ${msg.type()}] ${msg.text()}`;
    console.log(logEntry);
    browserLogs.push(logEntry);
  });

  // Capture page errors
  page.on('pageerror', error => {
    const errorEntry = `[BROWSER ERROR] ${error.message}`;
    console.error(errorEntry);
    browserLogs.push(errorEntry);
  });

  try {
    // Navigate to WIAB app pair wizard
    console.log('\n=== NAVIGATING TO PAIR WIZARD ===');
    await page.goto('http://localhost:3000/pair/com.ndygen.wiab/wiab-device');
    await page.waitForTimeout(2000);

    // ===================================================================
    // PAGE 1: Select trigger sensors (motion sensors)
    // ===================================================================
    console.log('\n=== PAGE 1: TRIGGER SENSORS (MOTION) ===');
    await page.waitForSelector('#trigger-device-list', { timeout: 10000 });

    // Wait for devices to load
    await page.waitForTimeout(2000);

    const page1Devices = await page.locator('.device-item').count();
    console.log(`Found ${page1Devices} motion sensor devices on page 1`);

    // Select the specific motion sensor: "ka: pir kantoor" (device ID: 3369c834-bcf4-48b6-86c0-72e81156eda3)
    console.log('Looking for motion sensor: "ka: pir kantoor"...');

    // Get all device items and find the one matching our target
    const deviceItems = page.locator('.device-item');
    const deviceCount = await deviceItems.count();
    console.log(`Total device items: ${deviceCount}`);

    let foundMotionSensor = false;
    for (let i = 0; i < deviceCount; i++) {
      const deviceItem = deviceItems.nth(i);
      const deviceName = await deviceItem.locator('.device-name').textContent();
      console.log(`Device ${i}: ${deviceName}`);

      if (deviceName && deviceName.includes('ka: pir kantoor')) {
        console.log(`✓ Found target motion sensor at index ${i}: "${deviceName}"`);
        console.log('Clicking to select...');
        await deviceItem.click();
        await page.waitForTimeout(500);
        foundMotionSensor = true;
        break;
      }
    }

    if (!foundMotionSensor) {
      console.warn('⚠ Could not find "ka: pir kantoor" sensor, selecting first available sensor instead');
      if (deviceCount > 0) {
        await deviceItems.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Take screenshot of page 1
    await page.screenshot({ path: 'page1-trigger-sensors-selected.png', fullPage: true });
    console.log('Screenshot saved: page1-trigger-sensors-selected.png');

    // Click Continue to go to page 2
    console.log('\nClicking Continue to go to page 2...');
    const continueButton = page.getByRole('button', { name: /continue|next/i });
    await continueButton.click();
    await page.waitForTimeout(2000);

    // ===================================================================
    // PAGE 2: Select reset sensors (contact sensors)
    // ===================================================================
    console.log('\n=== PAGE 2: RESET SENSORS (CONTACT) ===');
    await page.waitForSelector('#reset-device-list', { timeout: 10000 });

    // Wait for devices to load
    await page.waitForTimeout(2000);

    const page2Devices = await page.locator('#reset-device-list .device-item').count();
    console.log(`Found ${page2Devices} contact sensor devices on page 2`);

    // Select the specific contact sensor: "ka: deur sensor" (device ID: d9b9f97b-b071-4951-ae44-b9aa90a386e3)
    console.log('Looking for contact sensor: "ka: deur sensor"...');

    const resetDeviceItems = page.locator('#reset-device-list .device-item');
    const resetDeviceCount = await resetDeviceItems.count();
    console.log(`Total reset device items: ${resetDeviceCount}`);

    let foundContactSensor = false;
    for (let i = 0; i < resetDeviceCount; i++) {
      const deviceItem = resetDeviceItems.nth(i);
      const deviceName = await deviceItem.locator('.device-name').textContent();
      console.log(`Device ${i}: ${deviceName}`);

      if (deviceName && deviceName.includes('ka: deur sensor')) {
        console.log(`✓ Found target contact sensor at index ${i}: "${deviceName}"`);
        console.log('Clicking to select...');
        await deviceItem.click();
        await page.waitForTimeout(500);
        foundContactSensor = true;
        break;
      }
    }

    if (!foundContactSensor) {
      console.warn('⚠ Could not find "ka: deur sensor", selecting first available sensor instead');
      if (resetDeviceCount > 0) {
        await resetDeviceItems.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Take screenshot of page 2
    await page.screenshot({ path: 'page2-reset-sensors-selected.png', fullPage: true });
    console.log('Screenshot saved: page2-reset-sensors-selected.png');

    // Click Next/Continue to proceed to device list
    console.log('\nClicking Next to proceed to device list...');
    const nextButton = page.getByRole('button', { name: /continue|next/i });
    await nextButton.click();
    await page.waitForTimeout(2000);

    // ===================================================================
    // PAGE 3: Device list (should show our WIAB device)
    // ===================================================================
    console.log('\n=== PAGE 3: DEVICE LIST ===');

    // Take screenshot of device list page
    await page.screenshot({ path: 'page3-device-list.png', fullPage: true });
    console.log('Screenshot saved: page3-device-list.png');

    // Look for the WIAB device in the list
    const wiabDeviceItems = await page.locator('.homey-form-list-item').count();
    console.log(`Found ${wiabDeviceItems} devices in list`);

    if (wiabDeviceItems > 0) {
      console.log('Clicking on WIAB device to add...');
      await page.locator('.homey-form-list-item').first().click();
      await page.waitForTimeout(2000);

      // ===================================================================
      // PAGE 4: Final confirmation / settings (if any)
      // ===================================================================
      console.log('\n=== PAGE 4: FINAL STEPS ===');

      // Take screenshot of final page
      await page.screenshot({ path: 'page4-final.png', fullPage: true });
      console.log('Screenshot saved: page4-final.png');

      // Look for "Add Device" button
      const addButton = page.getByRole('button', { name: /add|finish|done/i });
      if (await addButton.count() > 0) {
        console.log('Clicking Add Device button...');
        await addButton.click();
        await page.waitForTimeout(3000);

        console.log('✓ Device pairing completed!');
      } else {
        console.log('No Add Device button found, pairing may have auto-completed');
      }
    } else {
      console.warn('⚠ No devices found in list - pairing may have failed');
    }

    // ===================================================================
    // SUMMARY
    // ===================================================================
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Page 1 motion sensors found: ${page1Devices}`);
    console.log(`Page 2 contact sensors found: ${page2Devices}`);
    console.log(`Motion sensor selected: ${foundMotionSensor ? 'YES' : 'NO (fallback used)'}`);
    console.log(`Contact sensor selected: ${foundContactSensor ? 'YES' : 'NO (fallback used)'}`);
    console.log(`Total browser console messages captured: ${browserLogs.length}`);

    console.log('\n=== BROWSER CONSOLE LOG SUMMARY ===');
    const debugLogs = browserLogs.filter(log => log.includes('[DEBUG]'));
    console.log(`Total DEBUG messages: ${debugLogs.length}`);

    if (debugLogs.length > 0) {
      console.log('\nDEBUG messages:');
      debugLogs.forEach(log => console.log(log));
    }

    console.log('\n✓ Test completed successfully');
    console.log('\nKeeping browser open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n✗ Test failed with error:', error);
    console.error('Stack trace:', error.stack);

    // Take error screenshot
    try {
      await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
      console.log('Error screenshot saved: error-screenshot.png');
    } catch (screenshotError) {
      console.error('Could not save error screenshot:', screenshotError);
    }
  } finally {
    await browser.close();
    console.log('\nBrowser closed.');
  }
})();
