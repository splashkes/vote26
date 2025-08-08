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
        console.log('Browser log:', msg.text());
      }
    });
    
    // Set mobile viewport
    await page.setViewport({ width: 375, height: 812 });
    
    console.log('Loading Art Battle Vote app...');
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/index.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait and navigate to a recent event
    await page.waitForSelector('.rt-Heading', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Click on first recent event
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('.rt-Heading'));
      const recentHeading = headings.find(h => h.textContent.includes('Recent Events'));
      if (recentHeading) {
        const section = recentHeading.parentElement;
        const firstCard = section.querySelector('.rt-Card');
        if (firstCard) firstCard.click();
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Click Enter Event button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const enterButton = buttons.find(btn => btn.textContent.includes('Enter Event'));
      if (enterButton) enterButton.click();
    });
    
    console.log('Navigating to event details...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get detailed art data
    const artData = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rt-Card'));
      const artworks = [];
      
      cards.forEach((card, index) => {
        // Get all text content
        const texts = Array.from(card.querySelectorAll('.rt-Text')).map(el => ({
          text: el.textContent,
          size: el.className.match(/size-(\d)/)?.[1],
          weight: el.className.includes('weight-bold')
        }));
        
        // Look for images
        const images = Array.from(card.querySelectorAll('img')).map(img => ({
          src: img.src,
          alt: img.alt,
          displayed: img.style.display !== 'none',
          hasError: img.classList.contains('error') || img.naturalWidth === 0
        }));
        
        // Look for image containers
        const imageContainers = Array.from(card.querySelectorAll('[style*="padding-bottom"]')).map(container => ({
          hasImage: container.querySelector('img') !== null,
          backgroundColor: window.getComputedStyle(container).backgroundColor,
          innerHTML: container.innerHTML.substring(0, 200)
        }));
        
        artworks.push({
          index,
          texts,
          images,
          imageContainers,
          fullHTML: card.innerHTML.substring(0, 500)
        });
      });
      
      return artworks;
    });
    
    console.log(`\nFound ${artData.length} artwork cards\n`);
    
    artData.forEach((art, i) => {
      console.log(`Artwork ${i + 1}:`);
      
      // Show artist name
      const artistText = art.texts.find(t => t.weight && t.size === '4');
      if (artistText) {
        console.log(`  Artist: ${artistText.text}`);
      }
      
      // Show art code/round/easel
      const infoText = art.texts.find(t => t.text.includes('•'));
      if (infoText) {
        console.log(`  Info: ${infoText.text}`);
      }
      
      // Image info
      console.log(`  Images: ${art.images.length}`);
      art.images.forEach((img, idx) => {
        console.log(`    - Image ${idx + 1}: ${img.displayed ? 'Displayed' : 'Hidden'}, Error: ${img.hasError}`);
        if (img.src) {
          console.log(`      URL: ${img.src.substring(0, 80)}...`);
        }
      });
      
      // Container info
      console.log(`  Image containers: ${art.imageContainers.length}`);
      art.imageContainers.forEach((container, idx) => {
        console.log(`    - Container ${idx + 1}: Has image: ${container.hasImage}`);
      });
      
      console.log('');
    });
    
    // Check network requests for images
    console.log('\nChecking for image loading issues...\n');
    
    // Intercept network requests
    const failedRequests = [];
    page.on('requestfailed', request => {
      if (request.resourceType() === 'image') {
        failedRequests.push({
          url: request.url(),
          error: request.failure().errorText
        });
      }
    });
    
    // Try to manually fetch artwork media from the API
    console.log('Checking API data for art media...\n');
    
    const apiData = await page.evaluate(async () => {
      // Get event ID from URL
      const eventId = window.location.pathname.split('/').pop();
      
      // Check if supabase client exists
      if (!window.supabase) {
        return { error: 'Supabase client not found' };
      }
      
      try {
        // Get art for this event
        const { data: artData, error: artError } = await window.supabase
          .from('art')
          .select('id, art_code, round, easel')
          .eq('event_id', eventId)
          .limit(5);
          
        if (artError) return { error: artError.message };
        
        // Get media for these art pieces
        const artIds = artData.map(a => a.id);
        const { data: mediaData, error: mediaError } = await window.supabase
          .from('art_media')
          .select('art_id, media_file_id')
          .in('art_id', artIds);
          
        if (mediaError) return { error: mediaError.message };
        
        // Get media files
        if (mediaData && mediaData.length > 0) {
          const mediaFileIds = mediaData.map(m => m.media_file_id);
          const { data: fileData, error: fileError } = await window.supabase
            .from('media_files')
            .select('id, url, type')
            .in('id', mediaFileIds);
            
          if (fileError) return { error: fileError.message };
          
          return {
            artCount: artData.length,
            mediaCount: mediaData.length,
            fileCount: fileData?.length || 0,
            sampleFiles: fileData?.slice(0, 3) || []
          };
        }
        
        return {
          artCount: artData.length,
          mediaCount: 0,
          message: 'No media data found'
        };
        
      } catch (err) {
        return { error: err.message };
      }
    });
    
    console.log('API Data Check:', apiData);
    
    if (apiData.sampleFiles) {
      console.log('\nSample media files from API:');
      apiData.sampleFiles.forEach((file, i) => {
        console.log(`  ${i + 1}. Type: ${file.type}`);
        console.log(`     URL: ${file.url}`);
      });
    }
    
    // Take screenshot
    await page.screenshot({ path: 'art-data-check.png', fullPage: true });
    console.log('\nScreenshot saved as art-data-check.png');
    
    if (failedRequests.length > 0) {
      console.log('\nFailed image requests:');
      failedRequests.forEach(req => {
        console.log(`  - ${req.url}`);
        console.log(`    Error: ${req.error}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();