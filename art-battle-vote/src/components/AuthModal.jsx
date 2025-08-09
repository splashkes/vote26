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
      setTimeout(() => {
        if (step === 'phone' && phoneInputRef.current) {
          phoneInputRef.current.focus();
        } else if (step === 'otp' && otpInputRef.current) {
          otpInputRef.current.focus();
        }
      }, 100);
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
    setPhone(data.inputValue || data.phone || ''); // Display value
    setRawPhone(data.validationResult?.phoneNumber || data.phone || ''); // E.164 formatted value
    setPhoneValid(data.isValid || (data.validationResult?.valid && data.phone?.length >= 8));
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
                disabled={loading || !phoneValid || !rawPhone}
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