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
      // Get event_id from eid
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .eq('eid', eventEid)
        .single();

      if (eventError) throw eventError;

      // Load recent email logs for this event
      const { data: emailLogs, error: logsError } = await supabase
        .from('email_logs')
        .select('*')
        .eq('event_id', event.id)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      setQueueEntries(emailLogs || []);

      // Calculate stats
      const statsObj = {
        sent: emailLogs?.filter(e => e.status === 'sent').length || 0,
        failed: emailLogs?.filter(e => e.status === 'failed').length || 0,
        total: emailLogs?.length || 0
      };
      setStats(statsObj);

    } catch (err) {
      console.error('Error loading email logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const viewEmailDetails = (emailLog) => {
    // Simply show the email log details
    setPreviewEmail(emailLog);
    setShowPreview(true);
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'sent': return 'green';
      case 'failed': return 'red';
      default: return 'gray';
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
            <Heading size="6">Email History</Heading>
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
          <Text size="1" color="gray">Total Sent</Text>
          <Heading size="4">{stats.total || 0}</Heading>
        </Card>
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Successful</Text>
          <Heading size="4">{stats.sent || 0}</Heading>
        </Card>
        <Card style={{ flex: 1, minWidth: '150px' }}>
          <Text size="1" color="gray">Failed</Text>
          <Heading size="4" color="red">{stats.failed || 0}</Heading>
        </Card>
      </Flex>

      {/* Email Logs Table */}
      <Card>
        <Flex align="center" justify="between" mb="4">
          <Heading size="4">
            Recent Emails ({queueEntries.length})
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
                <Table.ColumnHeaderCell>Recipient</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Subject</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Sent</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>View</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {queueEntries.map((entry) => (
                <Table.Row key={entry.id}>
                  <Table.Cell>
                    <Text size="2">{entry.recipient}</Text>
                  </Table.Cell>

                  <Table.Cell>
                    <Text size="2" weight="medium">
                      {entry.subject}
                    </Text>
                  </Table.Cell>

                  <Table.Cell>
                    <Text size="2" color="gray">
                      {new Date(entry.sent_at).toLocaleString()}
                    </Text>
                  </Table.Cell>

                  <Table.Cell>
                    <Badge color={getStatusBadgeColor(entry.status)}>
                      {entry.status}
                    </Badge>
                    {entry.status === 'failed' && entry.error_message && (
                      <Text size="1" color="red" style={{ display: 'block', marginTop: '4px' }}>
                        {entry.error_message.substring(0, 40)}...
                      </Text>
                    )}
                  </Table.Cell>

                  <Table.Cell>
                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => viewEmailDetails(entry)}
                      title="View Details"
                    >
                      <EyeOpenIcon />
                    </IconButton>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        ) : (
          <Flex direction="column" align="center" py="8" gap="3">
            <Text color="gray">No emails sent for this event yet</Text>
          </Flex>
        )}
      </Card>

      {/* Email Details Dialog */}
      <Dialog.Root open={showPreview} onOpenChange={setShowPreview}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>Email Details</Dialog.Title>

          {previewEmail && (
            <Box>
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" color="gray">Subject:</Text>
                  <Text weight="medium" style={{ display: 'block' }}>
                    {previewEmail.subject}
                  </Text>
                </Box>

                <Box>
                  <Text size="2" color="gray">To:</Text>
                  <Text style={{ display: 'block' }}>
                    {previewEmail.recipient}
                  </Text>
                </Box>

                <Box>
                  <Text size="2" color="gray">From:</Text>
                  <Text style={{ display: 'block' }}>
                    {previewEmail.sender}
                  </Text>
                </Box>

                <Box>
                  <Text size="2" color="gray">Sent:</Text>
                  <Text style={{ display: 'block' }}>
                    {new Date(previewEmail.sent_at).toLocaleString()}
                  </Text>
                </Box>

                <Box>
                  <Text size="2" color="gray">Method:</Text>
                  <Text style={{ display: 'block' }}>
                    {previewEmail.method}
                  </Text>
                </Box>

                <Box>
                  <Text size="2" color="gray">Status:</Text>
                  <Badge color={getStatusBadgeColor(previewEmail.status)}>
                    {previewEmail.status}
                  </Badge>
                </Box>

                {previewEmail.error_message && (
                  <Box>
                    <Text size="2" color="gray">Error Message:</Text>
                    <Text size="2" color="red" style={{ display: 'block' }}>
                      {previewEmail.error_message}
                    </Text>
                  </Box>
                )}
              </Flex>
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