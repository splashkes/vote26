const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Collect all console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    // Log network responses
    const networkResponses = [];
    page.on('response', response => {
      if (response.url().includes('supabase.co')) {
        networkResponses.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    console.log('Navigating to Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n=== Console Logs ===');
    consoleLogs.forEach(log => {
      console.log(`[${log.type}] ${log.text}`);
      if (log.location?.url) {
        console.log(`  at ${log.location.url}:${log.location.lineNumber}`);
      }
    });

    console.log('\n=== Supabase Network Responses ===');
    networkResponses.forEach(resp => {
      console.log(`${resp.status} ${resp.statusText} - ${resp.url.substring(0, 100)}...`);
    });

    // Try to click on an event
    console.log('\nAttempting to click on an event...');
    
    // Wait for any clickable element
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get all clickable elements
    const clickableElements = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      return elements
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.cursor === 'pointer' && el.offsetParent !== null;
        })
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.substring(0, 50),
          classes: el.className
        }));
    });

    console.log('\nClickable elements found:', clickableElements.length);
    clickableElements.slice(0, 5).forEach(el => {
      console.log(`  ${el.tag}: "${el.text}" (${el.classes})`);
    });

    // Take screenshot
    await page.screenshot({ path: 'console-check.png', fullPage: true });
    console.log('\nScreenshot saved as console-check.png');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();