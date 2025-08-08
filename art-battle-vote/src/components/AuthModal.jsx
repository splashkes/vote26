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

const AuthModal = ({ open, onOpenChange, redirectTo = null }) => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' or 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
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
      // Convert to E.164 format
      const cleaned = phone.replace(/\D/g, '');
      const e164Phone = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
      
      const { error } = await signInWithOtp(e164Phone);
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
      // Convert to E.164 format (same as sendOtp)
      const cleaned = phone.replace(/\D/g, '');
      const e164Phone = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
      
      const { error } = await verifyOtp(e164Phone, otp);
      if (error) throw error;
      
      // Success - close modal
      onOpenChange(false);
      setPhone('');
      setOtp('');
      setStep('phone');
      
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

  const formatPhoneNumber = (value) => {
    // Remove all non-digits
    const cleaned = value.replace(/\D/g, '');
    
    // Format as needed (e.g., US format)
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  const handlePhoneChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content 
        style={{ 
          maxWidth: 400,
          width: '90vw',
          maxHeight: '80vh',
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          margin: 0,
          padding: '20px',
          overflow: 'auto'
        }}
      >
        <Dialog.Title>
          <Heading size="6">Sign in to vote</Heading>
        </Dialog.Title>
        
        <Dialog.Description size="2" mb="4">
          {step === 'phone' 
            ? 'Enter your phone number to receive a verification code'
            : 'Enter the 6-digit code we sent to your phone'
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
                <Text size="2" weight="medium" mb="1">
                  Phone Number
                </Text>
                <Flex gap="2">
                  <TextField.Root
                    size="3"
                    style={{ width: '80px' }}
                    value="+1"
                    disabled
                  />
                  <TextField.Root
                    ref={phoneInputRef}
                    size="3"
                    placeholder="416-302-5959"
                    value={phone}
                    onChange={handlePhoneChange}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendOtp()}
                    style={{ flex: 1, maxWidth: '200px' }}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </Flex>
                <Text size="1" color="gray" mt="1">
                  Enter your phone number without country code
                </Text>
              </Box>
              
              <Button 
                size="3" 
                onClick={handleSendOtp}
                disabled={loading || phone.replace(/\D/g, '').length < 10}
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
                  Code sent to {phone}
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