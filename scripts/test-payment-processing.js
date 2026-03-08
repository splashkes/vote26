// Test script for the automated payment processing function
const SUPABASE_URL = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-pending-payments`;

async function testPaymentProcessing(dryRun = true, limit = 5) {
  try {
    console.log(`Testing payment processing (dry_run: ${dryRun}, limit: ${limit})...`);

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ANON_KEY_HERE' // Replace with actual anon key if needed
      },
      body: JSON.stringify({
        dry_run: dryRun,
        limit: limit
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.error || 'Unknown error'}`);
    }

    console.log('✅ Payment processing test successful!');
    console.log('📊 Summary:');
    console.log(`   - Processed: ${result.processed_count} payments`);
    console.log(`   - Successful: ${result.successful_count}`);
    console.log(`   - Failed: ${result.failed_count}`);
    console.log(`   - Total Amount: $${result.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`   - Dry Run: ${result.dry_run ? 'YES' : 'NO'}`);

    if (result.payments && result.payments.length > 0) {
      console.log('\n💰 Payment Details:');
      result.payments.forEach((payment, index) => {
        console.log(`   ${index + 1}. ${payment.artist_name}: ${payment.currency} ${payment.amount} - ${payment.status}`);
        if (payment.error) {
          console.log(`      ❌ Error: ${payment.error}`);
        }
        if (payment.stripe_transfer_id) {
          console.log(`      🔗 Stripe ID: ${payment.stripe_transfer_id}`);
        }
      });
    }

    return result;

  } catch (error) {
    console.error('❌ Payment processing test failed:', error.message);
    throw error;
  }
}

// Run dry run test
console.log('🚀 Starting payment processing tests...\n');

testPaymentProcessing(true, 5)
  .then(() => {
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set up cron job to call this function periodically');
    console.log('   2. Test with dry_run: false when ready for live payments');
    console.log('   3. Monitor payment logs and error handling');
  })
  .catch(error => {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  });