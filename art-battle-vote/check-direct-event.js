import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'log') {
        console.log('Console:', msg.text());
      }
    });
    
    await page.setViewport({ width: 375, height: 812 });
    
    // First, load the main page to get event IDs
    console.log('Loading main page to find event IDs...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get event data from the page
    const eventData = await page.evaluate(() => {
      // Look for any event data in the React app
      const events = [];
      
      // Try to find event IDs from the card click handlers or data attributes
      const cards = document.querySelectorAll('.rt-Card');
      cards.forEach(card => {
        const eventName = card.querySelector('.rt-Text[class*="weight-bold"]')?.textContent;
        if (eventName && !eventName.includes('ART BATTLE VOTE')) {
          events.push({
            name: eventName,
            cardText: card.textContent.substring(0, 200)
          });
        }
      });
      
      return events;
    });
    
    console.log('\nFound events:');
    eventData.forEach(e => console.log(`  - ${e.name}`));
    
    // Try to intercept navigation to get event ID
    console.log('\n\nAttempting to capture event navigation...');
    
    let capturedEventId = null;
    
    // Intercept navigation requests
    page.on('framenavigated', (frame) => {
      const url = frame.url();
      if (url.includes('/event/')) {
        const match = url.match(/\/event\/([a-f0-9-]+)/);
        if (match) {
          capturedEventId = match[1];
          console.log('Captured event ID from navigation:', capturedEventId);
        }
      }
    });
    
    // Try clicking with better error handling
    const clickResult = await page.evaluate(() => {
      try {
        // More robust card selection
        const allCards = Array.from(document.querySelectorAll('.rt-Card'));
        
        // Filter to get actual event cards (not the header)
        const eventCards = allCards.filter(card => {
          const text = card.textContent;
          return !text.includes('ART BATTLE VOTE') && 
                 (text.includes('AB') || text.includes('Event'));
        });
        
        if (eventCards.length === 0) {
          return { error: 'No event cards found' };
        }
        
        // Click the first event card
        const firstCard = eventCards[0];
        const cardInfo = {
          text: firstCard.textContent.substring(0, 100),
          hasClickHandler: firstCard.onclick !== null,
          style: firstCard.getAttribute('style')
        };
        
        // Try to click the card
        firstCard.click();
        
        // Also try dispatching a click event
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        firstCard.dispatchEvent(clickEvent);
        
        return { success: true, cardInfo };
      } catch (err) {
        return { error: err.message };
      }
    });
    
    console.log('\nClick result:', clickResult);
    
    // Wait to see if card expands
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if card expanded by looking for new content
    const expandedState = await page.evaluate(() => {
      const hasEventId = document.body.textContent.includes('Event ID:');
      const hasSeparator = document.querySelector('.rt-Separator') !== null;
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent,
        width: b.offsetWidth
      }));
      
      return { hasEventId, hasSeparator, buttons };
    });
    
    console.log('\nExpanded state:', expandedState);
    
    // If we have buttons, try to click Enter Event
    if (expandedState.buttons.length > 0) {
      const navResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const targetButton = buttons.find(b => 
          b.textContent.includes('Enter') || 
          b.textContent.includes('Open') ||
          b.textContent.includes('→')
        );
        
        if (targetButton) {
          targetButton.click();
          return { clicked: true, text: targetButton.textContent };
        }
        return { clicked: false };
      });
      
      console.log('Navigation attempt:', navResult);
      
      if (navResult.clicked) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Check final URL
    const finalUrl = page.url();
    console.log('\nFinal URL:', finalUrl);
    
    if (finalUrl.includes('/event/')) {
      console.log('✓ Successfully navigated to event page!');
      
      // Now check the event details
      const eventPageData = await page.evaluate(() => {
        return {
          hasArtCards: document.querySelectorAll('.rt-Card').length > 0,
          hasTabs: document.querySelector('.rt-TabsList') !== null,
          artworkCount: document.querySelectorAll('.rt-Card').length - 1, // minus the info card
          hasImages: document.querySelectorAll('img').length > 0
        };
      });
      
      console.log('\nEvent page data:', eventPageData);
    }
    
    // If we captured an event ID, try direct navigation
    if (!finalUrl.includes('/event/') && capturedEventId) {
      console.log(`\nTrying direct navigation to event ${capturedEventId}...`);
      await page.goto(`https://artb.tor1.cdn.digitaloceanspaces.com/vote26/event/${capturedEventId}`, {
        waitUntil: 'networkidle2'
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const directNavData = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasContent: document.body.textContent.length > 100,
          artCards: document.querySelectorAll('.rt-Card').length,
          hasTabs: !!document.querySelector('.rt-TabsList')
        };
      });
      
      console.log('\nDirect navigation result:', directNavData);
    }
    
    // Take screenshot
    await page.screenshot({ path: 'direct-event-check.png', fullPage: true });
    console.log('\nScreenshot saved as direct-event-check.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();