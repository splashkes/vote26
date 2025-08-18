import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  Flex,
  Text,
  TextField,
  Button,
  Heading,
  Box,
  Callout,
} from '@radix-ui/themes';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import InternationalPhoneInput from './InternationalPhoneInput';

const AuthModal = ({ open, onOpenChange, redirectTo = null }) => {
  const [phone, setPhone] = useState('');
  const [rawPhone, setRawPhone] = useState(''); // Store E.164 formatted phone
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneValid, setPhoneValid] = useState(false);
  
  const phoneInputRef = useRef(null);
  const otpInputRef = useRef(null);
  
  const { signInWithOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  
  // Auto-focus inputs when step changes
  useEffect(() => {
    if (open) {
      const focusActiveInput = () => {
        try {
          if (step === 'phone') {
            // Multiple strategies to find and focus the phone input
            let inputElement = null;
            
            // Strategy 1: Use container class
            const phoneContainer = document.querySelector('.phone-input-container');
            if (phoneContainer) {
              inputElement = phoneContainer.querySelector('input[type="tel"]');
            }
            
            // Strategy 2: Find all tel inputs and use the last one
            if (!inputElement) {
              const telInputs = document.querySelectorAll('input[type="tel"]');
              if (telInputs.length > 0) {
                inputElement = telInputs[telInputs.length - 1];
              }
            }
            
            if (inputElement && inputElement.focus) {
              inputElement.focus();
            }
          } else if (step === 'otp' && otpInputRef.current) {
            otpInputRef.current.focus();
          }
        } catch (error) {
          console.log('Focus error (non-critical):', error);
        }
      };
      
      // Try multiple times with different delays to handle async rendering
      setTimeout(focusActiveInput, 100);
      setTimeout(focusActiveInput, 300);
      setTimeout(focusActiveInput, 500);
    }
  }, [open, step]);

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Use the E.164 formatted phone number from the international input
      const phoneToUse = rawPhone || phone;
      
      if (!phoneToUse.startsWith('+')) {
        throw new Error('Please select a country and enter a valid phone number');
      }
      
      const { error } = await signInWithOtp(phoneToUse);
      if (error) throw error;
      
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Use the same E.164 phone format as sendOtp
      const phoneToUse = rawPhone || phone;
      
      if (!phoneToUse.startsWith('+')) {
        throw new Error('Phone number format error');
      }
      
      const { error } = await verifyOtp(phoneToUse, otp);
      if (error) throw error;
      
      // Success - close modal
      onOpenChange(false);
      setPhone('');
      setRawPhone('');
      setOtp('');
      setStep('phone');
      setPhoneValid(false);
      
      // Redirect to intended URL if provided
      if (redirectTo) {
        navigate(redirectTo);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle phone input changes from international phone component
  const handlePhoneChange = (data) => {
    console.log('📞 AuthModal: Phone change data received:', {
      inputValue: data.inputValue,
      phone: data.phone,
      nationalFormat: data.nationalFormat,
      e164Format: data.e164Format,
      isValid: data.isValid,
      validationResult: data.validationResult
    });
    console.log('📞 AuthModal: Current phoneValid state:', phoneValid);
    
    // Use formatted national version for display (like "(416) 302-5959")
    setPhone(data.nationalFormat || data.inputValue || data.phone || ''); // Formatted display value
    setRawPhone(data.e164Format || data.phone || ''); // E.164 for backend (+14163025959)
    const newValid = data.isValid || false;
    setPhoneValid(newValid);
    
    console.log('📞 AuthModal: Setting phoneValid to:', newValid);
    console.log('📞 AuthModal: Display phone:', data.nationalFormat);
    console.log('📞 AuthModal: Backend phone:', data.e164Format);
    console.log('📞 AuthModal: Button should be enabled:', !loading && newValid);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content 
        style={{ 
          maxWidth: '400px',
          width: '90vw'
        }}
      >
        <Dialog.Title>
          <Heading size="6">🚀 Power Up Your Votes!</Heading>
        </Dialog.Title>
        
        <Dialog.Description size="2" mb="4">
          {step === 'phone' 
            ? 'Enter your phone to get your boost code'
            : 'Enter the code we just texted you'
          }
        </Dialog.Description>

        <Flex direction="column" gap="4">
          {error && (
            <Callout.Root color="red" variant="surface">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {step === 'phone' ? (
            <>
              <Box>
                <Text size="2" weight="medium" mb="2">
                  Phone Number
                </Text>
                <InternationalPhoneInput
                  ref={phoneInputRef}
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyPress={(e) => e.key === 'Enter' && phoneValid && handleSendOtp()}
                  placeholder="Enter your phone number"
                  autoComplete="tel"
                />
              </Box>
              
              <Button 
                size="3" 
                onClick={handleSendOtp}
                disabled={loading || !phoneValid}
                loading={loading}
              >
                Send Verification Code
              </Button>
            </>
          ) : (
            <>
              <Box style={{ textAlign: 'center' }}>
                <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                  Verification Code
                </Text>
                <TextField.Root
                  ref={otpInputRef}
                  size="3"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerifyOtp()}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  style={{ maxWidth: '150px', margin: '0 auto' }}
                />
                <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                  Code sent to {rawPhone || phone}
                </Text>
              </Box>
              
              <Flex gap="2" direction="column">
                <Button 
                  size="3" 
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  loading={loading}
                >
                  Verify Code
                </Button>
                
                <Button 
                  size="2" 
                  variant="ghost"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError('');
                    setPhone('');
                    setRawPhone('');
                    setPhoneValid(false);
                  }}
                  disabled={loading}
                >
                  Use Different Number
                </Button>
              </Flex>
            </>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default AuthModal;