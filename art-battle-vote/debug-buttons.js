import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click on first recent event
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (recentHeading) {
        const section = recentHeading.parentElement;
        const firstCard = section.querySelector('.rt-Card');
        if (firstCard) {
          console.log('Clicking card:', firstCard.textContent.substring(0, 50));
          firstCard.click();
        }
      }
    });
    
    // Wait for potential expansion
    console.log('Waiting for expansion...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Debug what's on the page
    const pageState = await page.evaluate(() => {
      const state = {
        url: window.location.href,
        buttons: [],
        hasEventIdText: document.body.textContent.includes('Event ID:'),
        hasSeparator: !!document.querySelector('.rt-Separator'),
        expandedContent: null
      };
      
      // Get all buttons
      const buttons = document.querySelectorAll('button');
      state.buttons = Array.from(buttons).map(btn => ({
        text: btn.textContent.trim(),
        visible: btn.offsetParent !== null,
        classes: btn.className,
        hasOnClick: !!btn.onclick,
        parentCard: btn.closest('.rt-Card') !== null
      }));
      
      // Look for expanded content within the card
      const cards = document.querySelectorAll('.rt-Card');
      const expandedCard = Array.from(cards).find(card => 
        card.textContent.includes('Event ID:') || 
        card.querySelector('.rt-Separator')
      );
      
      if (expandedCard) {
        state.expandedContent = {
          found: true,
          containsEventId: expandedCard.textContent.includes('Event ID:'),
          containsVenue: expandedCard.textContent.includes('Venue:'),
          buttonCount: expandedCard.querySelectorAll('button').length,
          html: expandedCard.innerHTML.substring(0, 500)
        };
      }
      
      return state;
    });
    
    console.log('\nPage State:');
    console.log('URL:', pageState.url);
    console.log('Has "Event ID:" text:', pageState.hasEventIdText);
    console.log('Has separator:', pageState.hasSeparator);
    console.log('\nButtons found:', pageState.buttons.length);
    pageState.buttons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}" - Visible: ${btn.visible}, In card: ${btn.parentCard}`);
    });
    
    if (pageState.expandedContent?.found) {
      console.log('\nExpanded card found!');
      console.log('Contains Event ID:', pageState.expandedContent.containsEventId);
      console.log('Button count in card:', pageState.expandedContent.buttonCount);
    }
    
    // Try different approach - look for the button more specifically
    console.log('\nTrying to find and click Enter Event button...');
    const clicked = await page.evaluate(() => {
      // First, find the expanded card
      const cards = document.querySelectorAll('.rt-Card');
      for (const card of cards) {
        if (card.textContent.includes('Event ID:')) {
          console.log('Found expanded card');
          
          // Look for button within this card
          const buttons = card.querySelectorAll('button');
          for (const btn of buttons) {
            if (btn.textContent.includes('Enter Event') || 
                btn.textContent.includes('Open Event') ||
                btn.textContent.includes('→')) {
              console.log('Found button:', btn.textContent);
              btn.click();
              return true;
            }
          }
          
          // If no specific text, click any large button
          const largeButton = Array.from(buttons).find(btn => 
            btn.offsetWidth > 200 && btn.textContent.length > 0
          );
          if (largeButton) {
            console.log('Clicking large button:', largeButton.textContent);
            largeButton.click();
            return true;
          }
        }
      }
      return false;
    });
    
    if (clicked) {
      console.log('Button clicked! Waiting for navigation...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const newUrl = page.url();
      console.log('New URL:', newUrl);
      console.log('Navigated to event page:', newUrl.includes('/event/'));
    }
    
    await page.screenshot({ path: 'button-debug.png', fullPage: true });
    console.log('\nScreenshot saved as button-debug.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();