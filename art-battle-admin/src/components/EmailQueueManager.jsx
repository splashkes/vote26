import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
  Callout
} from '@radix-ui/themes';
import {
  PaperPlaneIcon,
  EyeOpenIcon,
  CheckIcon,
  Cross2Icon,
  ReloadIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const EmailQueueManager = () => {
  const { eventEid } = useParams();
  const { user } = useAuth();
  const [eventData, setEventData] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    if (eventEid) {
      loadEventData();
      loadQueueData();
    }
  }, [eventEid]);

  const loadEventData = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, cities(name)')
        .eq('eid', eventEid)
        .single();
        
      if (error) throw error;
      setEventData(data);
    } catch (err) {
      console.error('Error loading event data:', err);
      setError(err.message);
    }
  };

  const loadQueueData = async () => {
    if (!eventEid) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Load queue entries
      const queueResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-queue-manager?action=list&event_eid=${eventEid}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!queueResponse.ok) {
        const errorData = await queueResponse.json();
        throw new Error(errorData.error || 'Failed to load queue data');
      }

      const queueData = await queueResponse.json();
      setQueueEntries(queueData.data || []);

      // Load stats
      const statsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-queue-manager?action=stats&event_eid=${eventEid}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        const statsObj = {};
        (statsData.data || []).forEach(stat => {
          statsObj[stat.status] = stat.count;
        });
        setStats(statsObj);
      }

    } catch (err) {
      console.error('Error loading queue data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const approveEmail = async (emailId) => {
    setActionLoading({ [`approve_${emailId}`]: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-queue-manager?action=update_status`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            email_id: emailId, 
            status: 'approved' 
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve email');
      }

      await loadQueueData(); // Reload data
      
    } catch (err) {
      console.error('Error approving email:', err);
      setError(`Failed to approve email: ${err.message}`);
    } finally {
      setActionLoading({ [`approve_${emailId}`]: false });
    }
  };

  const sendEmail = async (emailId) => {
    setActionLoading({ [`send_${emailId}`]: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-queue-manager?action=send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email_ids: [emailId] })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }

      await loadQueueData(); // Reload data
      
    } catch (err) {
      console.error('Error sending email:', err);
      setError(`Failed to send email: ${err.message}`);
    } finally {
      setActionLoading({ [`send_${emailId}`]: false });
    }
  };

  const previewEmailContent = async (emailId) => {
    setActionLoading({ [`preview_${emailId}`]: true });
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-queue-manager?action=preview&email_id=${emailId}`,
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

  if (loading && !eventData) {
    return (
      <Container size="4">
        <Flex align="center" justify="center" py="8">
          <Text>Loading...</Text>
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="4">
      <Box mb="6">
        <Flex align="center" gap="3" mb="4">
          <Button 
            variant="ghost" 
            size="2"
            onClick={() => window.history.back()}
          >
            <ArrowLeftIcon />
          </Button>
          <Box>
            <Heading size="6">Email Queue</Heading>
            {eventData && (
              <Text color="gray" size="3">
                {eventData.eid} - {eventData.name} • {eventData.cities?.name}
              </Text>
            )}
          </Box>
        </Flex>
      </Box>

      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* Stats Overview */}
      <Flex gap="4" mb="6" wrap="wrap">
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Ready</Text>
          <Heading size="4">{stats.ready_for_review || 0}</Heading>
        </Card>
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Approved</Text>
          <Heading size="4">{stats.approved || 0}</Heading>
        </Card>
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Sent</Text>
          <Heading size="4">{stats.sent || 0}</Heading>
        </Card>
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Failed</Text>
          <Heading size="4">{stats.failed || 0}</Heading>
        </Card>
      </Flex>

      {/* Queue Table */}
      <Card>
        <Flex align="center" justify="between" mb="4">
          <Heading size="4">
            Email Queue ({queueEntries.length} emails)
          </Heading>
          <Button variant="ghost" onClick={loadQueueData} loading={loading}>
            <ReloadIcon />
            Refresh
          </Button>
        </Flex>

        {queueEntries.length > 0 ? (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
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
                      {entry.artist_profiles?.person?.email || 'No email'}
                    </Text>
                  </Table.Cell>
                  
                  <Table.Cell>
                    <Badge color={getStatusBadgeColor(entry.status)}>
                      {getStatusLabel(entry.status)}
                    </Badge>
                    {entry.status === 'sent' && entry.sent_at && (
                      <Text size="1" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                        Sent {new Date(entry.sent_at).toLocaleDateString()}
                      </Text>
                    )}
                    {entry.status === 'failed' && entry.error_message && (
                      <Text size="1" color="red" style={{ display: 'block', marginTop: '4px' }}>
                        Error: {entry.error_message.substring(0, 30)}...
                      </Text>
                    )}
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
                      
                      {entry.status === 'ready_for_review' && (
                        <IconButton 
                          size="1" 
                          color="green"
                          onClick={() => approveEmail(entry.id)}
                          loading={actionLoading[`approve_${entry.id}`]}
                          title="Approve Email"
                        >
                          <CheckIcon />
                        </IconButton>
                      )}
                      
                      {entry.status === 'approved' && (
                        <IconButton 
                          size="1" 
                          color="jade"
                          onClick={() => sendEmail(entry.id)}
                          loading={actionLoading[`send_${entry.id}`]}
                          title="Send Email"
                        >
                          <PaperPlaneIcon />
                        </IconButton>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Flex direction="column" align="center" py="8" gap="3">
            <Text color="gray">No emails in queue for this event</Text>
            <Text size="2" color="gray">
              Use the main Email Queue dashboard to generate emails for this event.
            </Text>
          </Flex>
        )}
      </Card>

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
                  {previewEmail.artist_profiles?.person?.email}
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

export default EmailQueueManager;