const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Log console errors and warnings
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[${msg.type()}]`, msg.text());
      }
    });

    console.log('Opening Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/', {
      waitUntil: 'networkidle2'
    });

    // Login first
    console.log('\nClicking on an event (will trigger login)...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click on the first clickable div
    try {
      await page.click('div[style*="cursor: pointer"]');
    } catch (e) {
      console.log('Could not find clickable event');
    }

    // Wait for auth modal or event details
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we're on event details
    const onEventDetails = await page.evaluate(() => {
      return window.location.hash.includes('/event/');
    });

    if (onEventDetails) {
      console.log('\nOn event details page');
      
      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get all images
      const images = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs.map((img, index) => ({
          index,
          src: img.src,
          isPlaceholder: img.src.includes('placeholder'),
          loaded: img.complete && img.naturalHeight > 0,
          dimensions: `${img.naturalWidth}x${img.naturalHeight}`,
          parent: img.parentElement?.tagName
        }));
      });

      console.log(`\nFound ${images.length} images:`);
      images.forEach(img => {
        console.log(`  Image ${img.index + 1}:`);
        console.log(`    Src: ${img.src.substring(0, 80)}...`);
        console.log(`    Is placeholder: ${img.isPlaceholder}`);
        console.log(`    Loaded: ${img.loaded}`);
        console.log(`    Dimensions: ${img.dimensions}`);
      });

      // Check for any art_media data in the page
      const hasMediaData = await page.evaluate(() => {
        const content = document.body.textContent;
        return content.includes('thumbnail_url') || content.includes('compressed_url');
      });
      console.log(`\nPage contains media data references: ${hasMediaData}`);
    } else {
      console.log('\nNot on event details page - may need to handle auth');
      
      // Check current URL
      const currentUrl = await page.url();
      console.log('Current URL:', currentUrl);
      
      // Check page content
      const pageTitle = await page.title();
      console.log('Page title:', pageTitle);
    }

    // Take screenshot
    await page.screenshot({ path: 'image-check-simple.png', fullPage: true });
    console.log('\nScreenshot saved as image-check-simple.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();