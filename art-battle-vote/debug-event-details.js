import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Capture console logs and errors
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Error') || text.includes('error')) {
        console.log('Browser Error:', text);
      } else if (text.includes('Art data received:')) {
        console.log('Browser:', text);
      }
    });
    
    page.on('pageerror', error => {
      console.log('Page error:', error.message);
    });
    
    await page.setViewport({ width: 375, height: 812 });
    
    // Navigate directly to the event page we found
    const eventUrl = 'https://artb.tor1.cdn.digitaloceanspaces.com/vote26/event/649c51b3-2f57-4df1-aa91-c163cb82beff';
    console.log('Navigating directly to event page...');
    console.log('URL:', eventUrl);
    
    await page.goto(eventUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for React to render
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if we're on the event page
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasReactRoot: !!document.getElementById('root'),
        bodyText: document.body.textContent.substring(0, 200)
      };
    });
    
    console.log('\nPage info:');
    console.log('URL:', pageInfo.url);
    console.log('Title:', pageInfo.title);
    console.log('Has React root:', pageInfo.hasReactRoot);
    console.log('Body preview:', pageInfo.bodyText);
    
    // Wait a bit more for data loading
    console.log('\nWaiting for data to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get detailed component state
    const componentData = await page.evaluate(() => {
      const data = {
        loading: false,
        error: null,
        event: null,
        rounds: [],
        artPieces: [],
        elements: {}
      };
      
      // Check for loading skeletons
      const skeletons = document.querySelectorAll('.rt-Skeleton');
      data.loading = skeletons.length > 0;
      
      // Look for event name in various places
      const headings = document.querySelectorAll('.rt-Heading');
      data.elements.headings = Array.from(headings).map(h => ({
        size: h.className.match(/size-(\d)/)?.[1],
        text: h.textContent
      }));
      
      // Look for error messages
      const errorText = Array.from(document.querySelectorAll('.rt-Text')).find(t => 
        t.textContent.toLowerCase().includes('error') || 
        t.textContent.includes('Error fetching')
      );
      if (errorText) {
        data.error = errorText.textContent;
      }
      
      // Get all cards
      const cards = document.querySelectorAll('.rt-Card');
      data.elements.cardCount = cards.length;
      
      // Check for "No artwork found" message
      const noArtwork = Array.from(document.querySelectorAll('.rt-Text')).find(t => 
        t.textContent.includes('No artwork found')
      );
      data.elements.hasNoArtworkMessage = !!noArtwork;
      
      // Check tabs
      const tabs = document.querySelectorAll('.rt-TabsTrigger');
      data.elements.tabs = Array.from(tabs).map(t => t.textContent);
      
      // Look for specific event details elements
      const venueEl = Array.from(document.querySelectorAll('.rt-Text')).find(t => 
        t.textContent === '📍 Venue'
      );
      if (venueEl) {
        data.event = {
          venue: venueEl.nextElementSibling?.textContent
        };
      }
      
      return data;
    });
    
    console.log('\nComponent data:');
    console.log('Loading:', componentData.loading);
    console.log('Error:', componentData.error);
    console.log('Card count:', componentData.elements.cardCount);
    console.log('Has "No artwork" message:', componentData.elements.hasNoArtworkMessage);
    console.log('Headings:', componentData.elements.headings);
    console.log('Tabs:', componentData.elements.tabs);
    
    // Try to check network requests
    console.log('\nChecking network activity...');
    
    // Reload with request interception
    const requests = [];
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('supabase.co') && !url.includes('.js') && !url.includes('.css')) {
        requests.push({
          url: url,
          method: request.method(),
          resourceType: request.resourceType()
        });
      }
      request.continue();
    });
    
    page.on('response', response => {
      const url = response.url();
      if (url.includes('supabase.co') && url.includes('/rest/')) {
        console.log(`API Response: ${response.status()} - ${url.substring(0, 100)}...`);
      }
    });
    
    // Reload the page to capture requests
    console.log('\nReloading to capture API calls...');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`\nCaptured ${requests.length} Supabase requests`);
    requests.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req.method} ${req.url.substring(0, 80)}...`);
    });
    
    // Check final state
    const finalState = await page.evaluate(() => {
      // Count actual content
      const artCards = Array.from(document.querySelectorAll('.rt-Card')).filter(card => {
        const text = card.textContent;
        return !text.includes('📍 Venue') && !text.includes('No artwork found');
      });
      
      return {
        url: window.location.href,
        artCardCount: artCards.length,
        firstArtCard: artCards[0] ? {
          text: artCards[0].textContent.substring(0, 100),
          hasImage: !!artCards[0].querySelector('img'),
          hasNoImageText: artCards[0].textContent.includes('No image')
        } : null
      };
    });
    
    console.log('\nFinal state:');
    console.log('URL:', finalState.url);
    console.log('Art cards with content:', finalState.artCardCount);
    if (finalState.firstArtCard) {
      console.log('First art card:', finalState.firstArtCard);
    }
    
    // Take screenshot
    await page.screenshot({ path: 'event-details-debug.png', fullPage: true });
    console.log('\n✓ Screenshot saved as event-details-debug.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();