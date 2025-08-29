import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Heading,
  Box,
  Card,
  Flex,
  Text,
  Button,
  Badge,
  Table,
  IconButton,
  Dialog,
  Separator,
  Callout,
  Select
} from '@radix-ui/themes';
import {
  PaperPlaneIcon,
  EyeOpenIcon,
  CheckIcon,
  Cross2Icon,
  ReloadIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
// import EventSearch from './EventSearch'; // Temporarily disabled - too complex

const EmailQueueDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [queueEntries, setQueueEntries] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  // Load available events from past 30 days
  useEffect(() => {
    loadAvailableEvents();
  }, []);

  // Hardcode AB2995 for now
  useEffect(() => {
    const hardcodedEvent = { eid: 'AB2995', name: 'AB2995 – Sydney', id: 'hardcoded' };
    setSelectedEvent(hardcodedEvent);
  }, []);

  // Load queue data when event is selected
  useEffect(() => {
    if (selectedEvent?.eid) {
      console.log('Loading queue data for:', selectedEvent.eid);
      loadQueueData();
    }
  }, [selectedEvent]);

  const loadAvailableEvents = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const now = new Date();
      
      const { data: events, error } = await supabase
        .from('events')
        .select('id, eid, name, event_start_datetime, cities(name)')
        .gte('event_start_datetime', thirtyDaysAgo.toISOString())
        .lte('event_start_datetime', now.toISOString())
        .order('event_start_datetime', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAvailableEvents(events || []);
    } catch (err) {
      console.error('Error loading events:', err);
      setError(`Failed to load events: ${err.message}`);
    }
  };

  const loadQueueData = async () => {
    const eventEid = selectedEvent?.eid;
    if (!eventEid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Session debugging removed to reduce console noise
      
      if (!session) throw new Error('Not authenticated');

      // Load queue entries
      const queueResponse = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-queue-manager?action=list&event_eid=${eventEid}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!queueResponse.ok) {
        const errorData = await queueResponse.json();
        console.error('Queue response error:', errorData);
        if (errorData.debug) {
          console.error('Function debug info:', errorData.debug);
        }
        throw new Error(errorData.error || 'Failed to load queue data');
      }

      const queueData = await queueResponse.json();
      setQueueEntries(queueData.data || []);

      // Load stats
      const statsResponse = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-queue-manager?action=stats&event_eid=${eventEid}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        // Convert array of stats to object - handle response safely
        const statsObj = {};
        if (Array.isArray(statsData.data)) {
          statsData.data.forEach(stat => {
            statsObj[stat.status] = stat.count;
          });
        } else {
          console.error('Stats API returned non-array data:', statsData);
        }
        setStats(statsObj);
      }

    } catch (err) {
      console.error('Error loading queue data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateEmailQueue = async () => {
    const eventEid = selectedEvent?.eid;
    if (!eventEid) return;

    setActionLoading({ generate: true });
    
    try {
      // Use new dedicated populate-email-queue function (no auth required)
      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/populate-email-queue/${eventEid}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate email queue');
      }

      const result = await response.json();
      
      // Show success message and reload data
      setError(null);
      await loadQueueData();
      
    } catch (err) {
      console.error('Error generating email queue:', err);
      setError(`Failed to generate email queue: ${err.message}`);
    } finally {
      setActionLoading({ generate: false });
    }
  };

  const previewEmailContent = async (emailId) => {
    setActionLoading({ [`preview_${emailId}`]: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-queue-manager?action=preview&email_id=${emailId}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to preview email');
      }

      const result = await response.json();
      setPreviewEmail(result.data);
      setShowPreview(true);
      
    } catch (err) {
      console.error('Error previewing email:', err);
      setError(`Failed to preview email: ${err.message}`);
    } finally {
      setActionLoading({ [`preview_${emailId}`]: false });
    }
  };

  const bulkApprove = async () => {
    const pendingIds = queueEntries
      .filter(entry => entry.status === 'ready_for_review')
      .map(entry => entry.id);

    if (pendingIds.length === 0) return;

    setActionLoading({ bulk_approve: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-queue-manager?action=approve`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email_ids: pendingIds })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve emails');
      }

      await loadQueueData(); // Reload to show updated statuses
      
    } catch (err) {
      console.error('Error approving emails:', err);
      setError(`Failed to approve emails: ${err.message}`);
    } finally {
      setActionLoading({ bulk_approve: false });
    }
  };

  const bulkSend = async () => {
    const approvedIds = queueEntries
      .filter(entry => entry.status === 'approved')
      .map(entry => entry.id);

    if (approvedIds.length === 0) return;

    setActionLoading({ bulk_send: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/email-queue-manager?action=send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email_ids: approvedIds })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send emails');
      }

      const result = await response.json();
      console.log('Send result:', result);

      await loadQueueData(); // Reload to show updated statuses
      
    } catch (err) {
      console.error('Error sending emails:', err);
      setError(`Failed to send emails: ${err.message}`);
    } finally {
      setActionLoading({ bulk_send: false });
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'draft': return 'gray';
      case 'ready_for_review': return 'blue';
      case 'approved': return 'green';
      case 'sent': return 'jade';
      case 'failed': return 'red';
      default: return 'gray';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'ready_for_review': return 'Ready for Review';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <Container size="4">
      <Box mb="6">
        <Heading size="6" mb="2">Email Queue Management</Heading>
        <Text color="gray" size="3">
          Generate, review, and send artist payment notification emails
        </Text>
      </Box>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* Event Selection - Hardcoded for now */}
      <Card mb="6">
        <Flex direction="column" gap="4">
          <Heading size="4">Selected Event (Hardcoded)</Heading>
          <Box>
            <Text size="2" color="gray">
              Event: {selectedEvent?.eid} - {selectedEvent?.name}
            </Text>
            <Text size="1" color="orange" style={{ display: 'block', marginTop: '4px' }}>
              Note: Event selection is temporarily hardcoded to AB2995 for testing
            </Text>
          </Box>
        </Flex>
      </Card>

      {selectedEvent && (
        <>
          {/* Stats Cards */}
          <Flex gap="4" mb="6" wrap="wrap">
            <Card style={{ flex: 1, minWidth: '200px' }}>
              <Flex align="center" justify="between">
                <Box>
                  <Text size="2" color="gray">Ready for Review</Text>
                  <Heading size="5">{stats.ready_for_review || 0}</Heading>
                </Box>
                <Badge color="blue" size="2">Review</Badge>
              </Flex>
            </Card>
            
            <Card style={{ flex: 1, minWidth: '200px' }}>
              <Flex align="center" justify="between">
                <Box>
                  <Text size="2" color="gray">Approved</Text>
                  <Heading size="5">{stats.approved || 0}</Heading>
                </Box>
                <Badge color="green" size="2">Ready</Badge>
              </Flex>
            </Card>
            
            <Card style={{ flex: 1, minWidth: '200px' }}>
              <Flex align="center" justify="between">
                <Box>
                  <Text size="2" color="gray">Sent</Text>
                  <Heading size="5">{stats.sent || 0}</Heading>
                </Box>
                <Badge color="jade" size="2">Sent</Badge>
              </Flex>
            </Card>
            
            <Card style={{ flex: 1, minWidth: '200px' }}>
              <Flex align="center" justify="between">
                <Box>
                  <Text size="2" color="gray">Failed</Text>
                  <Heading size="5">{stats.failed || 0}</Heading>
                </Box>
                <Badge color="red" size="2">Error</Badge>
              </Flex>
            </Card>
          </Flex>

          {/* Actions */}
          <Card mb="6">
            <Flex direction="column" gap="4">
              <Heading size="4">Queue Actions</Heading>
              
              <Flex gap="3" wrap="wrap">
                <Button 
                  onClick={generateEmailQueue} 
                  loading={actionLoading.generate}
                  disabled={loading}
                >
                  <ReloadIcon />
                  Generate Email Queue
                </Button>
                
                <Button 
                  onClick={bulkApprove}
                  loading={actionLoading.bulk_approve}
                  disabled={!queueEntries.some(e => e.status === 'ready_for_review')}
                  color="green"
                >
                  <CheckIcon />
                  Approve All ({queueEntries.filter(e => e.status === 'ready_for_review').length})
                </Button>
                
                <Button 
                  onClick={bulkSend}
                  loading={actionLoading.bulk_send}
                  disabled={!queueEntries.some(e => e.status === 'approved')}
                  color="jade"
                >
                  <PaperPlaneIcon />
                  Send All ({queueEntries.filter(e => e.status === 'approved').length})
                </Button>
                
                <Button 
                  variant="ghost" 
                  onClick={loadQueueData}
                  loading={loading}
                >
                  <ReloadIcon />
                  Refresh
                </Button>
              </Flex>
            </Flex>
          </Card>

          {/* Email Queue Table */}
          {queueEntries.length > 0 ? (
            <Card>
              <Heading size="4" mb="4">Email Queue ({queueEntries.length} emails)</Heading>
              
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                
                <Table.Body>
                  {queueEntries.map((entry) => (
                    <Table.Row key={entry.id}>
                      <Table.Cell>
                        <Box>
                          <Text weight="medium">
                            {entry.artist_profiles?.name || 'Unknown Artist'}
                          </Text>
                          <Text size="1" color="gray">
                            #{entry.artist_profiles?.entry_id}
                          </Text>
                        </Box>
                      </Table.Cell>
                      
                      <Table.Cell>
                        <Text size="2">
                          {entry.email_data?.artistEmail || entry.artist_profiles?.email || entry.artist_profiles?.person?.email || 'No email'}
                        </Text>
                      </Table.Cell>
                      
                      <Table.Cell>
                        <Badge color={getStatusBadgeColor(entry.status)}>
                          {getStatusLabel(entry.status)}
                        </Badge>
                        {entry.status === 'sent' && entry.sent_at && (
                          <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                            {new Date(entry.sent_at).toLocaleDateString()}
                          </Text>
                        )}
                        {entry.status === 'failed' && entry.error_message && (
                          <Text size="1" color="red" style={{ display: 'block', marginTop: '4px' }}>
                            {entry.error_message.substring(0, 50)}...
                          </Text>
                        )}
                      </Table.Cell>
                      
                      <Table.Cell>
                        <Text size="2">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </Text>
                      </Table.Cell>
                      
                      <Table.Cell>
                        <Flex gap="2">
                          <IconButton 
                            size="1" 
                            variant="ghost" 
                            onClick={() => previewEmailContent(entry.id)}
                            loading={actionLoading[`preview_${entry.id}`]}
                            title="Preview Email"
                          >
                            <EyeOpenIcon />
                          </IconButton>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card>
          ) : !loading && (
            <Card>
              <Flex direction="column" align="center" py="8" gap="3">
                <InfoCircledIcon size={32} color="gray" />
                <Heading size="4" color="gray">No emails in queue</Heading>
                <Text color="gray" align="center">
                  Generate email queue for this event to start managing artist payment notifications.
                </Text>
                <Button onClick={generateEmailQueue} loading={actionLoading.generate}>
                  <ReloadIcon />
                  Generate Email Queue
                </Button>
              </Flex>
            </Card>
          )}
        </>
      )}

      {/* Email Preview Dialog */}
      <Dialog.Root open={showPreview} onOpenChange={setShowPreview}>
        <Dialog.Content style={{ maxWidth: '800px' }}>
          <Dialog.Title>Email Preview</Dialog.Title>
          
          {previewEmail && (
            <Box>
              <Box mb="4">
                <Text size="2" color="gray">Subject:</Text>
                <Text weight="medium" style={{ display: 'block' }}>
                  {previewEmail.preview?.subject}
                </Text>
              </Box>
              
              <Box mb="4">
                <Text size="2" color="gray">To:</Text>
                <Text style={{ display: 'block' }}>
                  {previewEmail.email_data?.artistEmail || previewEmail.artist_profiles?.email || previewEmail.artist_profiles?.person?.email || 'No email'}
                </Text>
              </Box>
              
              <Separator mb="4" />
              
              <Box 
                style={{ 
                  border: '1px solid var(--gray-6)', 
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                <div 
                  dangerouslySetInnerHTML={{ 
                    __html: previewEmail.preview?.html 
                  }} 
                  style={{
                    padding: '0',
                    margin: '0',
                    fontFamily: 'Arial, sans-serif'
                  }}
                />
              </Box>
            </Box>
          )}
          
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Container>
  );
};

export default EmailQueueDashboard;