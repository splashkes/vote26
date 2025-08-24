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

  // Helper function to log QR validation attempts for debugging
  const logQRValidation = async (eventType, errorType = null, errorMessage = null, success = false, additionalMetadata = {}) => {
    try {
      // Console logging for immediate debugging
      if (success) {
        console.log(`✅ QR Validation Success:`, { qrCode, user: user?.phone, eventType });
      } else {
        console.warn(`❌ QR Validation Failed:`, { qrCode, user: user?.phone, errorType, errorMessage });
      }

      // Database logging for historical analysis
      const logData = {
        event_type: eventType,
        qr_code: qrCode,
        auth_user_id: user?.id || null,
        phone: user?.phone || null,
        user_agent: navigator.userAgent,
        success: success,
        error_type: errorType,
        error_message: errorMessage,
        metadata: {
          url: window.location.href,
          referrer: document.referrer,
          timestamp: new Date().toISOString(),
          ...additionalMetadata
        }
      };

      // Insert log entry (non-blocking - don't fail QR flow if logging fails)
      await supabase.from('event_auth_logs').insert(logData).catch(logErr => {
        console.warn('Failed to log QR validation to database:', logErr);
      });
    } catch (err) {
      console.warn('Error in QR validation logging:', err);
    }
  };

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

      // Create a timeout promise (reduced from 15s to 5s for faster fallback)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 5 seconds')), 5000);
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

      // Log successful QR validation
      await logQRValidation('qr_validation', null, null, true, { 
        event_id: data.event?.id,
        event_name: data.event?.name 
      });

      setResult(data);
      setEvent(data.event);

    } catch (err) {
      // Determine error type for logging
      let errorType = 'unknown_error';
      if (err.message.includes('timeout')) {
        errorType = 'timeout';
      } else if (err.message.includes('fetch')) {
        errorType = 'network_error';
      } else if (err.message.includes('AUTH')) {
        errorType = 'auth_failure';
      } else if (err.message.includes('500') || err.message.includes('Internal Server Error')) {
        errorType = 'server_error';
      } else if (err.message) {
        errorType = 'qr_validation_failed';
      }

      // Log error for debugging (but don't show to user)
      await logQRValidation('qr_validation', errorType, err.message, false);

      // SILENT FALLBACK: Don't show error to user, just redirect to events
      // This prevents loading loops when QR codes are expired/deleted
      setTimeout(() => {
        navigate('/');
      }, 1000); // Immediate redirect after brief delay
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

  // Component-level safety timeout - never let users wait more than 8 seconds
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⏰ Component safety timeout reached - forcing redirect to events');
        logQRValidation('qr_validation', 'component_timeout', 'Component safety timeout after 8 seconds', false);
        setLoading(false);
        navigate('/');
      }
    }, 8000);

    return () => clearTimeout(safetyTimeout);
  }, [loading, navigate]);

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

  // REMOVED: Error state UI - errors now redirect silently to events
  // This prevents users from seeing "QR code expired" messages and getting stuck

  if (result) {
    const isValid = result.is_valid && result.success;
    
    // If QR is invalid, silently redirect to events (no error message to user)
    if (!isValid) {
      console.warn('QR code invalid, redirecting silently to events');
      logQRValidation('qr_validation', 'invalid_qr_result', result.message, false, { result });
      setTimeout(() => navigate('/'), 100);
      return null;
    }
    
    // Only show success UI for valid QR codes
    return (
      <>
        <Box p="6" maxWidth="600px" mx="auto">
          <Card size="3">
            <Flex direction="column" gap="4">
              {/* Success Status Only */}
              <Flex direction="column" align="center" gap="3">
                <CheckIcon width="50" height="50" color="green" />
                <Heading size="6" align="center">🔥 You're Powered Up!</Heading>
                <Text size="3" align="center" color="green">{result.message}</Text>
              </Flex>

              {/* Event Info */}
              {event && (
                <Card size="2" style={{ background: 'var(--blue-2)' }}>
                  <Flex direction="column" gap="2">
                    <Heading size="4">{event.name}</Heading>
                    {event.venue && (
                      <Text size="2" color="gray">{event.venue}</Text>
                    )}
                    <Flex align="center" gap="2" mt="2">
                      <CheckIcon color="green" />
                      <Text size="2" color="green" weight="medium">
                        Extra vote power activated!
                      </Text>
                    </Flex>
                  </Flex>
                </Card>
              )}

              {/* Success Instructions */}
              <Callout.Root color="green">
                <Callout.Text>
                  <strong>Nice!</strong> Your votes now pack extra punch at this Art Battle. 
                  Go vote for your favorites!
                </Callout.Text>
              </Callout.Root>

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