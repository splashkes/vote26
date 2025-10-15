import { useState, useEffect, useRef } from 'react';
import { Flex, Text, Badge, Select, TextField } from '@radix-ui/themes';
import { validatePhoneNumber } from '../lib/api';

const InternationalPhoneInput = ({
  value,
  onChange,
  placeholder = "Enter phone number",
  disabled = false,
  onKeyDown,
  error = '',
  defaultCountry = 'US'
}) => {
  const [phone, setPhone] = useState(value || '');
  const [validationResult, setValidationResult] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(defaultCountry);
  const validationTimeoutRef = useRef(null);

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
    { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
    { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
    { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
    { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
    { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  ];

  // Enhanced validation using Supabase edge function
  const callEnhancedValidation = async (phoneNumber, countryCode) => {
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (!phoneNumber || digitsOnly.length < 7) {
      return;
    }

    setValidationLoading(true);

    try {
      const { data, error } = await validatePhoneNumber(phoneNumber, countryCode);

      if (error) {
        console.log('Enhanced validation error:', error);
        setValidationLoading(false);
        return;
      }

      if (data) {
        console.log('📞 Enhanced validation result:', data);
        setValidationResult(data);

        // Update country flag based on Twilio's detected country
        if (data.countryCode && data.countryCode !== selectedCountry) {
          const detectedCountry = data.countryCode.toUpperCase();
          if (countryData.find(c => c.code === detectedCountry)) {
            setSelectedCountry(detectedCountry);
          }
        }

        // Update display with Twilio's formatted version
        if (data.nationalFormat && data.valid) {
          setPhone(data.nationalFormat);
        }

        // Update parent component with enhanced validation
        if (onChange) {
          onChange({
            phone: data.phoneNumber || phone,
            country: data.countryCode || selectedCountry,
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

  // Handle phone input changes
  const handlePhoneInput = (inputValue, overrideCountry = null) => {
    // Clean input but keep basic formatting chars
    const cleanedInput = inputValue.replace(/[^\d\s\-\(\)\+]/g, '');
    setPhone(cleanedInput);

    // Clear any existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Only validate if we have at least 7 digits
    const digitsOnly = cleanedInput.replace(/\D/g, '');
    if (digitsOnly.length >= 7) {
      validationTimeoutRef.current = setTimeout(() => {
        let phoneForValidation;
        const countryToUse = overrideCountry || selectedCountry;

        if (cleanedInput.startsWith('+')) {
          phoneForValidation = cleanedInput;
        } else {
          const selectedCountryData = countryData.find(c => c.code === countryToUse);
          if (selectedCountryData) {
            const countryDialCode = selectedCountryData.dialCode.replace('+', '');

            if (cleanedInput.startsWith(countryDialCode)) {
              phoneForValidation = '+' + cleanedInput;
            } else {
              phoneForValidation = selectedCountryData.dialCode + cleanedInput;
            }
          } else {
            phoneForValidation = cleanedInput;
          }
        }

        callEnhancedValidation(phoneForValidation, countryToUse);
      }, 800);
    }

    // Immediately notify parent with basic info
    if (onChange) {
      onChange({
        phone: '',
        country: selectedCountry,
        inputValue: cleanedInput,
        isValid: false,
        nationalFormat: cleanedInput,
        e164Format: '',
        validationResult: null
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
      <Flex gap="2" align="center" className="phone-input-container">
        <Select.Root
          value={selectedCountry}
          onValueChange={(newCountry) => {
            setSelectedCountry(newCountry);
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
          value={phone}
          onChange={(e) => handlePhoneInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="tel"
          style={{ flex: 1 }}
          size="3"
          type="tel"
          inputMode="numeric"
        />
      </Flex>

      {/* Validation Status */}
      {validationLoading && (
        <Text size="1" color="gray">🔄 Validating phone number...</Text>
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

          <Text size="1" color="gray">
            {validationResult.source === 'twilio' ? '🔒 Enhanced verification' :
             validationResult.source === 'basic' ? '⚡ Basic validation' : ''}
          </Text>
        </Flex>
      )}

      {error && (
        <Text size="2" style={{ color: 'var(--red-11)' }}>
          {error}
        </Text>
      )}

      {!validationResult && !validationLoading && !error && (
        <Text size="1" color="gray">
          💡 Select country and enter your phone number
        </Text>
      )}
    </Flex>
  );
};

export default InternationalPhoneInput;
