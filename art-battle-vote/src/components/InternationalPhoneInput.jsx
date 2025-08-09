import { useState, useEffect, useRef, forwardRef } from 'react';
import { Flex, Text, Badge } from '@radix-ui/themes';
import IntlTelInput from 'intl-tel-input/react';
import { parsePhoneNumber, isPossiblePhoneNumber } from 'libphonenumber-js';
import 'intl-tel-input/build/css/intlTelInput.css';

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
  const [selectedCountry, setSelectedCountry] = useState('us');
  const validationTimeoutRef = useRef(null);
  const intlInputRef = useRef(null);

  // Auto-detect user country based on timezone/IP
  useEffect(() => {
    const detectUserCountry = async () => {
      try {
        // Primary: Timezone-based detection
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timezoneCountryMap = {
          'America/New_York': 'us', 'America/Chicago': 'us', 'America/Denver': 'us', 'America/Los_Angeles': 'us',
          'America/Toronto': 'ca', 'America/Vancouver': 'ca', 'America/Montreal': 'ca',
          'Europe/London': 'gb', 'Europe/Paris': 'fr', 'Europe/Berlin': 'de', 'Europe/Rome': 'it',
          'Europe/Madrid': 'es', 'Europe/Amsterdam': 'nl', 'Europe/Brussels': 'be',
          'Asia/Tokyo': 'jp', 'Asia/Shanghai': 'cn', 'Asia/Hong_Kong': 'hk', 'Asia/Singapore': 'sg',
          'Asia/Seoul': 'kr', 'Asia/Kolkata': 'in', 'Asia/Dubai': 'ae',
          'Australia/Sydney': 'au', 'Australia/Melbourne': 'au', 'Australia/Perth': 'au',
          'America/Sao_Paulo': 'br', 'America/Mexico_City': 'mx', 'America/Buenos_Aires': 'ar',
          'Africa/Cairo': 'eg', 'Africa/Lagos': 'ng', 'Africa/Johannesburg': 'za'
        };
        
        let detectedCountry = timezoneCountryMap[timezone] || 'us';
        
        // Secondary: IP geolocation fallback
        if (!timezoneCountryMap[timezone]) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('https://ipapi.co/json/', { 
              signal: controller.signal,
              headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            
            if (response.ok) {
              const data = await response.json();
              if (data.country_code) {
                detectedCountry = data.country_code.toLowerCase();
              }
            }
          } catch (geoError) {
            console.log('IP geolocation failed, using timezone fallback');
          }
        }
        
        setCountryGuess(detectedCountry);
        setSelectedCountry(detectedCountry);
      } catch (error) {
        console.log('Country detection failed, using US default');
        setSelectedCountry('us');
      }
    };

    detectUserCountry();
  }, []);

  // Debounced validation with Twilio integration
  const validatePhoneNumber = async (phoneNumber, countryCode) => {
    if (!phoneNumber || phoneNumber.length < 8) {
      setValidationResult(null);
      return;
    }

    setValidationLoading(true);
    
    try {
      // Basic validation with libphonenumber-js
      let basicResult = {
        valid: false,
        source: 'basic',
        confidence: 'low'
      };

      if (isPossiblePhoneNumber(phoneNumber)) {
        try {
          const parsed = parsePhoneNumber(phoneNumber);
          basicResult = {
            valid: parsed.isValid(),
            phoneNumber: parsed.format('E.164'),
            nationalFormat: parsed.formatNational(),
            countryCode: parsed.country,
            phoneType: parsed.getType(),
            isMobile: parsed.getType() === 'MOBILE',
            source: 'basic',
            confidence: 'medium'
          };
        } catch (parseError) {
          console.log('Phone parsing failed:', parseError);
        }
      }

      // Try Twilio Lookup API if credentials available
      const twilioAccountSid = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
      const twilioAuthToken = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
      
      if (twilioAccountSid && twilioAuthToken && basicResult.valid) {
        try {
          const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(basicResult.phoneNumber)}`;
          const params = new URLSearchParams({
            Fields: 'line_type_intelligence,validation'
          });
          
          if (countryCode) {
            params.append('CountryCode', countryCode.toUpperCase());
          }

          const response = await fetch(`${url}?${params}`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
              'Accept': 'application/json'
            },
            ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(5000) } : {})
          });

          if (response.ok) {
            const data = await response.json();
            setValidationResult({
              valid: data.validation?.valid || basicResult.valid,
              phoneNumber: data.phone_number || basicResult.phoneNumber,
              nationalFormat: data.national_format || basicResult.nationalFormat,
              countryCode: data.country_code || basicResult.countryCode,
              carrierName: data.carrier?.name,
              lineType: data.line_type_intelligence?.type,
              isMobile: data.line_type_intelligence?.type === 'mobile',
              validationErrors: data.validation?.validation_errors || [],
              source: 'twilio',
              confidence: 'high'
            });
            return;
          }
        } catch (twilioError) {
          console.log('Twilio validation failed, using basic result:', twilioError);
        }
      }

      setValidationResult(basicResult);
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult({
        valid: false,
        error: 'Validation failed',
        source: 'error',
        confidence: 'low'
      });
    } finally {
      setValidationLoading(false);
    }
  };

  // Handle phone input changes
  const handlePhoneChange = (value, country) => {
    setPhone(value);
    setSelectedCountry(country?.iso2 || 'us');
    
    // Debounce validation
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    
    validationTimeoutRef.current = setTimeout(() => {
      validatePhoneNumber(value, country?.iso2);
    }, 500);
    
    // Notify parent component
    if (onChange) {
      onChange({
        target: { value },
        phone: value,
        country: country?.iso2 || 'us',
        inputValue: value,
        isValid: validationResult?.valid || false,
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

  return (
    <Flex direction="column" gap="2">
      {/* Phone Input Container */}
      <div style={{ 
        position: 'relative',
        minHeight: '44px' // Mobile-friendly touch target
      }}>
        <IntlTelInput
          ref={(el) => {
            intlInputRef.current = el;
            if (ref) {
              if (typeof ref === 'function') {
                ref(el);
              } else {
                ref.current = el;
              }
            }
          }}
          value={phone}
          onChangeNumber={handlePhoneChange}
          onChangeCountry={handlePhoneChange}
          initOptions={{
            initialCountry: selectedCountry,
            preferredCountries: ['us', 'ca', 'gb', 'au'],
            utilsScript: '/intl-tel-input/js/utils.js', // For formatting
            autoInsertDialCode: false,
            separateDialCode: false,
            nationalMode: false,
            // Mobile optimizations
            allowDropdown: true,
            autoHideDialCode: false,
            // Styling
            customContainer: 'phone-input-container',
            customPlaceholder: function(selectedCountryPlaceholder) {
              return placeholder || selectedCountryPlaceholder;
            }
          }}
          inputProps={{
            placeholder,
            disabled,
            autoComplete,
            onKeyPress,
            style: {
              width: '100%',
              height: '44px', // Mobile touch target
              fontSize: '16px', // Prevent iOS zoom
              padding: '0 54px 0 12px', // Account for flag dropdown
              border: '1px solid var(--gray-7)',
              borderRadius: 'var(--radius-2)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--gray-12)',
              touchAction: 'manipulation'
            },
            ...props
          }}
        />
      </div>

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
            {validationResult.source === 'twilio' ? '🔒 Verified by Twilio' : 
             validationResult.source === 'basic' ? '⚡ Basic validation' : ''}
          </Text>
        </Flex>
      )}

      {/* Country Detection Info */}
      {countryGuess && selectedCountry !== countryGuess && (
        <Text size="1" color="gray">
          📍 Detected location: {countryGuess.toUpperCase()} - Click flag to change
        </Text>
      )}
      
      {!validationResult && !validationLoading && (
        <Text size="1" color="gray">
          💡 Select country and enter your phone number
        </Text>
      )}
      
      {/* Custom CSS */}
      <style jsx>{`
        .phone-input-container {
          width: 100%;
        }
        
        .iti {
          width: 100% !important;
        }
        
        .iti__flag-container {
          right: auto !important;
          left: 0 !important;
        }
        
        .iti__selected-flag {
          height: 44px !important;
          padding: 0 8px !important;
          border-right: 1px solid var(--gray-7) !important;
          background: var(--color-surface) !important;
        }
        
        .iti__selected-flag:hover {
          background: var(--gray-3) !important;
        }
        
        .iti__country-list {
          background: var(--color-surface) !important;
          border: 1px solid var(--gray-7) !important;
          border-radius: var(--radius-2) !important;
          box-shadow: var(--shadow-4) !important;
          max-height: 200px !important;
          z-index: 9999 !important;
        }
        
        .iti__country {
          padding: 8px 12px !important;
          border-bottom: 1px solid var(--gray-4) !important;
        }
        
        .iti__country:hover {
          background: var(--gray-3) !important;
        }
        
        .iti__country.iti__highlight {
          background: var(--accent-9) !important;
          color: white !important;
        }
        
        @media (max-width: 768px) {
          .iti__selected-flag {
            height: 48px !important;
          }
          
          .phone-input-container input {
            height: 48px !important;
            font-size: 16px !important;
          }
        }
      `}</style>
    </Flex>
  );
});

InternationalPhoneInput.displayName = 'InternationalPhoneInput';

export default InternationalPhoneInput;