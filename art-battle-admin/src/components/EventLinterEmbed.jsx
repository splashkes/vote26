import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Badge,
  Table,
  Spinner,
  Card,
  Dialog,
  Button
} from '@radix-ui/themes';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventLinterEmbed = ({ eventEid }) => {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [findingDialogOpen, setFindingDialogOpen] = useState(false);

  // Load linter results for this event
  const runLinter = async () => {
    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/event-linter`);
      url.searchParams.append('eid', eventEid);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Linter error:', result);
        throw new Error(result.error || 'Failed to run linter');
      }

      setFindings(result.findings || []);
    } catch (err) {
      console.error('Error running linter:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventEid) {
      runLinter();
    }
  }, [eventEid]);

  // Handle message click to show finding details
  const handleMessageClick = (finding) => {
    setSelectedFinding(finding);
    setFindingDialogOpen(true);
  };

  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'red';
      case 'warning': return 'orange';
      case 'reminder': return 'amber';
      case 'info': return 'blue';
      case 'success': return 'green';
      default: return 'gray';
    }
  };

  // Get severity counts
  const severityCounts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <Flex align="center" justify="center" p="4">
        <Spinner size="2" />
      </Flex>
    );
  }

  if (findings.length === 0) {
    return (
      <Flex align="center" justify="center" p="4" direction="column" gap="2">
        <InfoCircledIcon width="20" height="20" color="var(--green-9)" />
        <Text color="green" size="2" weight="medium">✅ All checks passed</Text>
        <Text color="gray" size="1">No issues found for this event</Text>
      </Flex>
    );
  }

  return (
    <Box>
      {/* Summary Stats */}
      <Flex gap="2" mb="3" wrap="wrap">
        {severityCounts.error > 0 && (
          <Badge color="red" size="1">
            ❌ {severityCounts.error} Error{severityCounts.error !== 1 ? 's' : ''}
          </Badge>
        )}
        {severityCounts.warning > 0 && (
          <Badge color="orange" size="1">
            ⚠️ {severityCounts.warning} Warning{severityCounts.warning !== 1 ? 's' : ''}
          </Badge>
        )}
        {severityCounts.reminder > 0 && (
          <Badge color="amber" size="1">
            🔔 {severityCounts.reminder} Reminder{severityCounts.reminder !== 1 ? 's' : ''}
          </Badge>
        )}
        {severityCounts.info > 0 && (
          <Badge color="blue" size="1">
            📊 {severityCounts.info} Info
          </Badge>
        )}
        {severityCounts.success > 0 && (
          <Badge color="green" size="1">
            ✅ {severityCounts.success} Success
          </Badge>
        )}
      </Flex>

      {/* Results Table */}
      <Box style={{
        backgroundColor: 'var(--color-panel-solid)',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        borderRadius: '4px',
        overflow: 'visible',
        width: '100%'
      }}>
        <Table.Root variant="surface" size="1" style={{ width: '100%', tableLayout: 'fixed' }}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell style={{ width: '30px', padding: '4px 8px' }}></Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={{ padding: '4px 8px' }}>Message</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {findings.map((finding, index) => (
              <Table.Row key={`${finding.ruleId}-${index}`}>
                <Table.Cell style={{ padding: '4px 8px' }}>
                  <Text size="2">{finding.emoji}</Text>
                </Table.Cell>
                <Table.Cell
                  style={{ padding: '4px 8px', cursor: 'pointer' }}
                  onClick={() => handleMessageClick(finding)}
                >
                  <Text size="1" style={{ fontFamily: 'inherit', wordBreak: 'break-word' }}>
                    {finding.message}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Finding Details Modal */}
      <Dialog.Root open={findingDialogOpen} onOpenChange={setFindingDialogOpen}>
        <Dialog.Content style={{ maxWidth: 600 }}>
          <Dialog.Title>Finding Details</Dialog.Title>
          <Dialog.Description size="1" mb="4">
            Complete information about this linter finding
          </Dialog.Description>

          {selectedFinding && (
            <Flex direction="column" gap="3">
              {/* Rule Information */}
              <Card>
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center">
                    <Text size="1" weight="bold" color="gray">Rule</Text>
                    <Badge color={getSeverityColor(selectedFinding.severity)} size="1">
                      {selectedFinding.severity}
                    </Badge>
                  </Flex>
                  <Text size="2" weight="medium">{selectedFinding.ruleName}</Text>
                  <Text size="1" color="gray">Rule ID: {selectedFinding.ruleId}</Text>
                </Flex>
              </Card>

              {/* Message */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Message</Text>
                  <Text size="2" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {selectedFinding.emoji} {selectedFinding.message}
                  </Text>
                </Flex>
              </Card>

              {/* Metadata */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Metadata</Text>
                  <Flex gap="4" wrap="wrap">
                    <Box>
                      <Text size="1" color="gray">Category</Text>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>
                        {selectedFinding.category.replace(/_/g, ' ')}
                      </Text>
                    </Box>
                    <Box>
                      <Text size="1" color="gray">Context</Text>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>
                        {selectedFinding.context.replace(/_/g, ' ')}
                      </Text>
                    </Box>
                    {selectedFinding.timestamp && (
                      <Box>
                        <Text size="1" color="gray">Detected</Text>
                        <Text size="2">
                          {new Date(selectedFinding.timestamp).toLocaleString()}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Flex>
              </Card>

              {/* Raw Data (Debug) */}
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--gray-10)' }}>
                  Show Raw Data
                </summary>
                <Box mt="2" p="2" style={{
                  backgroundColor: 'var(--gray-2)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: '200px'
                }}>
                  <pre>{JSON.stringify(selectedFinding, null, 2)}</pre>
                </Box>
              </details>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button size="1" variant="soft" color="gray">
                Close
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default EventLinterEmbed;
