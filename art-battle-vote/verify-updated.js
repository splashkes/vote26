import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set mobile viewport
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading page...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for app to render
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    
    // Check dark theme
    const isDarkTheme = await page.evaluate(() => {
      const theme = document.querySelector('.radix-themes');
      return theme && theme.classList.contains('dark');
    });
    console.log('Dark theme applied:', isDarkTheme);
    
    // Get page title
    const title = await page.evaluate(() => {
      const heading = document.querySelector('.rt-Heading');
      return heading ? heading.textContent : null;
    });
    console.log('Page title:', title);
    
    // Check for events
    const eventsCount = await page.evaluate(() => {
      return document.querySelectorAll('.rt-Card').length;
    });
    console.log('Number of events displayed:', eventsCount);
    
    // Get background color
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    console.log('Background color:', bgColor);
    
    // Click on first event if available
    if (eventsCount > 0) {
      console.log('\nClicking on first event...');
      const firstCard = await page.$('.rt-Card');
      if (firstCard) {
        await firstCard.click();
        
        // Wait for expansion
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Click Open Event button
        const openEventButton = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(btn => btn.textContent.includes('Enter Event'));
        });
        
        if (openEventButton && openEventButton.asElement()) {
          await openEventButton.asElement().click();
          console.log('Clicked "Enter Event" button');
          
          // Wait for navigation
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Check if we're on event details page
          const currentUrl = page.url();
          console.log('Current URL:', currentUrl);
          
          // Check for artwork
          const artworkCount = await page.evaluate(() => {
            return document.querySelectorAll('.rt-Card').length;
          });
          console.log('Number of artwork cards:', artworkCount);
          
          // Check for tabs
          const hasTabs = await page.evaluate(() => {
            return document.querySelector('.rt-TabsList') !== null;
          });
          console.log('Has round tabs:', hasTabs);
          
          // Check for images
          const imageCount = await page.evaluate(() => {
            return document.querySelectorAll('img').length;
          });
          console.log('Number of images:', imageCount);
        }
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'updated-app-screenshot.png', fullPage: true });
    console.log('\nScreenshot saved as updated-app-screenshot.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();