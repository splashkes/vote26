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
    
    console.log('Loading Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for app to render
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    
    // Scroll to Recent Events section
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (recentHeading) {
        recentHeading.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Click on first recent event
    const clicked = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (!recentHeading) return false;
      
      const section = recentHeading.closest('.rt-Box');
      if (!section) return false;
      
      const firstCard = section.querySelector('.rt-Card');
      if (firstCard) {
        console.log('Found card:', firstCard.textContent.substring(0, 100));
        firstCard.click();
        return true;
      }
      return false;
    });
    
    console.log('Clicked on card:', clicked);
    
    // Wait for expansion
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check what's visible after clicking
    const expandedContent = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const buttonTexts = buttons.map(btn => btn.textContent.trim());
      
      // Look for expanded content
      const allText = document.body.textContent;
      const hasEventId = allText.includes('Event ID:');
      const hasVenue = allText.includes('Venue:') || allText.includes('Auction Enabled');
      
      return {
        buttonCount: buttons.length,
        buttonTexts: buttonTexts,
        hasEventId,
        hasVenue,
        pageText: document.body.textContent.substring(0, 500)
      };
    });
    
    console.log('\nExpanded content check:');
    console.log('Number of buttons:', expandedContent.buttonCount);
    console.log('Button texts:', expandedContent.buttonTexts);
    console.log('Has Event ID:', expandedContent.hasEventId);
    console.log('Has Venue info:', expandedContent.hasVenue);
    
    // Try different button text variations
    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const possibleTexts = ['Enter Event', 'Open Event', 'View Event', 'Details'];
      
      for (const text of possibleTexts) {
        const button = buttons.find(btn => 
          btn.textContent.toLowerCase().includes(text.toLowerCase())
        );
        if (button) {
          console.log('Found button with text:', button.textContent);
          button.click();
          return button.textContent;
        }
      }
      
      // If no specific text found, click any button that's not an icon button
      const nonIconButton = buttons.find(btn => 
        btn.textContent.trim().length > 2 && 
        !btn.querySelector('svg')
      );
      if (nonIconButton) {
        console.log('Clicking non-icon button:', nonIconButton.textContent);
        nonIconButton.click();
        return nonIconButton.textContent;
      }
      
      return null;
    });
    
    console.log('Button clicked:', buttonClicked);
    
    // Take screenshot
    await page.screenshot({ path: 'debug-expansion.png', fullPage: true });
    console.log('\nScreenshot saved as debug-expansion.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();