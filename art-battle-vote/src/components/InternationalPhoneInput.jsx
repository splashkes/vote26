import { useState, useEffect, useRef, forwardRef } from 'react';
import { Flex, Text, Badge, Select, TextField } from '@radix-ui/themes';
import { parsePhoneNumber, isPossiblePhoneNumber, getCountries, getCountryCallingCode } from 'libphonenumber-js';
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

  // Country data for dropdown
  const countryData = [
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
    { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
    { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
    { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
    { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
    { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
    { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
    { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
    { code: 'ME', name: 'Montenegro', dialCode: '+382', flag: '🇲🇪' },
    { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', flag: '🇰🇿' },
    { code: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
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
  const callEnhancedValidation = async (phoneNumber, countryCode) => {
    if (!phoneNumber || phoneNumber.length < 8) {
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
        
        // Update parent component with enhanced validation
        if (onChange) {
          onChange({
            target: { value: phone },
            phone: data.phoneNumber || phone,
            country: data.countryCode || selectedCountry, // Use Twilio's detected country
            inputValue: phone,
            isValid: data.valid,
            nationalFormat: data.nationalFormat || phone,
            e164Format: data.phoneNumber,
            validationResult: data
          });
        }
      }
    } catch (error) {
      console.log('Enhanced validation failed:', error);
    } finally {
      setValidationLoading(false);
    }
  };


  // Handle phone input changes - SIMPLE VERSION THAT WORKS
  const handlePhoneInput = (inputValue) => {
    console.log('📱 Phone input:', inputValue);
    
    // Clean input but keep basic formatting chars
    const cleanedInput = inputValue.replace(/[^\d\s\-\(\)\+]/g, '');
    
    let isValid = false;
    let e164Phone = '';
    let nationalFormat = cleanedInput;
    
    if (cleanedInput && cleanedInput.length >= 3) {
      try {
        // Try to parse with selected country context
        const fullNumber = cleanedInput.startsWith('+') ? cleanedInput : cleanedInput;
        
        let phoneToValidate = fullNumber;
        // If no country code, add the selected country's code
        if (!fullNumber.startsWith('+')) {
          const country = countryData.find(c => c.code === selectedCountry);
          phoneToValidate = `${country?.dialCode || '+1'}${cleanedInput}`;
        }
        
        console.log('📱 Validating:', phoneToValidate, 'for country:', selectedCountry);
        
        if (isPossiblePhoneNumber(phoneToValidate)) {
          const parsed = parsePhoneNumber(phoneToValidate);
          if (parsed && parsed.isValid()) {
            isValid = true;
            e164Phone = parsed.format('E.164');
            nationalFormat = parsed.formatNational();
            console.log('✅ Valid phone:', { e164Phone, nationalFormat });
            
            // Update the display with formatted version
            setPhone(nationalFormat);
          } else {
            setPhone(cleanedInput); // Keep as entered if not valid
          }
        } else {
          setPhone(cleanedInput); // Keep as entered if not possible
        }
      } catch (error) {
        console.log('📱 Parse error:', error);
        // Fallback validation for reasonable numbers
        const digitsOnly = cleanedInput.replace(/\D/g, '');
        if (digitsOnly.length >= 10) {
          isValid = true;
          e164Phone = selectedCountry === 'CA' || selectedCountry === 'US' ? `+1${digitsOnly}` : `+${digitsOnly}`;
          nationalFormat = cleanedInput;
        }
        setPhone(cleanedInput); // Update display
      }
    } else {
      setPhone(cleanedInput); // Update display for short input
    }
    
    console.log('📱 Final result:', { isValid, e164Phone, nationalFormat });
    
    // Debounce enhanced validation
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    if (isValid && e164Phone) {
      validationTimeoutRef.current = setTimeout(() => {
        callEnhancedValidation(e164Phone, selectedCountry);
      }, 750);
    }
    
    // Notify parent
    if (onChange) {
      onChange({
        target: { value: nationalFormat },
        phone: e164Phone,
        country: selectedCountry,
        inputValue: nationalFormat,
        isValid: isValid,
        nationalFormat: nationalFormat,
        e164Format: e164Phone,
        validationResult: validationResult
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
        if (!inputElement && intlInputRef.current) {
          try {
            const inputFromRef = intlInputRef.current.querySelector?.('input[type="tel"]');
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
      <Flex gap="2" align="center">
        <Select.Root 
          value={selectedCountry} 
          onValueChange={(newCountry) => {
            console.log('🌍 Country changed to:', newCountry);
            setSelectedCountry(newCountry);
            // Re-validate current phone with new country
            if (phone) {
              handlePhoneInput(phone);
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