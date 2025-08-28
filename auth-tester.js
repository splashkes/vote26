const puppeteer = require('puppeteer');

async function testAdminAuth() {
  let browser;
  try {
    console.log('🚀 Starting Admin Auth Test...');
    
    browser = await puppeteer.launch({ 
      headless: false, // Show browser for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    
    const page = await browser.newPage();
    
    // Enable request/response logging
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      if (request.url().includes('auth') || request.url().includes('token')) {
        console.log('🔍 AUTH REQUEST:', request.method(), request.url());
        console.log('📤 Headers:', JSON.stringify(request.headers(), null, 2));
        if (request.postData()) {
          console.log('📤 Body:', request.postData());
        }
      }
      request.continue();
    });
    
    page.on('response', response => {
      if (response.url().includes('auth') || response.url().includes('token')) {
        console.log('📥 AUTH RESPONSE:', response.status(), response.url());
      }
    });
    
    page.on('console', msg => {
      console.log('🖥️ BROWSER:', msg.text());
    });
    
    page.on('pageerror', error => {
      console.error('❌ PAGE ERROR:', error.message);
    });
    
    // Navigate to admin login
    console.log('📍 Navigating to admin login...');
    await page.goto('https://artb.art/admin', { waitUntil: 'networkidle0' });
    
    // Wait for login form
    console.log('⏳ Waiting for login form...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    
    // Test with a known admin user
    const testEmail = 'jenn.illencreative@gmail.com';
    const testPassword = 'testpassword123'; // You'll need to set this
    
    console.log('📝 Filling login form...');
    await page.type('input[type="email"]', testEmail);
    await page.type('input[type="password"]', testPassword);
    
    console.log('🔐 Attempting login...');
    
    // Click login and wait for network activity
    const [response] = await Promise.all([
      page.waitForResponse(response => 
        response.url().includes('auth') && response.request().method() === 'POST'
      ),
      page.click('button[type="submit"]')
    ]);
    
    console.log('📊 Login Response Status:', response.status());
    console.log('📊 Login Response Headers:', await response.headers());
    
    if (response.status() !== 200) {
      const responseBody = await response.text();
      console.log('❌ Login Failed - Response Body:', responseBody);
    }
    
    // Wait a bit to see what happens
    await page.waitForTimeout(5000);
    
    // Check for error messages
    const errorElements = await page.$$eval('[class*="error"], [role="alert"], .error-message', 
      elements => elements.map(el => el.textContent)
    );
    
    if (errorElements.length > 0) {
      console.log('❌ Error Messages Found:', errorElements);
    }
    
    // Check if we're still on login page or redirected
    const currentUrl = page.url();
    console.log('📍 Current URL after login attempt:', currentUrl);
    
    // Check for auth tokens in localStorage
    const authData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const authKeys = keys.filter(key => key.includes('auth') || key.includes('supabase'));
      const result = {};
      authKeys.forEach(key => {
        try {
          result[key] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
          result[key] = localStorage.getItem(key);
        }
      });
      return result;
    });
    
    console.log('🔑 Auth Data in localStorage:', JSON.stringify(authData, null, 2));
    
    console.log('✅ Auth test completed');
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (browser) {
      console.log('🔚 Closing browser...');
      await browser.close();
    }
  }
}

// Additional function to test direct Supabase auth
async function testDirectSupabaseAuth() {
  console.log('🧪 Testing direct Supabase auth...');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('🔐 Testing password auth with jenn.illencreative@gmail.com...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'jenn.illencreative@gmail.com',
      password: 'testpassword123' // You'll need to set this
    });
    
    if (error) {
      console.log('❌ Direct auth failed:', error.message);
      console.log('❌ Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Direct auth succeeded!');
      console.log('👤 User:', data.user?.email);
      console.log('🎟️ Session:', !!data.session);
    }
    
  } catch (error) {
    console.error('💥 Direct auth test failed:', error.message);
  }
}

// Run the tests
async function runAllTests() {
  console.log('🎯 Running comprehensive admin auth tests...\n');
  
  // Test 1: Direct Supabase auth
  await testDirectSupabaseAuth();
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Puppeteer browser test
  await testAdminAuth();
}

runAllTests().catch(console.error);