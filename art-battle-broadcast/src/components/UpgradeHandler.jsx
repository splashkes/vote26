import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import AuthModal from './AuthModal';
import {
  Box,
  Heading,
  Text,
  Card,
  Flex,
  Button,
  Spinner,
  Callout,
} from '@radix-ui/themes';
import { CheckIcon, ExclamationTriangleIcon, ArrowRightIcon } from '@radix-ui/react-icons';

const UpgradeHandler = () => {
  const { qrCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Validate QR scan
  const validateQRScan = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      console.log('Starting QR validation for code:', qrCode);
      console.log('User authenticated:', !!user);

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 15 seconds')), 15000);
      });

      // Make the function call with timeout
      const functionPromise = supabase.functions.invoke('validate-qr-scan', {
        body: {
          qr_code: qrCode,
          user_agent: navigator.userAgent,
          location_data: {
            url: window.location.href,
            referrer: document.referrer
          }
        }
      });

      const { data, error } = await Promise.race([functionPromise, timeoutPromise]);

      console.log('Function response:', { data, error });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      setResult(data);
      setEvent(data.event);

    } catch (err) {
      console.error('Error validating QR scan:', err);
      
      // Handle specific error cases and provide fallback navigation
      let errorMessage = 'Failed to validate QR code';
      let showFallbackNavigation = false;
      
      if (err.message.includes('timeout')) {
        errorMessage = 'Request timed out - please check your internet connection and try again';
        showFallbackNavigation = true;
      } else if (err.message.includes('fetch')) {
        errorMessage = 'Network error - please check your internet connection';
        showFallbackNavigation = true;
      } else if (err.message.includes('AUTH')) {
        errorMessage = 'Authentication error - please sign out and sign back in';
      } else if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        errorMessage = 'Server error while validating QR code. You can still proceed to the events.';
        showFallbackNavigation = true;
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
        showFallbackNavigation = true;
      }
      
      setError(errorMessage);
      
      // For certain errors, still allow navigation to events list
      if (showFallbackNavigation) {
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-validate when component mounts and user is authenticated
  useEffect(() => {
    if (qrCode && user) {
      validateQRScan();
    }
  }, [qrCode, user]);

  if (!qrCode) {
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" align="center" gap="4">
              <ExclamationTriangleIcon width="40" height="40" color="orange" />
              <Heading size="5">Invalid QR Code</Heading>
              <Text size="3" color="gray" align="center">
                No QR code provided in the URL.
              </Text>
              <Button onClick={() => navigate('/')}>
                Go to Events
              </Button>
            </Flex>
          </Card>
        </Box>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" align="center" gap="4">
              <Heading size="5">🎨 Get Your Vote Boost!</Heading>
              <Text size="3" color="gray" align="center">
                Sign in to power up your votes for this Art Battle!
              </Text>
              <Button size="3" onClick={() => setShowAuthModal(true)}>
                Sign In
              </Button>
            </Flex>
          </Card>
        </Box>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" align="center" gap="4">
              <Spinner size="3" />
              <Heading size="5">Validating QR Code</Heading>
              <Text size="3" color="gray" align="center">
                Please wait while we process your scan...
              </Text>
            </Flex>
          </Card>
        </Box>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" gap="4">
              <Callout.Root color="red">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
              
              <Flex direction="column" gap="3">
                <Button onClick={() => validateQRScan()} variant="soft">
                  Try Again
                </Button>
                <Button onClick={() => navigate('/')} variant="outline">
                  Go to Events
                </Button>
              </Flex>
            </Flex>
          </Card>
        </Box>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  if (result) {
    const isValid = result.is_valid && result.success;
    
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" gap="4">
              {/* Result Status */}
              <Flex direction="column" align="center" gap="3">
                {isValid ? (
                  <CheckIcon width="50" height="50" color="green" />
                ) : (
                  <ExclamationTriangleIcon width="50" height="50" color="orange" />
                )}
                
                <Heading size="6" align="center">
                  {isValid ? '🔥 You\'re Powered Up!' : 'QR Code Issue'}
                </Heading>
                
                <Text size="3" align="center" color={isValid ? "green" : "orange"}>
                  {result.message}
                </Text>
              </Flex>

              {/* Event Info */}
              {event && (
                <Card size="2" style={{ background: 'var(--blue-2)' }}>
                  <Flex direction="column" gap="2">
                    <Heading size="4">{event.name}</Heading>
                    {event.venue && (
                      <Text size="2" color="gray">{event.venue}</Text>
                    )}
                    {isValid && (
                      <Flex align="center" gap="2" mt="2">
                        <CheckIcon color="green" />
                        <Text size="2" color="green" weight="medium">
                          Extra vote power activated!
                        </Text>
                      </Flex>
                    )}
                  </Flex>
                </Card>
              )}

              {/* Instructions */}
              {isValid ? (
                <Callout.Root color="green">
                  <Callout.Text>
                    <strong>Nice!</strong> Your votes now pack extra punch at this Art Battle. 
                    Go vote for your favorites!
                  </Callout.Text>
                </Callout.Root>
              ) : (
                <Callout.Root color="orange">
                  <Callout.Text>
                    Oops! This QR code expired. Grab a fresh one from the event screen!
                  </Callout.Text>
                </Callout.Root>
              )}

              {/* Action Buttons */}
              <Flex gap="3" justify="center">
                {event && (
                  <Button 
                    size="3" 
                    onClick={() => navigate(`/event/${event.id}`)}
                  >
                    Go to Event <ArrowRightIcon />
                  </Button>
                )}
                
                <Button 
                  size="3" 
                  variant="soft" 
                  onClick={() => navigate('/')}
                >
                  View All Events
                </Button>
              </Flex>

              {/* Additional Info */}
              <Box mt="4" p="3" style={{ background: 'var(--gray-2)', borderRadius: '8px' }}>
                <Text size="2" color="gray" align="center">
                  Scanned at {new Date(result.timestamp).toLocaleString()}
                </Text>
              </Box>
            </Flex>
          </Card>
        </Box>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
        />
      </>
    );
  }

  return null;
};

export default UpgradeHandler;