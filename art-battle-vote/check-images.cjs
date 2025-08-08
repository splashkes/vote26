const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });

    // Log network failures
    page.on('requestfailed', request => {
      console.log('Request failed:', request.url(), request.failure().errorText);
    });

    console.log('Navigating to Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for events to load
    await page.waitForSelector('[data-test="event-card"], h3', { timeout: 10000 });
    
    // Click on the first event
    console.log('Clicking on first event...');
    const firstEvent = await page.$('[data-test="event-card"], div[style*="cursor: pointer"]');
    if (firstEvent) {
      await firstEvent.click();
    } else {
      // Try alternative selector
      await page.click('div:has(> h3)');
    }

    // Wait for event details page
    await page.waitForSelector('img', { timeout: 10000 });
    
    // Get all image sources
    const images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => ({
        src: img.src,
        alt: img.alt,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
        style: img.getAttribute('style')
      }));
    });

    console.log('\nFound images:', images.length);
    images.forEach((img, index) => {
      console.log(`\nImage ${index + 1}:`);
      console.log('  Source:', img.src);
      console.log('  Alt:', img.alt);
      console.log('  Loaded:', img.complete);
      console.log('  Dimensions:', img.naturalWidth, 'x', img.naturalHeight);
    });

    // Check network requests for image URLs
    const page2 = await browser.newPage();
    const imageRequests = [];
    
    page2.on('request', request => {
      if (request.resourceType() === 'image') {
        imageRequests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers()
        });
      }
    });

    console.log('\nChecking network requests for images...');
    await page2.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/', {
      waitUntil: 'networkidle2'
    });
    
    // Navigate to event
    await page2.waitForSelector('[data-test="event-card"], div[style*="cursor: pointer"]', { timeout: 10000 });
    const event2 = await page2.$('[data-test="event-card"], div[style*="cursor: pointer"]');
    if (event2) {
      await event2.click();
    } else {
      await page2.click('div:has(> h3)');
    }
    
    await page2.waitForTimeout(3000);
    
    console.log('\nImage requests made:');
    imageRequests.forEach(req => {
      console.log('  -', req.url);
    });

    // Take screenshot
    await page2.screenshot({ path: 'image-check.png', fullPage: true });
    console.log('\nScreenshot saved as image-check.png');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();