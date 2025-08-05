const puppeteer = require('puppeteer');

// Auth token from the user
const authData = {"access_token":"eyJhbGciOiJIUzI1NiIsImtpZCI6IktOUTlNUm5mRGxERWZwUlYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hzcWRrdWJneXF3cHl2Zmx0bnJmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4YzNmODczYi04NDMzLTQ5YTMtYTQ0OC1hYjFiODFhYTYwOWYiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU0MzMzMTI0LCJpYXQiOjE3NTQzMjk1MjQsImVtYWlsIjoiIiwicGhvbmUiOiIxNDE2MzAyNTk1OSIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6InBob25lIiwicHJvdmlkZXJzIjpbInBob25lIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwicGVyc29uX2hhc2giOiJqdXA0aXYyZyIsInBlcnNvbl9pZCI6IjQ3M2ZiOGQ2LTE2N2YtNDEzNC1iMzdjLWU1ZDY1ODI5ZjA0NyIsInBlcnNvbl9uYW1lIjoiU2ltb24gUGxhc2hrZXMiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjhjM2Y4NzNiLTg0MzMtNDlhMy1hNDQ4LWFiMWI4MWFhNjA5ZiJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6Im90cCIsInRpbWVzdGFtcCI6MTc1NDExNzI2NH1dLCJzZXNzaW9uX2lkIjoiZmFhNmU1M2EtOGE0Mi00YmRiLTgzNjYtYmYxNTc2ZDUxNmExIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.uoMcTTtPYmWKss-Rhx2etff2eQhn2Xw0-FL_gcdh6d0","token_type":"bearer","expires_in":3600,"expires_at":1754333124,"refresh_token":"oj774eaw7ga6","user":{"id":"8c3f873b-8433-49a3-a448-ab1b81aa609f","aud":"authenticated","role":"authenticated","email":"","phone":"14163025959","phone_confirmed_at":"2025-08-03T17:38:48.972431Z","confirmation_sent_at":"2025-08-03T17:37:47.722195Z","confirmed_at":"2025-08-03T17:38:48.972431Z","last_sign_in_at":"2025-08-03T17:38:48.987731Z","app_metadata":{"provider":"phone","providers":["phone"]},"user_metadata":{"email_verified":false,"person_hash":"jup4iv2g","person_id":"473fb8d6-167f-4134-b37c-e5d65829f047","person_name":"Simon Plashkes","phone_verified":false,"sub":"8c3f873b-8433-49a3-a448-ab1b81aa609f"},"identities":[{"identity_id":"543bda79-7add-49f8-ba24-9e096d2a65f2","id":"8c3f873b-8433-49a3-a448-ab1b81aa609f","user_id":"8c3f873b-8433-49a3-a448-ab1b81aa609f","identity_data":{"email_verified":false,"phone_verified":false,"sub":"8c3f873b-8433-49a3-a448-ab1b81aa609f"},"provider":"phone","last_sign_in_at":"2025-07-30T16:56:23.303561Z","created_at":"2025-07-30T16:56:23.303616Z","updated_at":"2025-07-30T16:56:23.303616Z"}],"created_at":"2025-07-30T16:56:23.295865Z","updated_at":"2025-08-04T17:45:23.988925Z","is_anonymous":false}};

async function testBidWithAuth() {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    // Navigate to the app
    await page.goto('https://artb.tor1.cdn.digitaloceanspaces.com/vote26/', { waitUntil: 'networkidle2' });
    
    // Set the auth data in localStorage
    await page.evaluate((authData) => {
      localStorage.setItem('artbattle-auth', JSON.stringify(authData));
    }, authData);
    
    // Refresh to apply auth
    await page.reload({ waitUntil: 'networkidle2' });
    
    // Wait for events to load
    await page.waitForSelector('[data-testid="event-card"]', { timeout: 10000 });
    
    // Click on the first event
    const firstEvent = await page.$('[data-testid="event-card"]');
    if (firstEvent) {
      await firstEvent.click();
      console.log('Clicked on first event');
    }
    
    // Wait for event details to load
    await page.waitForSelector('[role="tablist"]', { timeout: 10000 });
    
    // Switch to auction tab
    const auctionTab = await page.$('button[value="auction"]');
    if (auctionTab) {
      await auctionTab.click();
      console.log('Switched to auction tab');
      await page.waitForTimeout(1000);
    }
    
    // Find and click on specific artwork AB3032-1-2
    const artCards = await page.$$('[role="region"] > div > div'); // Art cards
    let bidPlaced = false;
    
    for (const card of artCards) {
      const cardText = await card.$eval('div', el => el.textContent).catch(() => '');
      
      // Look for specific artwork
      if (cardText.includes('AB3032-1-2')) {
        await card.click();
        console.log('Clicked on artwork AB3032-1-2');
        
        // Wait for bid dialog
        await page.waitForSelector('input[type="number"]', { timeout: 5000 });
        
        // Get current bid to determine next bid amount
        const currentBidText = await page.$eval('div', el => el.textContent).catch(() => '');
        const currentBid = parseFloat(currentBidText.match(/\$(\d+)/)?.[1] || '0');
        const nextBid = currentBid > 0 ? currentBid + 10 : 50;
        
        // Enter bid amount
        const bidInput = await page.$('input[type="number"]');
        await bidInput.click({ clickCount: 3 }); // Select all
        await bidInput.type(nextBid.toString());
        console.log(`Entered bid amount: $${nextBid}`);
        
        // Submit bid
        const submitButton = await page.$('button:has-text("Place Bid")');
        if (submitButton) {
          // Capture network response
          const responsePromise = page.waitForResponse(response => 
            response.url().includes('rpc/process_bid_secure') && response.status() === 200
          );
          
          await submitButton.click();
          console.log('Clicked Place Bid button');
          
          // Wait for response
          const response = await responsePromise;
          const responseData = await response.json();
          console.log('Bid response:', responseData);
          
          bidPlaced = true;
          break;
        }
      }
    }
    
    if (!bidPlaced) {
      console.log('No active auctions found to bid on');
    }
    
    // Check for any SMS messages in the queue
    console.log('\nChecking message queue...');
    await page.waitForTimeout(5000); // Wait for any async processes
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  // Keep browser open for inspection
  console.log('\nTest complete. Browser will remain open for inspection.');
}

// Run the test
testBidWithAuth();