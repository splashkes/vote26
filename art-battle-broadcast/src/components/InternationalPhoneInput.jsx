import { useState, useEffect, useRef, forwardRef } from 'react';
import { Flex, Text, Badge, Select, TextField } from '@radix-ui/themes';
import { parsePhoneNumber } from 'libphonenumber-js';
import { supabase } from '../lib/supabase';

const InternationalPhoneInput = forwardRef(({ 
  value, 
  onChange, 
  placeholder = "Enter phone number",
  disabled = false,
  onKeyPress,
  autoComplete = "tel",
  ...props 
}, ref) => {
  const [phone, setPhone] = useState(value || '');
  const [validationResult, setValidationResult] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [countryGuess, setCountryGuess] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('CA'); // Start with Canada since user is detected there
  const validationTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const buildPhoneForValidation = (inputValue, countryToUse) => {
    if (!inputValue) return '';

    const cleanedInput = inputValue.replace(/[^\d\s\-\(\)\+]/g, '');
    if (cleanedInput.startsWith('+')) {
      return cleanedInput;
    }

    const selectedCountryData = countryData.find(c => c.code === countryToUse);
    if (!selectedCountryData) {
      return cleanedInput;
    }

    const digitsOnly = cleanedInput.replace(/\D/g, '');
    const countryDialCode = selectedCountryData.dialCode.replace('+', '');

    if (digitsOnly.startsWith(countryDialCode)) {
      return `+${digitsOnly}`;
    }

    return `${selectedCountryData.dialCode}${digitsOnly}`;
  };

  const getBasicPhoneValidation = (inputValue, countryToUse) => {
    const candidate = buildPhoneForValidation(inputValue, countryToUse);
    if (!candidate) {
      return {
        inputValue,
        phone: '',
        nationalFormat: inputValue,
        e164Format: '',
        isValid: false,
      };
    }

    try {
      const parsed = parsePhoneNumber(candidate);
      if (parsed?.isValid()) {
        return {
          inputValue,
          phone: parsed.number,
          nationalFormat: parsed.formatNational(),
          e164Format: parsed.number,
          isValid: true,
        };
      }
    } catch (error) {
      console.log('📱 Basic phone parse failed:', error);
    }

    return {
      inputValue,
      phone: '',
      nationalFormat: inputValue,
      e164Format: '',
      isValid: false,
    };
  };

  // Country data for dropdown
  const countryData = [
    { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
    { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
    { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
    { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
    { code: 'ME', name: 'Montenegro', dialCode: '+382', flag: '🇲🇪' },
    { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
    { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
    { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
    { code: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
    { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
    { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  ];

  // Auto-detect user country based on timezone/IP
  useEffect(() => {
    const detectUserCountry = async () => {
      try {
        // Primary: Timezone-based detection
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezoneCountryMap = {
          'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
          'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Montreal': 'CA',
          'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT',
          'Europe/Madrid': 'ES', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
          'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG',
          'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
          'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX'
        };
        
        let detectedCountry = timezoneCountryMap[timezone] || 'CA'; // Default to Canada as user detected there
        console.log('🌍 Detected country:', detectedCountry, 'from timezone:', timezone);
        
        setCountryGuess(detectedCountry);
        setSelectedCountry(detectedCountry);
      } catch (error) {
        console.log('Country detection failed, using Canada default');
        setSelectedCountry('CA');
      }
    };

    detectUserCountry();
  }, []);

  // Enhanced validation using Supabase edge function 
  const callEnhancedValidation = async (phoneNumber, countryCode, basicValidation) => {
    // Must be at least 7 digits before sending to API
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (!phoneNumber || digitsOnly.length < 7) {
      return;
    }

    setValidationLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('phone-validation', {
        body: {
          phoneNumber: phoneNumber,
          countryCode: countryCode
        }
      });

      if (error) {
        console.log('Enhanced validation error:', error);
        setValidationResult({
          valid: basicValidation.isValid,
          phoneNumber: basicValidation.e164Format || phoneNumber,
          nationalFormat: basicValidation.nationalFormat || phone,
          countryCode: countryCode || selectedCountry,
          source: 'basic',
          confidence: 'medium',
          degradedReason: 'edge_function_error'
        });
        return;
      }

      if (data) {
        console.log('📞 Enhanced validation result:', data);
        setValidationResult(data);
        
        // Update country flag based on Twilio's detected country
        if (data.countryCode && data.countryCode !== selectedCountry) {
          console.log('🌍 Updating country from', selectedCountry, 'to', data.countryCode, 'based on Twilio response');
          // Twilio returns 2-letter codes (US, CA), our dropdown uses 2-letter codes too
          const detectedCountry = data.countryCode.toUpperCase();
          if (countryData.find(c => c.code === detectedCountry)) {
            setSelectedCountry(detectedCountry);
          }
        }
        
        // Update display with Twilio's formatted version
        if (data.nationalFormat && data.valid) {
          // console.log('📱 Updating display from', phone, 'to', data.nationalFormat); // REMOVED: Too verbose
          setPhone(data.nationalFormat);
        }
        
        // Update parent component with enhanced validation
        if (onChange) {
          onChange({
            target: { value: data.nationalFormat || phone },
            phone: data.phoneNumber || phone, // Use Twilio's E.164 format for backend
            country: data.countryCode || selectedCountry, // Use Twilio's detected country
            inputValue: phone,
            isValid: data.valid,
            nationalFormat: data.nationalFormat || phone,
            e164Format: data.phoneNumber, // This is what gets sent to OTP verification
            validationResult: data
          });
        }
      }
    } catch (error) {
      console.log('Enhanced validation failed:', error);
      setValidationResult({
        valid: basicValidation.isValid,
        phoneNumber: basicValidation.e164Format || phoneNumber,
        nationalFormat: basicValidation.nationalFormat || phone,
        countryCode: countryCode || selectedCountry,
        source: 'basic',
        confidence: 'medium',
        degradedReason: 'invoke_exception'
      });
    } finally {
      setValidationLoading(false);
    }
  };


  // Handle phone input changes - LET TWILIO DO THE WORK
  const handlePhoneInput = (inputValue, overrideCountry = null) => {
    // console.log('📱 Phone input:', inputValue); // REMOVED: Too verbose for debugging
    
    // Clean input but keep basic formatting chars
    const cleanedInput = inputValue.replace(/[^\d\s\-\(\)\+]/g, '');
    setPhone(cleanedInput); // Show what user typed until Twilio formats it
    const countryToUse = overrideCountry || selectedCountry;
    const basicValidation = getBasicPhoneValidation(cleanedInput, countryToUse);
    
    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    // Only validate if we have at least 7 digits
    const digitsOnly = cleanedInput.replace(/\D/g, '');
    if (digitsOnly.length >= 7) {
      validationTimeoutRef.current = setTimeout(() => {
        let phoneForTwilio;
        // console.log('📱 Using country for validation:', countryToUse, 'override:', overrideCountry, 'selected:', selectedCountry); // REMOVED: Too verbose
        
        if (cleanedInput.startsWith('+')) {
          // User entered +, send raw and ignore country dropdown
          phoneForTwilio = cleanedInput;
          // console.log('📱 User entered +, sending RAW to Twilio:', phoneForTwilio); // REMOVED: Too verbose
        } else {
          // No +, use country dropdown with smart duplicate detection
          const selectedCountryData = countryData.find(c => c.code === countryToUse);
          if (selectedCountryData) {
            const countryDialCode = selectedCountryData.dialCode.replace('+', ''); // Remove + for comparison
            
            if (cleanedInput.startsWith(countryDialCode)) {
              // Number already starts with country code, just add +
              phoneForTwilio = '+' + cleanedInput;
              // console.log('📱 Duplicate detected, adding + to:', cleanedInput, '→', phoneForTwilio); // REMOVED: Too verbose
            } else {
              // Add country dial code
              phoneForTwilio = selectedCountryData.dialCode + cleanedInput;
              // console.log('📱 Adding country code', selectedCountryData.dialCode, 'to:', cleanedInput, '→', phoneForTwilio); // REMOVED: Too verbose
            }
          } else {
            // No country selected, send raw
            phoneForTwilio = cleanedInput;
            // console.log('📱 No country selected, sending RAW:', phoneForTwilio); // REMOVED: Too verbose
          }
        }
        
        callEnhancedValidation(phoneForTwilio, null, basicValidation);
      }, 1000); // 1 second debounce
    }
    
    // Immediately notify parent with basic info (enhanced validation will update later)
    if (onChange) {
      onChange({
        target: { value: cleanedInput },
        phone: basicValidation.phone,
        country: countryToUse,
        inputValue: cleanedInput,
        isValid: basicValidation.isValid,
        nationalFormat: basicValidation.nationalFormat,
        e164Format: basicValidation.e164Format,
        validationResult: basicValidation.isValid ? {
          valid: true,
          phoneNumber: basicValidation.e164Format,
          nationalFormat: basicValidation.nationalFormat,
          source: 'basic',
          confidence: 'medium'
        } : null
      });
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Ensure input gets focus, not the flag dropdown
  useEffect(() => {
    const focusInput = () => {
      try {
        // Multiple strategies to find and focus the input
        let inputElement = null;
        
        // Strategy 1: Use the container class
        const phoneContainer = document.querySelector('.phone-input-container');
        if (phoneContainer) {
          inputElement = phoneContainer.querySelector('input[type="tel"]');
        }
        
        // Strategy 2: Find any tel input if container approach fails
        if (!inputElement) {
          const telInputs = document.querySelectorAll('input[type="tel"]');
          if (telInputs.length > 0) {
            inputElement = telInputs[telInputs.length - 1]; // Get the last one (likely our component)
          }
        }
        
        // Strategy 3: Use our ref if available
        if (!inputElement && inputRef.current) {
          try {
            const inputFromRef = inputRef.current.querySelector?.('input[type="tel"]');
            if (inputFromRef) {
              inputElement = inputFromRef;
            }
          } catch (refError) {
            // Ref approach failed, continue with other methods
          }
        }
        
        // Focus the input if found
        if (inputElement && inputElement.focus && document.activeElement !== inputElement) {
          inputElement.focus();
        }
      } catch (error) {
        console.log('Focus management error (non-critical):', error);
      }
    };
    
    // Try immediately, then with delays to handle different rendering scenarios
    focusInput();
    setTimeout(focusInput, 100);
    setTimeout(focusInput, 300);
  }, []);

  return (
    <Flex direction="column" gap="2">
      {/* Simple Country + Phone Input */}
      <Flex gap="2" align="center" className="phone-input-container">
        <Select.Root 
          value={selectedCountry} 
          onValueChange={(newCountry) => {
            console.log('🌍 Country changed to:', newCountry);
            setSelectedCountry(newCountry);
            // Re-validate current phone with new country
            if (phone) {
              handlePhoneInput(phone, newCountry);
            }
          }}
        >
          <Select.Trigger style={{ minWidth: '120px' }}>
            {countryData.find(c => c.code === selectedCountry)?.flag} {selectedCountry}
          </Select.Trigger>
          <Select.Content>
            {countryData.map((country) => (
              <Select.Item key={country.code} value={country.code}>
                {country.flag} {country.name} {country.dialCode}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>

        <TextField.Root
          ref={(el) => {
            inputRef.current = el;
            if (ref) {
              if (typeof ref === 'function') {
                ref(el);
              } else if (ref && typeof ref === 'object' && 'current' in ref) {
                ref.current = el;
              }
            }
          }}
          value={phone}
          onChange={(e) => handlePhoneInput(e.target.value)}
          onKeyPress={onKeyPress}
          placeholder={placeholder || "Enter phone number"}
          disabled={disabled}
          autoComplete={autoComplete}
          style={{ flex: 1 }}
          size="3"
          type="tel"
          inputMode="numeric"
          {...props}
        />
      </Flex>

      {/* Validation Status */}
      {validationLoading && (
        <Flex align="center" gap="1">
          <Text size="1" color="gray">🔄 Validating phone number...</Text>
        </Flex>
      )}
      
      {validationResult && !validationLoading && (
        <Flex align="center" gap="2" wrap="wrap">
          <Badge 
            size="1" 
            color={validationResult.valid ? "green" : "red"}
          >
            {validationResult.valid ? "✓ Valid" : "✗ Invalid"}
          </Badge>
          
          {validationResult.valid && (
            <Flex gap="1" align="center" wrap="wrap">
              {validationResult.lineType && (
                <Badge size="1" color="blue" variant="soft">
                  {validationResult.lineType === 'mobile' ? '📱 Mobile' : 
                   validationResult.lineType === 'landline' ? '☎️ Landline' :
                   validationResult.lineType === 'voip' ? '💻 VoIP' :
                   validationResult.lineType}
                </Badge>
              )}
              
              {validationResult.carrierName && (
                <Text size="1" color="gray">
                  {validationResult.carrierName}
                </Text>
              )}
            </Flex>
          )}
          
          {!validationResult.valid && validationResult.error && (
            <Text size="1" color="red">
              {validationResult.error}
            </Text>
          )}
          
          <Text size="1" color="gray">
            {countryGuess && selectedCountry !== countryGuess ? '📍 ' : ''}
            {validationResult.source === 'twilio' ? '🔒 Enhanced verification' : 
             validationResult.source === 'basic' ? '⚡ Basic validation' : ''}
          </Text>
        </Flex>
      )}
      
      {!validationResult && !validationLoading && (
        <Text size="1" color="gray">
          💡 Select country and enter your phone number
        </Text>
      )}
    </Flex>
  );
});

InternationalPhoneInput.displayName = 'InternationalPhoneInput';

export default InternationalPhoneInput;
