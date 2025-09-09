const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

const execAsync = util.promisify(exec);

// Country code mapping for 10 countries
const countryMapping = {
  '+1': 'US',  // US/Canada - we'll default US for +1
  '+44': 'GB', // UK
  '+61': 'AU', // Australia
  '+49': 'DE', // Germany
  '+33': 'FR', // France
  '+39': 'IT', // Italy
  '+34': 'ES', // Spain
  '+31': 'NL', // Netherlands
  '+81': 'JP'  // Japan
};

// Additional mapping for Canada
const getCountryCode = (phoneNumber, userId) => {
  // Simple heuristic: if +1 and user ID hash is even, make it CA
  if (phoneNumber.startsWith('+1')) {
    const hash = userId ? userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0) : 0;
    return hash % 2 === 0 ? 'CA' : 'US';
  }
  
  for (const [prefix, code] of Object.entries(countryMapping)) {
    if (phoneNumber.startsWith(prefix)) {
      return code;
    }
  }
  return 'XX'; // Unknown country
};

// Function to replace digits 4-6 with 555
const make555Number = (phoneNumber) => {
  // Remove non-digits first to get clean number
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  if (digitsOnly.length < 7) {
    return phoneNumber; // Too short to process
  }
  
  // Replace digits at positions 4, 5, 6 (0-indexed) with 555
  const chars = digitsOnly.split('');
  chars[4] = '5';
  chars[5] = '5'; 
  chars[6] = '5';
  
  // Rebuild with original formatting but new digits
  const newDigits = chars.join('');
  
  // If original had + prefix, maintain it
  if (phoneNumber.startsWith('+')) {
    return '+' + newDigits;
  }
  return newDigits;
};

// Generate 6-digit OTP from last 6 digits
const generateOTP = (phoneNumber) => {
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  if (digitsOnly.length >= 6) {
    return digitsOnly.slice(-6);
  }
  // Pad with zeros if less than 6 digits
  return digitsOnly.padStart(6, '0');
};

async function processPhoneNumbers() {
  try {
    console.log('Fetching phone numbers from database using psql...');
    
    // Use psql to get phone numbers from people table
    const psqlCommand = `PGPASSWORD='6kEtvU9n0KhTVr5' psql -h db.xsqdkubgyqwpyvfltnrf.supabase.co -p 5432 -d postgres -U postgres -t -c "SELECT id, COALESCE(phone_number, auth_phone) as phone FROM people WHERE phone_number IS NOT NULL OR auth_phone IS NOT NULL LIMIT 1000;"`;
    
    const { stdout, stderr } = await execAsync(psqlCommand);
    
    if (stderr && !stderr.includes('WARNING')) {
      throw new Error(`psql error: ${stderr}`);
    }
    
    // Parse the output
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const users = lines.map(line => {
      const parts = line.trim().split('|');
      return {
        id: parts[0]?.trim(),
        phone: parts[1]?.trim()
      };
    }).filter(user => user.phone && user.phone !== '');
    
    console.log(`Found ${users.length} users with phone numbers`);

    const processedData = [];
    const consoleOutput = [];

    // Process each phone number
    for (const user of users) {
      const originalNumber = user.phone;
      const countryCode = getCountryCode(originalNumber, user.id);
      const new555Number = make555Number(originalNumber);
      const otp = generateOTP(new555Number);

      processedData.push({
        originalNumber,
        countryCode,
        new555Number,
        otp
      });

      // For console output format
      consoleOutput.push(`'${new555Number}'=${otp}`);
    }

    // Filter to get representation from our 10 target countries
    const targetCountries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'JP'];
    const countryDistribution = {};
    const finalData = [];

    // Ensure we have data from each target country if possible
    for (const country of targetCountries) {
      const countryData = processedData.filter(item => item.countryCode === country);
      if (countryData.length > 0) {
        // Take up to 50 numbers per country
        finalData.push(...countryData.slice(0, 50));
        countryDistribution[country] = countryData.length;
      }
    }

    // If we don't have enough, fill with remaining data
    if (finalData.length < 500) {
      const remaining = processedData.filter(item => !targetCountries.includes(item.countryCode));
      finalData.push(...remaining.slice(0, 500 - finalData.length));
    }

    console.log('\nCountry distribution:');
    Object.entries(countryDistribution).forEach(([country, count]) => {
      console.log(`${country}: ${count} numbers`);
    });

    // Create CSV content
    const csvHeader = 'Original Number,Country Code,New 555 Number,OTP\n';
    const csvRows = finalData.map(row => 
      `"${row.originalNumber}","${row.countryCode}","${row.new555Number}","${row.otp}"`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;

    // Write CSV file
    const csvFilename = 'phone_data_export.csv';
    fs.writeFileSync(csvFilename, csvContent);
    console.log(`\nCSV file created: ${csvFilename}`);
    console.log(`Total records: ${finalData.length}`);

    // Console output in requested format
    console.log('\nConsole format output:');
    const consoleFormatOutput = finalData.map(row => `${row.new555Number.replace(/[+']/g, '')}=${row.otp}`).join(',');
    console.log(consoleFormatOutput);

    // Also output first 10 for verification
    console.log('\nFirst 10 entries verification:');
    finalData.slice(0, 10).forEach((row, index) => {
      console.log(`${index + 1}. ${row.originalNumber} → ${row.new555Number} (${row.countryCode}) OTP: ${row.otp}`);
    });

  } catch (error) {
    console.error('Error processing phone numbers:', error.message);
    process.exit(1);
  }
}

// Run the script
processPhoneNumbers();