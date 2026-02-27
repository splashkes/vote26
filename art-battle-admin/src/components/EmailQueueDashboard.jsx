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
  Callout,
  Select
} from '@radix-ui/themes';
import {
  EyeOpenIcon,
  ReloadIcon,
  ExclamationTriangleIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EmailQueueDashboard = () => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewEmail, setPreviewEmail] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load all emails on mount
  useEffect(() => {
    loadEmailLogs();
  }, []);

  const loadEmailLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load ALL recent email logs (not filtered by event)
      const { data: logs, error: logsError } = await supabase
        .from('email_logs')
        .select('*, events(eid, name)')
        .order('sent_at', { ascending: false })
        .limit(200);

      if (logsError) {
        console.error('Error loading email logs:', logsError);
        throw logsError;
      }

      console.log('Loaded email logs:', logs);
      setEmailLogs(logs || []);

      // Calculate stats
      const statsObj = {
        total: logs?.length || 0,
        sent: logs?.filter(e => e.status === 'sent').length || 0,
        failed: logs?.filter(e => e.status === 'failed').length || 0
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

  return (
    <Container size="4">
      <Box mb="6">
        <Heading size="6" mb="2">Email History</Heading>
        <Text color="gray" size="3">
          View recent emails sent by the system
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
                Recent Emails ({emailLogs.length})
              </Heading>
              <Button variant="ghost" onClick={loadEmailLogs} loading={loading}>
                <ReloadIcon />
                Refresh
              </Button>
            </Flex>

            {emailLogs.length > 0 ? (
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Recipient</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Subject</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Sent</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>View</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {emailLogs.map((entry) => (
                    <Table.Row key={entry.id}>
                      <Table.Cell>
                        <Text size="2" color="gray">
                          {entry.events?.eid || '-'}
                        </Text>
                      </Table.Cell>

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

export default EmailQueueDashboard;
