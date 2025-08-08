const puppeteer = require('puppeteer');

async function checkDeployment() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport to mobile size
    await page.setViewport({ width: 375, height: 667 });
    
    // Enable console logging
    page.on('console', msg => {
      console.log(`Browser console [${msg.type()}]:`, msg.text());
    });
    
    // Log network errors
    page.on('pageerror', error => {
      console.error('Page error:', error.message);
    });
    
    // Log failed requests
    page.on('requestfailed', request => {
      console.error('Request failed:', request.url(), '-', request.failure().errorText);
    });
    
    // Log responses
    page.on('response', response => {
      if (!response.ok() && !response.url().includes('favicon')) {
        console.log(`Response ${response.status()}: ${response.url()}`);
      }
    });
    
    console.log('\nNavigating to: https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('\nPage loaded. Waiting for content...');
    await page.waitForTimeout(3000); // Wait for React to render
    
    // Check page title
    const title = await page.title();
    console.log('\nPage title:', title);
    
    // Check if main app div exists
    const appExists = await page.$('.app') !== null;
    console.log('App container exists:', appExists);
    
    // Check for Radix theme
    const radixTheme = await page.$('[data-is-root-theme="true"]') !== null;
    console.log('Radix theme loaded:', radixTheme);
    
    // Get page content
    const bodyContent = await page.evaluate(() => {
      const app = document.querySelector('.app');
      return {
        appInnerHTML: app ? app.innerHTML : 'App div not found',
        appChildrenCount: app ? app.children.length : 0,
        bodyText: document.body.innerText.trim() || 'No text content'
      };
    });
    
    console.log('\nApp content:');
    console.log('- Inner HTML length:', bodyContent.appInnerHTML.length);
    console.log('- Children count:', bodyContent.appChildrenCount);
    console.log('- Body text:', bodyContent.bodyText.substring(0, 200) + (bodyContent.bodyText.length > 200 ? '...' : ''));
    
    // Check for specific elements
    const hasHeader = await page.$('h1, h2, h3') !== null;
    console.log('\nHas header elements:', hasHeader);
    
    // Check for error messages
    const errorElements = await page.$$('.error, [class*="error"]');
    console.log('Error elements found:', errorElements.length);
    
    // Take a screenshot
    await page.screenshot({ path: 'deployment-check.png', fullPage: true });
    console.log('\nScreenshot saved as deployment-check.png');
    
    // Check network activity
    const resources = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map(r => ({
        name: r.name,
        type: r.initiatorType,
        status: r.transferSize === 0 ? 'cached/blocked' : 'loaded',
        duration: Math.round(r.duration)
      }));
    });
    
    console.log('\nLoaded resources:');
    resources.forEach(r => {
      if (r.name.includes('vote26') || r.name.includes('supabase')) {
        console.log(`- ${r.type}: ${r.name.split('/').pop()} (${r.status}, ${r.duration}ms)`);
      }
    });
    
  } catch (error) {
    console.error('Error checking deployment:', error);
  } finally {
    await browser.close();
    console.log('\nCheck complete.');
  }
}

checkDeployment();