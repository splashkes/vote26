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
        const text = msg.text();
        if (!text.includes('JSHandle')) {
          console.log('Browser:', text);
        }
      }
    });
    
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('✓ App loaded\n');
    
    // Find and click on a recent event - click the inner Box, not the Card
    console.log('Looking for Recent Events and clicking...');
    const clickResult = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      
      if (!recentHeading) return { error: 'No Recent Events section' };
      
      const section = recentHeading.parentElement;
      const firstCard = section.querySelector('.rt-Card');
      
      if (!firstCard) return { error: 'No cards in Recent Events' };
      
      // Find the clickable Box inside the card
      const clickableBox = firstCard.querySelector('.rt-Box[style*="cursor: pointer"]');
      const eventName = firstCard.querySelector('.rt-Text[class*="weight-bold"]')?.textContent;
      
      if (clickableBox) {
        console.log('Found clickable box, clicking...');
        clickableBox.click();
        return { success: true, eventName };
      } else {
        // Fallback - click the card itself
        console.log('No clickable box found, clicking card...');
        firstCard.click();
        return { success: true, eventName, fallback: true };
      }
    });
    
    console.log('Click result:', clickResult);
    
    if (!clickResult.success) {
      console.log('Failed to click event');
      await browser.close();
      return;
    }
    
    // Wait for expansion animation
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if card expanded
    const expansionState = await page.evaluate(() => {
      // Look for expansion indicators
      const hasEventId = document.body.textContent.includes('Event ID:');
      const hasSeparator = !!document.querySelector('.rt-Separator');
      
      // Find all buttons and their properties
      const buttons = Array.from(document.querySelectorAll('button')).map(btn => {
        const rect = btn.getBoundingClientRect();
        return {
          text: btn.textContent.trim(),
          visible: rect.width > 0 && rect.height > 0,
          width: rect.width,
          fullWidth: rect.width > 200,
          parent: btn.parentElement?.tagName
        };
      });
      
      // Find the expanded card content
      let expandedContent = null;
      const cards = document.querySelectorAll('.rt-Card');
      for (const card of cards) {
        if (card.textContent.includes('Event ID:') || card.querySelector('.rt-Separator')) {
          expandedContent = {
            found: true,
            hasEventId: card.textContent.includes('Event ID:'),
            hasButton: card.querySelector('button') !== null,
            buttonText: card.querySelector('button')?.textContent
          };
          break;
        }
      }
      
      return {
        hasEventId,
        hasSeparator,
        buttonCount: buttons.length,
        buttons: buttons.filter(b => b.visible),
        expandedContent
      };
    });
    
    console.log('\nExpansion state:');
    console.log('Has Event ID text:', expansionState.hasEventId);
    console.log('Has separator:', expansionState.hasSeparator);
    console.log('Button count:', expansionState.buttonCount);
    console.log('Visible buttons:', expansionState.buttons.length);
    
    if (expansionState.expandedContent?.found) {
      console.log('\n✓ Card expanded successfully!');
      console.log('Button in card:', expansionState.expandedContent.buttonText);
    }
    
    if (expansionState.buttons.length > 0) {
      console.log('\nButtons found:');
      expansionState.buttons.forEach((btn, i) => {
        console.log(`  ${i + 1}. "${btn.text}" (width: ${btn.width}px)`);
      });
      
      // Click the Enter Event button
      console.log('\nClicking Enter Event button...');
      const navResult = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const enterButton = buttons.find(btn => {
          const text = btn.textContent;
          return text.includes('Enter Event') || text.includes('→');
        });
        
        if (enterButton) {
          const rect = enterButton.getBoundingClientRect();
          console.log('Found Enter Event button, clicking at:', rect.x + rect.width/2, rect.y + rect.height/2);
          enterButton.click();
          return { clicked: true, text: enterButton.textContent };
        }
        
        return { clicked: false };
      });
      
      console.log('Navigation result:', navResult);
      
      if (navResult.clicked) {
        // Wait for navigation
        console.log('Waiting for navigation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const newUrl = page.url();
        console.log('\n✓ Navigated to:', newUrl);
        
        if (newUrl.includes('/event/')) {
          // Validate event details page
          const eventData = await page.evaluate(() => {
            const data = {
              url: window.location.href,
              eventName: document.querySelector('.rt-Heading[class*="size-5"]')?.textContent,
              venue: null,
              artworks: [],
              hasTabs: !!document.querySelector('.rt-TabsList')
            };
            
            // Get venue
            const venueText = Array.from(document.querySelectorAll('.rt-Text')).find(el => 
              el.textContent === '📍 Venue'
            );
            data.venue = venueText?.nextElementSibling?.textContent;
            
            // Get artwork cards (excluding the info card)
            const artCards = Array.from(document.querySelectorAll('.rt-Card')).filter(card => 
              !card.textContent.includes('📍 Venue')
            );
            
            data.artworks = artCards.slice(0, 5).map(card => {
              const artistName = card.querySelector('.rt-Text[class*="size-4"][class*="weight-bold"]')?.textContent;
              const details = card.querySelector('.rt-Text[class*="color-gray"]')?.textContent;
              const hasImage = !!card.querySelector('img');
              const showsNoImage = card.textContent.includes('No image');
              
              return {
                artist: artistName || 'Unknown',
                details: details || '',
                hasImage,
                showsNoImage
              };
            });
            
            data.totalArtworks = artCards.length;
            
            // Check for actual image URLs
            const images = document.querySelectorAll('img');
            data.imageUrls = Array.from(images)
              .filter(img => img.src && !img.src.includes('vite.svg'))
              .slice(0, 3)
              .map(img => img.src);
            
            return data;
          });
          
          console.log('\n=== EVENT DETAILS PAGE ===');
          console.log('Event:', eventData.eventName);
          console.log('Venue:', eventData.venue);
          console.log('Has tabs:', eventData.hasTabs);
          console.log('Total artworks:', eventData.totalArtworks);
          console.log('Image URLs found:', eventData.imageUrls.length);
          
          if (eventData.artworks.length > 0) {
            console.log('\nArtwork samples:');
            eventData.artworks.forEach((art, i) => {
              console.log(`  ${i + 1}. ${art.artist}`);
              console.log(`     ${art.details}`);
              console.log(`     Has image: ${art.hasImage}, Shows "No image": ${art.showsNoImage}`);
            });
          }
          
          if (eventData.imageUrls.length > 0) {
            console.log('\nActual image URLs:');
            eventData.imageUrls.forEach((url, i) => {
              console.log(`  ${i + 1}. ${url}`);
            });
          }
        }
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'event-expansion-test.png', fullPage: true });
    console.log('\n✓ Screenshot saved as event-expansion-test.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();