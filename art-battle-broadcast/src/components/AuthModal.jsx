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
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import InternationalPhoneInput from './InternationalPhoneInput';

const OTP_MIN_LENGTH = 6;
const OTP_MAX_LENGTH = 8;

const AuthModal = ({ open, onOpenChange, redirectTo = null }) => {
  const [loginMethod, setLoginMethod] = useState('phone');
  const [phone, setPhone] = useState('');
  const [rawPhone, setRawPhone] = useState(''); // Store E.164 formatted phone
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [emailOtpType, setEmailOtpType] = useState('email');
  const [step, setStep] = useState('target'); // 'target' or 'otp'
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
          if (step === 'target') {
            // Multiple strategies to find and focus the phone input
            let inputElement = null;

            if (loginMethod === 'phone') {
              const phoneContainer = document.querySelector('.phone-input-container');
              if (phoneContainer) {
                inputElement = phoneContainer.querySelector('input[type="tel"]');
              }

              if (!inputElement) {
                const telInputs = document.querySelectorAll('input[type="tel"]');
                if (telInputs.length > 0) {
                  inputElement = telInputs[telInputs.length - 1];
                }
              }
            } else {
              inputElement = document.querySelector('input[type="email"]');
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
  }, [loginMethod, open, step]);

  const resetForm = () => {
    setPhone('');
    setRawPhone('');
    setEmail('');
    setOtp('');
    setEmailOtpType('email');
    setStep('target');
    setError('');
    setPhoneValid(false);
    setLoading(false);
  };

  const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value.trim());

  const handleSendOtp = async () => {
    setLoading(true);
    setError('');
    
    try {
      if (loginMethod === 'email') {
        const emailToUse = email.trim().toLowerCase();
        if (!isValidEmail(emailToUse)) {
          throw new Error('Enter a valid email address');
        }

        const { data, error } = await signInWithOtp(emailToUse, 'email', {
          redirectTo: redirectTo || window.location.href
        });
        if (error) throw error;
        setEmailOtpType(data?.verificationType || 'email');
      } else {
        const phoneToUse = rawPhone || phone;
        
        if (!phoneToUse.startsWith('+')) {
          throw new Error('Please select a country and enter a valid phone number');
        }
        
        const { error } = await signInWithOtp(phoneToUse, 'phone');
        if (error) throw error;
      }

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
      if (loginMethod === 'email') {
        const emailToUse = email.trim().toLowerCase();
        if (!isValidEmail(emailToUse)) {
          throw new Error('Email format error');
        }

        const { error } = await verifyOtp(emailToUse, otp, 'email', emailOtpType);
        if (error) throw error;
      } else {
        const phoneToUse = rawPhone || phone;
        
        if (!phoneToUse.startsWith('+')) {
          throw new Error('Phone number format error');
        }
        
        const { error } = await verifyOtp(phoneToUse, otp, 'phone');
        if (error) throw error;
      }

      // Success - close modal
      onOpenChange(false);
      resetForm();
      
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
    // console.log('📞 AuthModal: Phone change data received:', data); // REMOVED: Too verbose for debugging

    // Use formatted national version for display (like "(416) 302-5959")
    setPhone(data.nationalFormat || data.inputValue || data.phone || ''); // Formatted display value
    setRawPhone(data.e164Format || data.phone || ''); // E.164 for backend (+14163025959)
    const newValid = data.isValid || false;
    setPhoneValid(newValid);

    // console.log('📞 AuthModal: Phone state updated:', { phoneValid: newValid, display: data.nationalFormat, backend: data.e164Format }); // REMOVED: Too verbose
  };

  const targetLabel = loginMethod === 'email' ? email.trim().toLowerCase() : (rawPhone || phone);
  const sendDisabled = loading || (loginMethod === 'email' ? !isValidEmail(email) : !phoneValid);

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
          {step === 'target' 
            ? loginMethod === 'email'
              ? 'Enter your email to get your boost code'
              : 'Enter your phone to get your boost code'
            : `Enter the code we sent to your ${loginMethod === 'email' ? 'email' : 'phone'}`
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

          {step === 'target' ? (
            <>
              <Flex gap="2">
                <Button
                  size="2"
                  variant={loginMethod === 'phone' ? 'solid' : 'soft'}
                  onClick={() => {
                    setLoginMethod('phone');
                    setStep('target');
                    setOtp('');
                    setError('');
                  }}
                  disabled={loading}
                >
                  Phone
                </Button>
                <Button
                  size="2"
                  variant={loginMethod === 'email' ? 'solid' : 'soft'}
                  onClick={() => {
                    setLoginMethod('email');
                    setStep('target');
                    setOtp('');
                    setError('');
                  }}
                  disabled={loading}
                >
                  Email
                </Button>
              </Flex>
              <Box>
                <Text size="2" weight="medium" mb="2">
                  {loginMethod === 'email' ? 'Email Address' : 'Phone Number'}
                </Text>
                {loginMethod === 'email' ? (
                  <TextField.Root
                    size="3"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !sendDisabled && handleSendOtp()}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                ) : (
                  <InternationalPhoneInput
                    ref={phoneInputRef}
                    value={phone}
                    onChange={handlePhoneChange}
                    onKeyPress={(e) => e.key === 'Enter' && phoneValid && handleSendOtp()}
                    placeholder="Enter your phone number"
                    autoComplete="tel"
                  />
                )}
              </Box>
              
              <Button 
                size="3" 
                onClick={handleSendOtp}
                disabled={sendDisabled}
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
                  placeholder="12345678"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerifyOtp()}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  style={{ maxWidth: '150px', margin: '0 auto' }}
                />
                <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                  Enter the {OTP_MIN_LENGTH}-{OTP_MAX_LENGTH} digit code sent to {targetLabel}
                </Text>
              </Box>
              
              <Flex gap="2" direction="column">
                <Button 
                  size="3" 
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length < OTP_MIN_LENGTH}
                  loading={loading}
                >
                  Verify Code
                </Button>
                
                <Button 
                  size="2" 
                  variant="ghost"
                  onClick={() => {
                    setStep('target');
                    setOtp('');
                    setError('');
                  }}
                  disabled={loading}
                >
                  {loginMethod === 'email' ? 'Use Different Email' : 'Use Different Number'}
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
