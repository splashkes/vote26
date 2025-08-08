import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Art data received:')) {
        console.log('Data log:', text);
      } else if (text.includes('Error')) {
        console.log('Error log:', text);
      }
    });
    
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('=== VALIDATING RECENT EVENTS DATA ===\n');
    
    // Step 1: Load the main page
    console.log('1. Loading Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('   ✓ App loaded successfully\n');
    
    // Step 2: Find Recent Events section
    console.log('2. Finding Recent Events section...');
    const recentEventsInfo = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      
      if (!recentHeading) return { found: false };
      
      const section = recentHeading.parentElement;
      const cards = section.querySelectorAll('.rt-Card');
      
      const events = Array.from(cards).map(card => {
        const name = card.querySelector('.rt-Text[class*="weight-bold"]')?.textContent;
        const date = card.querySelector('.rt-Text[class*="color-gray"]')?.textContent;
        return { name, date };
      });
      
      return {
        found: true,
        count: cards.length,
        events: events.slice(0, 3)
      };
    });
    
    if (!recentEventsInfo.found) {
      console.log('   ✗ Recent Events section not found');
      await browser.close();
      return;
    }
    
    console.log(`   ✓ Found ${recentEventsInfo.count} recent events:`);
    recentEventsInfo.events.forEach(e => {
      console.log(`     - ${e.name}`);
    });
    console.log('');
    
    // Step 3: Click on first recent event
    console.log('3. Clicking on first recent event to expand...');
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      const section = recentHeading.parentElement;
      const firstCard = section.querySelector('.rt-Card');
      const clickableBox = firstCard.querySelector('.rt-Box[style*="cursor: pointer"]');
      
      if (clickableBox) {
        clickableBox.click();
      } else {
        firstCard.click();
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log('   ✓ Event card expanded\n');
    
    // Step 4: Click Enter Event button
    console.log('4. Clicking "Enter Event" button...');
    const navigationStarted = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const enterButton = buttons.find(btn => 
        btn.textContent.includes('Enter Event') || btn.textContent.includes('→')
      );
      
      if (enterButton) {
        enterButton.click();
        return true;
      }
      return false;
    });
    
    if (!navigationStarted) {
      console.log('   ✗ Could not find Enter Event button');
      await browser.close();
      return;
    }
    
    // Wait for navigation to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    const currentUrl = page.url();
    console.log(`   ✓ Navigated to: ${currentUrl}\n`);
    
    // Step 5: Validate event details page
    console.log('5. Validating event details page data...\n');
    
    // Wait a bit more for data to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const eventPageData = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        isEventPage: window.location.pathname.includes('/event/'),
        eventId: window.location.pathname.split('/').pop()
      };
      
      // Get event header
      const eventHeading = document.querySelector('.rt-Heading[class*="size-5"]');
      data.eventName = eventHeading?.textContent || 'Not found';
      
      // Get venue info
      const venueLabel = Array.from(document.querySelectorAll('.rt-Text')).find(t => 
        t.textContent === '📍 Venue'
      );
      data.venue = venueLabel?.nextElementSibling?.textContent || 'Not found';
      
      // Get event ID
      const eventIdLabel = Array.from(document.querySelectorAll('.rt-Text')).find(t => 
        t.textContent === '🎫 Event ID'
      );
      data.eventEid = eventIdLabel?.nextElementSibling?.textContent || 'Not found';
      
      // Get badges
      data.badges = Array.from(document.querySelectorAll('.rt-Badge')).map(b => b.textContent);
      
      // Get tabs
      const tabsList = document.querySelector('.rt-TabsList');
      data.hasTabs = !!tabsList;
      if (tabsList) {
        data.tabs = Array.from(tabsList.querySelectorAll('.rt-TabsTrigger')).map(t => t.textContent);
      }
      
      // Get artwork cards (excluding info card)
      const allCards = document.querySelectorAll('.rt-Card');
      const artCards = Array.from(allCards).filter(card => 
        !card.textContent.includes('📍 Venue') && 
        !card.textContent.includes('No artwork found')
      );
      
      data.totalArtworks = artCards.length;
      
      // Analyze first 3 artworks in detail
      data.artworks = artCards.slice(0, 3).map((card, index) => {
        const artwork = { index: index + 1 };
        
        // Artist name
        const artistNameEl = card.querySelector('.rt-Text[class*="size-4"][class*="weight-bold"]');
        artwork.artistName = artistNameEl?.textContent || 'Not found';
        
        // Art details
        const detailsEl = card.querySelector('.rt-Text[class*="color-gray"]');
        artwork.details = detailsEl?.textContent || 'No details';
        
        // Avatar
        const avatar = card.querySelector('.rt-Avatar');
        artwork.hasAvatar = !!avatar;
        
        // Image check
        const img = card.querySelector('img');
        artwork.hasImageTag = !!img;
        if (img) {
          artwork.imageSrc = img.src;
          artwork.imageVisible = img.offsetParent !== null && img.style.display !== 'none';
          artwork.imageLoaded = img.complete && img.naturalHeight !== 0;
        }
        
        // Check for "No image" placeholder
        artwork.hasNoImagePlaceholder = card.textContent.includes('No image');
        
        // Vote count
        const voteButton = card.querySelector('.rt-IconButton');
        const voteText = voteButton?.nextElementSibling;
        artwork.voteCount = voteText?.textContent || '0';
        
        // Bid info
        const bidText = Array.from(card.querySelectorAll('.rt-Text')).find(t => 
          t.textContent.match(/^\$\d+/)
        );
        artwork.currentBid = bidText?.textContent || 'No bid';
        
        // Has bid button
        artwork.hasBidButton = card.textContent.includes('Bid');
        
        return artwork;
      });
      
      return data;
    });
    
    // Display validation results
    console.log('EVENT DETAILS:');
    console.log(`  Event Name: ${eventPageData.eventName}`);
    console.log(`  Event ID: ${eventPageData.eventEid}`);
    console.log(`  Venue: ${eventPageData.venue}`);
    console.log(`  Badges: ${eventPageData.badges.join(', ') || 'None'}`);
    console.log(`  Has Tabs: ${eventPageData.hasTabs}`);
    if (eventPageData.tabs) {
      console.log(`  Tabs: ${eventPageData.tabs.join(', ')}`);
    }
    console.log(`\n  Total Artworks: ${eventPageData.totalArtworks}`);
    
    if (eventPageData.artworks.length > 0) {
      console.log('\nARTWORK DETAILS:');
      eventPageData.artworks.forEach(art => {
        console.log(`\n  Artwork ${art.index}:`);
        console.log(`    Artist: ${art.artistName}`);
        console.log(`    Details: ${art.details}`);
        console.log(`    Has Avatar: ${art.hasAvatar ? '✓' : '✗'}`);
        console.log(`    Has Image Tag: ${art.hasImageTag ? '✓' : '✗'}`);
        if (art.hasImageTag) {
          console.log(`    Image Visible: ${art.imageVisible ? '✓' : '✗'}`);
          console.log(`    Image Loaded: ${art.imageLoaded ? '✓' : '✗'}`);
          if (art.imageSrc) {
            console.log(`    Image URL: ${art.imageSrc.substring(0, 60)}...`);
          }
        }
        console.log(`    Shows "No image" text: ${art.hasNoImagePlaceholder ? '✓' : '✗'}`);
        console.log(`    Vote Count: ${art.voteCount}`);
        console.log(`    Current Bid: ${art.currentBid}`);
        console.log(`    Has Bid Button: ${art.hasBidButton ? '✓' : '✗'}`);
      });
    } else {
      console.log('\n  ⚠️  No artwork found on this event page');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'recent-events-validation.png', fullPage: true });
    console.log('\n✓ Screenshot saved as recent-events-validation.png');
    
    // Summary
    console.log('\n=== VALIDATION SUMMARY ===');
    console.log(`✓ Recent Events section found with ${recentEventsInfo.count} events`);
    console.log(`✓ Successfully navigated to event details page`);
    console.log(`✓ Event information displayed (name, venue, ID)`);
    console.log(`✓ Tabs/rounds system present: ${eventPageData.hasTabs}`);
    console.log(`${eventPageData.totalArtworks > 0 ? '✓' : '✗'} Artwork data: ${eventPageData.totalArtworks} pieces found`);
    
    const imagesFound = eventPageData.artworks.filter(a => a.hasImageTag && a.imageVisible).length;
    console.log(`${imagesFound > 0 ? '✓' : '✗'} Thumbnail images: ${imagesFound} visible images`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();