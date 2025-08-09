import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import {
  Box,
  Heading,
  Text,
  Card,
  Flex,
  Badge,
  Spinner,
  Grid,
} from '@radix-ui/themes';

const QRDisplay = () => {
  const { secretToken } = useParams();
  const [qrData, setQrData] = useState(null);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);

  // Generate new QR code
  const generateQR = async () => {
    if (!secretToken) return;

    try {
      // Only show loading if we don't have QR data yet (initial load)
      if (!qrData) {
        setLoading(true);
      }
      setError(null);

      const { data, error } = await supabase.functions.invoke('generate-qr-code', {
        body: { secret_token: secretToken }
      });

      if (error) {
        console.error('Error generating QR:', error);
        setError('Connection error: Unable to reach the QR generation service. Please check your internet connection.');
        return;
      }

      if (data.error) {
        // Use the improved error message from the edge function
        setError(data.message || data.error);
        return;
      }

      setQrData(data);
      setEvent(data.event);
      setLastGenerated(new Date(data.generated_at));
      
      // Generate QR code canvas - retry if canvas not ready yet
      if (data.scan_url) {
        const renderQR = async () => {
          if (canvasRef.current) {
            await QRCode.toCanvas(canvasRef.current, data.scan_url, {
              width: 300,
              margin: 2,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            });
          } else {
            // Canvas not ready yet, try again in a moment
            setTimeout(renderQR, 100);
          }
        };
        await renderQR();
      }

    } catch (err) {
      console.error('Error in generateQR:', err);
      setError('Failed to generate QR code');
    } finally {
      setLoading(false);
    }
  };

  // Format time display
  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Start countdown timer
  const startCountdown = () => {
    setTimeLeft(10);
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    countdownRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 10; // Reset for next cycle
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Initialize and set up refresh interval
  useEffect(() => {
    if (!secretToken) {
      setError('This QR display requires a secret token from the event admin panel. Please access this page using the complete URL provided by your event administrator.');
      setLoading(false);
      return;
    }

    // Initial QR generation and countdown start
    const initializeDisplay = async () => {
      await generateQR();
      startCountdown();
    };
    
    initializeDisplay();

    // Set up refresh interval (every 10 seconds)
    intervalRef.current = setInterval(() => {
      generateQR();
      startCountdown();
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [secretToken]);

  if (error) {
    return (
      <div className="qr-container">
        <Card className="error-card" style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
          <Flex direction="column" align="center" gap="4" p="6">
            {/* Art Battle Logo even in error state */}
            <Box style={{ textAlign: 'center', marginBottom: '16px' }}>
              <img
                src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public"
                alt="Art Battle"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  maxHeight: '60px',
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.target.style.display = 'none';
                  const fallback = document.createElement('h1');
                  fallback.innerText = 'ART BATTLE';
                  fallback.style.cssText = 'color: #dc267f; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; font-size: 2rem;';
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            </Box>
            
            <Box style={{ fontSize: '4rem' }}>❌</Box>
            
            <Heading size="4" align="center">QR Display Error</Heading>
            
            <Text size="3" align="center" color="red" style={{ maxWidth: '400px' }}>
              {error}
            </Text>
            
            <Box mt="4" p="4" style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', maxWidth: '500px' }}>
              <Heading size="3" mb="3" align="center">How to Fix This:</Heading>
              <Flex direction="column" gap="2">
                <Text size="2" align="center">
                  1. Go to the <strong>Art Battle Vote app</strong> admin panel
                </Text>
                <Text size="2" align="center">
                  2. Navigate to your event and click the <strong>"QR Codes"</strong> tab
                </Text>
                <Text size="2" align="center">
                  3. Click <strong>"Generate QR Secret"</strong> to create a new display URL
                </Text>
                <Text size="2" align="center">
                  4. Use the generated URL to access this QR display
                </Text>
              </Flex>
            </Box>
            
            <Text size="2" color="gray" align="center" mt="4">
              Need help? Contact your event administrator
            </Text>
          </Flex>
        </Card>
      </div>
    );
  }

  if (loading && !qrData) {
    return (
      <div className="qr-container">
        <div className="loading">
          <Spinner size="3" />
          <Text size="4" ml="2">Loading QR Code...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="qr-container">
      {/* Art Battle Logo */}
      <div className="qr-header">
        <Box style={{ textAlign: 'center', marginBottom: '16px' }}>
          <img
            src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public"
            alt="Art Battle"
            style={{
              maxWidth: '100%',
              height: 'auto',
              maxHeight: '80px',
              objectFit: 'contain'
            }}
            onError={(e) => {
              // Fallback to text if image fails to load
              e.target.style.display = 'none';
              const fallback = document.createElement('h1');
              fallback.innerText = 'ART BATTLE';
              fallback.style.cssText = 'color: #dc267f; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; font-size: 3rem;';
              e.target.parentNode.appendChild(fallback);
            }}
          />
        </Box>
        <Text size="4" color="gray">
          Scan to boost your vote!
        </Text>
      </div>

      {/* QR Code Display */}
      <Card className="qr-code-card" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
        <div className="qr-code">
          <canvas ref={canvasRef} />
        </div>
        
        {/* Event Info */}
        {event && (
          <Box mt="4" p="3" style={{ background: 'rgba(220, 38, 127, 0.1)', borderRadius: '8px' }}>
            <Heading size="4" mb="2">{event.name}</Heading>
            {event.venue && (
              <Text size="2" color="gray">{event.venue}</Text>
            )}
          </Box>
        )}

        {/* Generation Time */}
        <Flex justify="between" align="center" mt="4" p="2" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
          <Text size="2" color="gray">
            Generated: {formatTime(lastGenerated)}
          </Text>
          <Badge color="crimson" variant="soft">
            Next: {timeLeft}s
          </Badge>
        </Flex>

        {/* Stats */}
        {qrData?.stats && (
          <Grid columns="2" gap="3" mt="4">
            <div className="stat-box">
              <Text size="3" weight="bold" display="block">
                {qrData.stats.total_scans}
              </Text>
              <Text size="2" color="gray">
                Total Scans
              </Text>
            </div>
            <div className="stat-box">
              <Text size="3" weight="bold" display="block" style={{ color: '#4ecdc4' }}>
                {qrData.stats.valid_scans}
              </Text>
              <Text size="2" color="gray">
                Valid Scans
              </Text>
            </div>
          </Grid>
        )}

        {/* Instructions */}
        <Box mt="4" p="3" style={{ background: 'rgba(76, 205, 196, 0.1)', borderRadius: '8px' }}>
          <Text size="2" color="cyan">
            📱 Scan this QR code to get a vote boost for this event!
            <br />
            💡 Code changes every 10 seconds and is valid for 10 minutes
          </Text>
        </Box>
      </Card>
    </div>
  );
};

export default QRDisplay;