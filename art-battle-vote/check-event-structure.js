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
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the structure of event cards
    const eventStructure = await page.evaluate(() => {
      const sections = {};
      
      // Find each section
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      
      headings.forEach(heading => {
        const text = heading.textContent;
        if (text.includes('Active Events') || text.includes('Recent Events') || text.includes('Upcoming Events')) {
          const section = heading.closest('.rt-Box');
          if (section) {
            const cards = section.querySelectorAll('.rt-Card');
            sections[text] = {
              cardCount: cards.length,
              firstCard: cards[0] ? {
                html: cards[0].outerHTML.substring(0, 500),
                textContent: cards[0].textContent.substring(0, 200),
                hasClickHandler: cards[0].onclick !== null || cards[0].style.cursor === 'pointer'
              } : null
            };
          }
        }
      });
      
      return sections;
    });
    
    console.log('\nEvent sections structure:');
    Object.entries(eventStructure).forEach(([section, data]) => {
      console.log(`\n${section}:`);
      console.log(`  Cards: ${data.cardCount}`);
      if (data.firstCard) {
        console.log(`  Has click handler: ${data.firstCard.hasClickHandler}`);
        console.log(`  Text preview: ${data.firstCard.textContent}`);
      }
    });
    
    // Try to find and click on a recent event using a more specific approach
    console.log('\n\nAttempting to click on first recent event...');
    
    const eventData = await page.evaluate(() => {
      // Find recent events section
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      
      if (!recentHeading) return { found: false };
      
      const section = recentHeading.parentElement;
      const cards = Array.from(section.querySelectorAll('.rt-Card'));
      
      if (cards.length === 0) return { found: false, noCards: true };
      
      const firstCard = cards[0];
      
      // Get the card's content
      const eventName = firstCard.querySelector('.rt-Text[class*="weight-bold"]')?.textContent;
      const venue = firstCard.querySelector('.rt-Text[class*="color-gray"]')?.textContent;
      
      // Look for clickable area
      const clickableElement = firstCard.querySelector('[style*="cursor: pointer"]') || firstCard;
      
      // Get card bounds for clicking
      const rect = clickableElement.getBoundingClientRect();
      
      return {
        found: true,
        eventName,
        venue,
        cardElement: true,
        bounds: {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        }
      };
    });
    
    console.log('Event found:', eventData);
    
    if (eventData.found && eventData.cardElement) {
      // Click using coordinates
      await page.mouse.click(eventData.bounds.x, eventData.bounds.y);
      console.log('Clicked at coordinates:', eventData.bounds);
      
      // Wait for expansion
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if expanded
      const expandedState = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button'));
        const enterEventButton = allButtons.find(btn => 
          btn.textContent.includes('Enter Event') || 
          btn.textContent.includes('→')
        );
        
        const badges = document.querySelectorAll('.rt-Badge');
        const separators = document.querySelectorAll('.rt-Separator');
        
        return {
          hasEnterButton: !!enterEventButton,
          enterButtonText: enterEventButton?.textContent,
          badgeCount: badges.length,
          separatorCount: separators.length,
          visibleText: document.body.textContent.includes('Event ID:')
        };
      });
      
      console.log('\nExpanded state:');
      console.log('Has Enter button:', expandedState.hasEnterButton);
      console.log('Button text:', expandedState.enterButtonText);
      console.log('Badges visible:', expandedState.badgeCount);
      console.log('Separators:', expandedState.separatorCount);
      console.log('Event ID visible:', expandedState.visibleText);
      
      // If we have the enter button, click it
      if (expandedState.hasEnterButton) {
        const navigated = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const enterButton = buttons.find(btn => 
            btn.textContent.includes('Enter Event') || 
            btn.textContent.includes('→')
          );
          if (enterButton) {
            enterButton.click();
            return true;
          }
          return false;
        });
        
        if (navigated) {
          console.log('\nClicked Enter Event button, waiting for navigation...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Check event details page
          const detailsData = await page.evaluate(() => {
            const url = window.location.href;
            const artCards = document.querySelectorAll('.rt-Card').length;
            const hasTabs = !!document.querySelector('.rt-TabsList');
            const images = Array.from(document.querySelectorAll('img')).filter(img => 
              img.src && !img.src.includes('vite.svg')
            );
            
            return {
              url,
              artCardCount: artCards,
              hasTabs,
              imageCount: images.length,
              sampleImages: images.slice(0, 3).map(img => ({
                src: img.src,
                alt: img.alt,
                visible: img.offsetParent !== null
              }))
            };
          });
          
          console.log('\n=== EVENT DETAILS PAGE ===');
          console.log('URL:', detailsData.url);
          console.log('Art cards:', detailsData.artCardCount);
          console.log('Has tabs:', detailsData.hasTabs);
          console.log('Total images:', detailsData.imageCount);
          
          if (detailsData.sampleImages.length > 0) {
            console.log('\nSample images:');
            detailsData.sampleImages.forEach((img, i) => {
              console.log(`  ${i + 1}. ${img.alt || 'No alt'} - Visible: ${img.visible}`);
              console.log(`     URL: ${img.src.substring(0, 60)}...`);
            });
          }
        }
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'event-structure-check.png', fullPage: true });
    console.log('\nScreenshot saved as event-structure-check.png');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();