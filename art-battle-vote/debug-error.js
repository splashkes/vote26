import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Capture ALL console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        args: msg.args().length
      });
    });
    
    // Capture page errors
    page.on('pageerror', error => {
      console.log('Page Error:', error.message);
    });
    
    // Capture failed requests
    page.on('requestfailed', request => {
      console.log('Request Failed:', request.url().substring(0, 100), '-', request.failure().errorText);
    });
    
    // Capture responses
    page.on('response', response => {
      const url = response.url();
      if (url.includes('supabase') && response.status() !== 200 && response.status() !== 304) {
        console.log(`API Error Response: ${response.status()} - ${url.substring(0, 100)}`);
      }
    });
    
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading app and navigating to event...\n');
    
    // Load main page
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click on recent event
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (recentHeading) {
        const section = recentHeading.parentElement;
        const firstCard = section.querySelector('.rt-Card');
        const clickableBox = firstCard?.querySelector('.rt-Box[style*="cursor: pointer"]');
        if (clickableBox) clickableBox.click();
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Click Enter Event
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const enterButton = buttons.find(btn => btn.textContent.includes('Enter Event'));
      if (enterButton) enterButton.click();
    });
    
    // Wait for navigation and error
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check console logs
    console.log('Console logs captured:');
    consoleLogs.forEach((log, i) => {
      if (log.text.includes('Error') || log.type === 'error') {
        console.log(`  ${i}. [${log.type}] ${log.text}`);
      }
    });
    
    // Try to get the actual error details
    const errorDetails = await page.evaluate(() => {
      // Check if there's any error text in the DOM
      const errorTexts = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.includes('Error') && 
        !el.children.length
      );
      
      return {
        url: window.location.href,
        hasErrors: errorTexts.length > 0,
        errorTexts: errorTexts.map(el => el.textContent).slice(0, 5),
        bodyLength: document.body.textContent.length,
        hasCards: document.querySelectorAll('.rt-Card').length > 0
      };
    });
    
    console.log('\nError details:', errorDetails);
    
    // Try to manually check the supabase query
    const queryTest = await page.evaluate(async () => {
      if (!window.supabase) return { error: 'No supabase client' };
      
      const eventId = window.location.pathname.split('/').pop();
      
      try {
        // Test the exact query from EventDetails
        const { data, error } = await window.supabase
          .from('art')
          .select(`
            *,
            artist_profiles!art_artist_id_fkey (
              id,
              name,
              entry_id,
              bio,
              instagram,
              city_text
            )
          `)
          .eq('event_id', eventId)
          .limit(1);
          
        return {
          success: !error,
          error: error?.message,
          dataLength: data?.length || 0,
          sample: data?.[0] ? {
            art_code: data[0].art_code,
            artist: data[0].artist_profiles?.name
          } : null
        };
      } catch (err) {
        return { error: err.message };
      }
    });
    
    console.log('\nDirect query test:', queryTest);
    
    await page.screenshot({ path: 'error-debug.png', fullPage: true });
    console.log('\nScreenshot saved as error-debug.png');
    
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await browser.close();
  }
})();