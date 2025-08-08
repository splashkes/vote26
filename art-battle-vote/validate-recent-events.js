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
    console.log('✓ App loaded successfully\n');
    
    // Look for Recent Events section
    const recentEventsSection = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      return recentHeading !== null;
    });
    
    if (!recentEventsSection) {
      console.log('No Recent Events section found');
      await browser.close();
      return;
    }
    
    console.log('📅 Found Recent Events section');
    
    // Get all event cards in Recent Events section
    const recentEventCards = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (!recentHeading) return [];
      
      const section = recentHeading.closest('.rt-Box');
      if (!section) return [];
      
      const cards = section.querySelectorAll('.rt-Card');
      return Array.from(cards).map(card => {
        const nameEl = card.querySelector('.rt-Text[class*="rt-r-weight-bold"]');
        return {
          name: nameEl ? nameEl.textContent : 'Unknown',
          index: Array.from(cards).indexOf(card)
        };
      });
    });
    
    console.log(`Found ${recentEventCards.length} recent events\n`);
    
    if (recentEventCards.length === 0) {
      console.log('No recent events to check');
      await browser.close();
      return;
    }
    
    // Check first recent event in detail
    const eventToCheck = recentEventCards[0];
    console.log(`Checking event: "${eventToCheck.name}"\n`);
    
    // Click on the first recent event card
    await page.evaluate((index) => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      const section = recentHeading.closest('.rt-Box');
      const cards = section.querySelectorAll('.rt-Card');
      if (cards[index]) cards[index].click();
    }, eventToCheck.index);
    
    // Wait for expansion
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✓ Event card expanded');
    
    // Click Enter Event button
    const enterEventClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const enterButton = buttons.find(btn => btn.textContent.includes('Enter Event'));
      if (enterButton) {
        enterButton.click();
        return true;
      }
      return false;
    });
    
    if (!enterEventClicked) {
      console.log('Could not find Enter Event button');
      await browser.close();
      return;
    }
    
    console.log('✓ Clicked Enter Event button\n');
    
    // Wait for navigation to event details
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Validate event details page
    console.log('=== EVENT DETAILS VALIDATION ===\n');
    
    // Check URL changed
    const currentUrl = page.url();
    console.log(`URL: ${currentUrl}`);
    console.log(`✓ Navigated to event details: ${currentUrl.includes('/event/')}\n`);
    
    // Get event info
    const eventInfo = await page.evaluate(() => {
      const venueEl = Array.from(document.querySelectorAll('.rt-Text')).find(el => 
        el.textContent.includes('📍 Venue')
      );
      const venue = venueEl ? venueEl.nextElementSibling?.textContent : 'Not found';
      
      const eventIdEl = Array.from(document.querySelectorAll('.rt-Text')).find(el => 
        el.textContent.includes('🎫 Event ID')
      );
      const eventId = eventIdEl ? eventIdEl.nextElementSibling?.textContent : 'Not found';
      
      return { venue, eventId };
    });
    
    console.log('Event Info:');
    console.log(`  Venue: ${eventInfo.venue}`);
    console.log(`  Event ID: ${eventInfo.eventId}\n`);
    
    // Check for rounds tabs
    const roundsData = await page.evaluate(() => {
      const tabsList = document.querySelector('.rt-TabsList');
      if (!tabsList) return { hasRounds: false, rounds: [] };
      
      const tabs = Array.from(tabsList.querySelectorAll('.rt-TabsTrigger'));
      const rounds = tabs
        .filter(tab => tab.textContent.includes('Round'))
        .map(tab => tab.textContent);
      
      return {
        hasRounds: true,
        totalTabs: tabs.length,
        rounds: rounds
      };
    });
    
    console.log('Rounds:');
    console.log(`  ✓ Has rounds tabs: ${roundsData.hasRounds}`);
    console.log(`  Total tabs: ${roundsData.totalTabs}`);
    console.log(`  Rounds: ${roundsData.rounds.join(', ')}\n`);
    
    // Check for artwork
    const artworkData = await page.evaluate(() => {
      const cards = document.querySelectorAll('.rt-Card');
      const artworks = [];
      
      cards.forEach(card => {
        // Look for artist info
        const artistNameEl = card.querySelector('.rt-Text[class*="rt-r-weight-bold"]');
        const artistName = artistNameEl ? artistNameEl.textContent : null;
        
        // Look for art code
        const artCodeEl = card.querySelector('.rt-Text[class*="color-gray"]');
        const artCodeText = artCodeEl ? artCodeEl.textContent : '';
        
        // Look for image
        const img = card.querySelector('img');
        const hasImage = img && img.src && !img.style.display?.includes('none');
        
        // Look for vote count
        const voteEl = Array.from(card.querySelectorAll('.rt-Text')).find(el => {
          const prev = el.previousElementSibling;
          return prev && (prev.querySelector('svg') || prev.textContent.includes('♥'));
        });
        const voteCount = voteEl ? voteEl.textContent : '0';
        
        // Look for bid amount
        const bidEl = Array.from(card.querySelectorAll('.rt-Text')).find(el => 
          el.textContent.includes('$')
        );
        const bidAmount = bidEl ? bidEl.textContent : null;
        
        if (artistName) {
          artworks.push({
            artistName,
            artCode: artCodeText,
            hasImage,
            imageUrl: hasImage ? img.src : null,
            voteCount,
            bidAmount
          });
        }
      });
      
      return artworks;
    });
    
    console.log(`Artwork (${artworkData.length} pieces found):`);
    
    if (artworkData.length > 0) {
      // Show first 3 artworks
      artworkData.slice(0, 3).forEach((art, index) => {
        console.log(`\n  Artwork ${index + 1}:`);
        console.log(`    Artist: ${art.artistName}`);
        console.log(`    Code/Info: ${art.artCode}`);
        console.log(`    Has thumbnail: ${art.hasImage ? '✓ Yes' : '✗ No'}`);
        if (art.hasImage) {
          console.log(`    Image URL: ${art.imageUrl.substring(0, 50)}...`);
        }
        console.log(`    Votes: ${art.voteCount}`);
        if (art.bidAmount) {
          console.log(`    Current bid: ${art.bidAmount}`);
        }
      });
      
      if (artworkData.length > 3) {
        console.log(`\n  ... and ${artworkData.length - 3} more artworks`);
      }
    } else {
      console.log('  No artwork found');
    }
    
    // Check for images specifically
    const imageStats = await page.evaluate(() => {
      const allImages = document.querySelectorAll('img');
      const visibleImages = Array.from(allImages).filter(img => 
        img.src && !img.style.display?.includes('none') && img.offsetParent !== null
      );
      return {
        total: allImages.length,
        visible: visibleImages.length,
        urls: visibleImages.slice(0, 3).map(img => img.src)
      };
    });
    
    console.log(`\nImages:`);
    console.log(`  Total img tags: ${imageStats.total}`);
    console.log(`  Visible images: ${imageStats.visible}`);
    if (imageStats.urls.length > 0) {
      console.log('  Sample URLs:');
      imageStats.urls.forEach(url => {
        console.log(`    - ${url.substring(0, 60)}...`);
      });
    }
    
    // Take screenshot
    await page.screenshot({ path: 'recent-event-details.png', fullPage: true });
    console.log('\n✓ Screenshot saved as recent-event-details.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();