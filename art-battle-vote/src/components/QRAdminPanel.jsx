import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Text,
  Card,
  Flex,
  Button,
  Badge,
  Separator,
  Callout,
  Spinner,
  Code,
} from '@radix-ui/themes';
import { CopyIcon, ReloadIcon, ExclamationTriangleIcon, CheckIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const QRAdminPanel = ({ eventId }) => {
  const [qrSecret, setQrSecret] = useState(null);
  const [qrStats, setQrStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fetch existing QR secret and stats
  const fetchQRData = async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      setError(null);

      // Get existing secret for this event
      console.log('Fetching QR secret for event:', eventId);
      const { data: secretData, error: secretError } = await supabase
        .from('event_qr_secrets')
        .select('secret_token, created_at')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      console.log('QR secret fetch result:', { secretData, secretError });
      console.log('Secret data details:', secretData);

      if (secretError) {
        console.error('QR secret fetch error:', secretError);
        throw secretError;
      }

      // Take the first result if any
      const secret = secretData && secretData.length > 0 ? secretData[0] : null;
      console.log('Secret extracted:', secret);

      setQrSecret(secret);

      // Get scan statistics
      const { data: scanStats, error: statsError } = await supabase
        .from('people_qr_scans')
        .select('id, is_valid, scan_timestamp')
        .eq('event_id', eventId);

      if (statsError) {
        console.error('Error fetching scan stats:', statsError);
      } else {
        const totalScans = scanStats?.length || 0;
        const validScans = scanStats?.filter(scan => scan.is_valid).length || 0;
        const recentScans = scanStats?.filter(scan => {
          const scanTime = new Date(scan.scan_timestamp);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          return scanTime > oneHourAgo;
        }).length || 0;

        setQrStats({
          total: totalScans,
          valid: validScans,
          recent: recentScans
        });
      }

    } catch (err) {
      console.error('Error fetching QR data:', err);
      setError('Failed to load QR data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate new QR secret
  const generateNewSecret = async () => {
    if (!eventId) return;

    try {
      setGenerating(true);
      setError(null);

      console.log('Creating QR secret for event:', eventId);
      const { data, error } = await supabase
        .rpc('create_event_qr_secret', { p_event_id: eventId });

      if (error) {
        console.error('Create QR secret error:', error);
        throw error;
      }
      
      console.log('QR secret created:', data);

      // Refresh data to show new secret
      await fetchQRData();
      
    } catch (err) {
      console.error('Error generating QR secret:', err);
      setError('Failed to generate QR secret: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Copy URL to clipboard
  const copyQRUrl = async () => {
    if (!qrSecret?.secret_token) return;

    const qrUrl = `https://artb.art/qr/${qrSecret.secret_token}`;
    
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  useEffect(() => {
    fetchQRData();
  }, [eventId]);

  if (loading && !qrSecret) {
    return (
      <Box p="4">
        <Flex align="center" gap="2">
          <Spinner size="2" />
          <Text>Loading QR data...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box>
      <Heading size="4" mb="4">QR Code Management</Heading>

      {error && (
        <Callout.Root color="red" size="2" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* QR Secret Management */}
      <Card size="2" mb="4">
        <Flex direction="column" gap="4">
          <Heading size="3">QR Display URL</Heading>
          
          {qrSecret ? (
            <Box>
              <Text size="2" color="gray" mb="2">
                Created: {new Date(qrSecret.created_at).toLocaleString()}
              </Text>
              
              <Box p="3" style={{ background: 'var(--gray-2)', borderRadius: '6px', fontFamily: 'monospace' }}>
                <Code size="2">
                  <a href={`https://artb.art/qr/${qrSecret.secret_token}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)', textDecoration: 'none' }}>
                    https://artb.art/qr/{qrSecret.secret_token}
                  </a>
                </Code>
              </Box>
              
              <Flex gap="2" mt="3">
                <Button 
                  size="2" 
                  variant="soft" 
                  onClick={copyQRUrl}
                  disabled={copied}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? 'Copied!' : 'Copy URL'}
                </Button>
                
                {/* <Button 
                  size="2" 
                  variant="outline" 
                  color="orange"
                  onClick={generateNewSecret}
                  disabled={generating}
                >
                  {generating ? <Spinner size="1" /> : <ReloadIcon />}
                  {generating ? 'Generating...' : 'Generate New'}
                </Button> */}
              </Flex>

              <Callout.Root size="1" mt="3">
                <Callout.Text>
                  <strong>Important:</strong> Only share this URL with event staff. It allows access to the QR code display for this event.
                </Callout.Text>
              </Callout.Root>
            </Box>
          ) : (
            <Box>
              <Text size="2" color="gray" mb="3">
                No QR secret has been generated for this event yet.
              </Text>
              
              <Button 
                size="2" 
                onClick={generateNewSecret}
                disabled={generating}
              >
                {generating ? <Spinner size="1" /> : null}
                {generating ? 'Generating...' : 'Generate QR Secret'}
              </Button>
            </Box>
          )}
        </Flex>
      </Card>

      {/* QR Statistics */}
      {qrStats && (
        <Card size="2" mb="4">
          <Flex direction="column" gap="4">
            <Heading size="3">Scan Statistics</Heading>
            
            <Flex gap="4">
              <Box style={{ textAlign: 'center' }}>
                <Text size="5" weight="bold" display="block" color="blue">
                  {qrStats.total}
                </Text>
                <Text size="2" color="gray">Total Scans</Text>
              </Box>
              
              <Separator orientation="vertical" size="2" />
              
              <Box style={{ textAlign: 'center' }}>
                <Text size="5" weight="bold" display="block" color="green">
                  {qrStats.valid}
                </Text>
                <Text size="2" color="gray">Valid Scans</Text>
              </Box>
              
              <Separator orientation="vertical" size="2" />
              
              <Box style={{ textAlign: 'center' }}>
                <Text size="5" weight="bold" display="block" color="orange">
                  {qrStats.recent}
                </Text>
                <Text size="2" color="gray">Last Hour</Text>
              </Box>
            </Flex>

            <Button 
              size="2" 
              variant="soft" 
              onClick={fetchQRData}
              disabled={loading}
            >
              {loading ? <Spinner size="1" /> : <ReloadIcon />}
              Refresh Stats
            </Button>
          </Flex>
        </Card>
      )}

      {/* How It Works */}
      <Card size="2" style={{ background: 'var(--blue-2)' }}>
        <Heading size="3" mb="3">How QR Voting Works</Heading>
        
        <Flex direction="column" gap="2">
          <Text size="2">
            1. <strong>Display QR:</strong> Open the QR URL above on a screen visible to attendees
          </Text>
          <Text size="2">
            2. <strong>Auto-refresh:</strong> QR codes change every 10 seconds and are valid for 1 minute
          </Text>
          <Text size="2">
            3. <strong>Scan & Register:</strong> When attendees scan and register/login, they get a vote boost
          </Text>
          <Text size="2">
            4. <strong>Event-specific:</strong> The vote boost only applies to this specific event
          </Text>
          <Text size="2">
            5. <strong>Permanent Boost:</strong> Once scanned, the boost applies to all votes for this event
          </Text>
        </Flex>

        <Separator my="3" />

        <Badge color="crimson" size="2">
          QR Boost: +1.0x vote weight
        </Badge>
      </Card>
    </Box>
  );
};

export default QRAdminPanel;