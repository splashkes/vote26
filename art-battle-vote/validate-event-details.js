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
      if (msg.type() === 'log' && msg.text().includes('Art data received:')) {
        console.log('Browser:', msg.text());
      }
    });
    
    // Set mobile viewport
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    console.log('✓ App loaded\n');
    
    // Wait for events to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find and click on a recent event
    console.log('Looking for Recent Events...');
    const eventClicked = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      
      if (!recentHeading) {
        console.log('No Recent Events heading found');
        return false;
      }
      
      const section = recentHeading.parentElement;
      const firstCard = section.querySelector('.rt-Card');
      
      if (!firstCard) {
        console.log('No event cards found in Recent Events');
        return false;
      }
      
      // Get event name before clicking
      const eventName = firstCard.querySelector('.rt-Text[class*="weight-bold"]')?.textContent;
      console.log('Found event:', eventName);
      
      // Click the card
      firstCard.click();
      return eventName;
    });
    
    if (!eventClicked) {
      console.log('Failed to click on event');
      await browser.close();
      return;
    }
    
    console.log(`✓ Clicked on event: ${eventClicked}`);
    
    // Wait for card to expand
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Click Enter Event button
    console.log('\nLooking for Enter Event button...');
    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const enterButton = buttons.find(btn => 
        btn.textContent.includes('Enter Event') || 
        btn.textContent.includes('→')
      );
      
      if (!enterButton) {
        console.log('Enter Event button not found');
        console.log('Available buttons:', buttons.map(b => b.textContent));
        return false;
      }
      
      console.log('Found Enter Event button:', enterButton.textContent);
      enterButton.click();
      return true;
    });
    
    if (!buttonClicked) {
      console.log('Failed to click Enter Event button');
      await browser.close();
      return;
    }
    
    console.log('✓ Clicked Enter Event button');
    
    // Wait for navigation to complete
    console.log('\nWaiting for navigation...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
      console.log('Navigation timeout - checking current state anyway');
    });
    
    // Additional wait for React to render
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const currentUrl = page.url();
    console.log(`\n✓ Navigated to: ${currentUrl}`);
    
    // Validate we're on the event details page
    const isEventPage = currentUrl.includes('/event/');
    if (!isEventPage) {
      console.log('ERROR: Not on event details page');
      await browser.close();
      return;
    }
    
    // Get comprehensive event details data
    console.log('\n=== EVENT DETAILS VALIDATION ===\n');
    
    const eventDetails = await page.evaluate(() => {
      const details = {
        url: window.location.href,
        eventId: window.location.pathname.split('/').pop()
      };
      
      // Event header info
      const heading = document.querySelector('.rt-Heading[class*="size-5"]');
      details.eventName = heading?.textContent || 'Not found';
      
      // Venue and location
      const venueText = Array.from(document.querySelectorAll('.rt-Text')).find(el => 
        el.textContent.includes('📍 Venue')
      );
      details.venue = venueText?.nextElementSibling?.textContent || 'Not found';
      
      // Event ID
      const eventIdText = Array.from(document.querySelectorAll('.rt-Text')).find(el => 
        el.textContent.includes('🎫 Event ID')
      );
      details.eventEid = eventIdText?.nextElementSibling?.textContent || 'Not found';
      
      // Badges
      details.badges = Array.from(document.querySelectorAll('.rt-Badge')).map(b => b.textContent);
      
      // Tabs
      const tabsList = document.querySelector('.rt-TabsList');
      details.hasTabs = !!tabsList;
      if (tabsList) {
        details.tabs = Array.from(tabsList.querySelectorAll('.rt-TabsTrigger')).map(t => t.textContent);
      }
      
      // Art cards
      const artCards = Array.from(document.querySelectorAll('.rt-Card')).filter(card => {
        // Filter out the event info card
        return !card.textContent.includes('📍 Venue');
      });
      
      details.artworks = artCards.map((card, index) => {
        const artwork = { index };
        
        // Artist name
        const nameEl = card.querySelector('.rt-Text[class*="size-4"][class*="weight-bold"]');
        artwork.artistName = nameEl?.textContent || 'Unknown';
        
        // Art details (code, round, easel)
        const detailsEl = card.querySelector('.rt-Text[class*="color-gray"]');
        artwork.details = detailsEl?.textContent || '';
        
        // Parse details
        if (artwork.details) {
          const parts = artwork.details.split('•').map(p => p.trim());
          artwork.artCode = parts[0] || '';
          artwork.round = parts[1] || '';
          artwork.easel = parts[2] || '';
        }
        
        // Check for images
        const img = card.querySelector('img');
        artwork.hasImage = !!img;
        if (img) {
          artwork.imageSrc = img.src;
          artwork.imageAlt = img.alt;
          artwork.imageVisible = img.offsetParent !== null && img.style.display !== 'none';
        }
        
        // Check for "No image" text
        const noImageText = Array.from(card.querySelectorAll('.rt-Text')).find(t => 
          t.textContent === 'No image'
        );
        artwork.showsNoImage = !!noImageText;
        
        // Vote count
        const voteText = Array.from(card.querySelectorAll('.rt-Text[class*="size-2"]')).find(t => {
          const prev = t.previousElementSibling;
          return prev && prev.querySelector('svg');
        });
        artwork.voteCount = voteText?.textContent || '0';
        
        // Bid amount
        const bidText = Array.from(card.querySelectorAll('.rt-Text')).find(t => 
          t.textContent.startsWith('$')
        );
        artwork.currentBid = bidText?.textContent || null;
        
        return artwork;
      });
      
      details.totalArtworks = details.artworks.length;
      details.artworksWithImages = details.artworks.filter(a => a.hasImage && a.imageVisible).length;
      
      return details;
    });
    
    // Display results
    console.log(`Event: ${eventDetails.eventName}`);
    console.log(`URL: ${eventDetails.url}`);
    console.log(`Event ID: ${eventDetails.eventEid}`);
    console.log(`Venue: ${eventDetails.venue}`);
    console.log(`Badges: ${eventDetails.badges.join(', ') || 'None'}`);
    console.log(`\nTabs: ${eventDetails.hasTabs ? eventDetails.tabs.join(', ') : 'No tabs found'}`);
    console.log(`\nTotal artworks: ${eventDetails.totalArtworks}`);
    console.log(`Artworks with visible images: ${eventDetails.artworksWithImages}`);
    
    if (eventDetails.artworks.length > 0) {
      console.log('\nArtwork details:');
      eventDetails.artworks.slice(0, 5).forEach(art => {
        console.log(`\n  ${art.index + 1}. ${art.artistName}`);
        console.log(`     ${art.details}`);
        console.log(`     Has image: ${art.hasImage ? 'Yes' : 'No'}`);
        if (art.hasImage) {
          console.log(`     Image visible: ${art.imageVisible ? 'Yes' : 'No'}`);
          console.log(`     Image URL: ${art.imageSrc?.substring(0, 60)}...`);
        }
        if (art.showsNoImage) {
          console.log(`     Shows "No image" placeholder`);
        }
        console.log(`     Votes: ${art.voteCount}`);
        if (art.currentBid) {
          console.log(`     Current bid: ${art.currentBid}`);
        }
      });
      
      if (eventDetails.artworks.length > 5) {
        console.log(`\n  ... and ${eventDetails.artworks.length - 5} more artworks`);
      }
    }
    
    // Take a screenshot
    await page.screenshot({ path: 'event-details-validation.png', fullPage: true });
    console.log('\n✓ Screenshot saved as event-details-validation.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();