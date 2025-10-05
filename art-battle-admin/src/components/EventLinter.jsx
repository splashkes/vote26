import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  TextField,
  Select,
  Badge,
  Table,
  Spinner,
  Card,
  Heading,
  Button,
  Dialog,
  ScrollArea,
  Separator,
  Checkbox
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  ReloadIcon,
  InfoCircledIcon,
  CalendarIcon,
  CrossCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { filterFindings, getSeverityCounts } from '../lib/eventLinter';
import { formatDateForDisplay } from '../lib/dateUtils';

const EventLinter = () => {
  const [findings, setFindings] = useState([]);
  const [allFindings, setAllFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilters, setSeverityFilters] = useState(new Set());
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [contextFilter, setContextFilter] = useState('all');
  const [futureOnly, setFutureOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [findingDialogOpen, setFindingDialogOpen] = useState(false);
  const [rules, setRules] = useState([]);

  // Load events and run linter via edge function
  const runLinter = async () => {
    try {
      setLoading(true);

      // Call edge function
      const { data: { session } } = await supabase.auth.getSession();
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL || 'https://xsqdkubgyqwpyvfltnrf.supabase.co'}/functions/v1/event-linter`);
      if (futureOnly) url.searchParams.append('future', 'true');
      if (activeOnly) url.searchParams.append('active', 'true');

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

      // Store results
      setRules({ length: result.rules_count || 0 }); // Just store count for display
      setAllFindings(result.findings || []);
      setFindings(result.findings || []);

      console.log('Linter debug info:', result.debug);
    } catch (err) {
      console.error('Error running linter:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runLinter();
  }, [futureOnly, activeOnly]);

  // Apply filters
  useEffect(() => {
    let filtered = allFindings;

    // Filter by severities (if any selected)
    if (severityFilters.size > 0) {
      filtered = filtered.filter(f => severityFilters.has(f.severity));
    }

    // Filter by category
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(f => f.category === categoryFilter);
    }

    // Filter by context
    if (contextFilter !== 'all') {
      filtered = filtered.filter(f => f.context === contextFilter);
    }

    // Filter by search
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(f =>
        f.message.toLowerCase().includes(searchLower) ||
        f.eventEid?.toLowerCase().includes(searchLower) ||
        f.eventName?.toLowerCase().includes(searchLower) ||
        f.ruleName.toLowerCase().includes(searchLower)
      );
    }

    setFindings(filtered);
  }, [searchQuery, severityFilters, categoryFilter, contextFilter, allFindings]);

  // Get severity counts
  const severityCounts = useMemo(() => getSeverityCounts(allFindings), [allFindings]);

  // Get unique categories and contexts
  const categories = useMemo(() => {
    const cats = new Set(allFindings.map(f => f.category));
    return Array.from(cats).sort();
  }, [allFindings]);

  const contexts = useMemo(() => {
    const ctxs = new Set(allFindings.map(f => f.context));
    return Array.from(ctxs).sort();
  }, [allFindings]);

  // Handle EID click to show event details
  const handleEidClick = async (e, finding) => {
    e.stopPropagation();
    try {
      const { data: event, error } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id, countries(id, name, code))
        `)
        .eq('id', finding.eventId)
        .single();

      if (error) throw error;

      setSelectedEvent(event);
      setDialogOpen(true);
    } catch (err) {
      console.error('Error loading event:', err);
    }
  };

  // Handle message click to show finding details
  const handleMessageClick = (e, finding) => {
    e.stopPropagation();
    setSelectedFinding(finding);
    setFindingDialogOpen(true);
  };

  // Calculate days until/since event
  const getDaysUntilEvent = (eventDate) => {
    if (!eventDate) return null;
    const now = new Date();
    const event = new Date(eventDate);
    const diffTime = event - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'red';
      case 'warning': return 'orange';
      case 'info': return 'blue';
      case 'success': return 'green';
      default: return 'gray';
    }
  };

  return (
    <Box p="3">
      <Flex direction="column" gap="3">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="5">Event Linter</Heading>
            <Text size="1" color="gray">
              Automated event health checks and operational warnings
            </Text>
          </Box>
          <Button size="1" onClick={runLinter} disabled={loading}>
            <ReloadIcon />
            Refresh
          </Button>
        </Flex>

        {/* Summary Stats - Clickable Filters */}
        <Card size="1">
          <Flex gap="2" align="center" wrap="wrap">
            <Text size="1" weight="medium">Filters:</Text>

            <Badge
              color="red"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('error') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('error')) {
                  newFilters.delete('error');
                } else {
                  newFilters.add('error');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ❌ {severityCounts.error} Errors
            </Badge>

            <Badge
              color="orange"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('warning') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('warning')) {
                  newFilters.delete('warning');
                } else {
                  newFilters.add('warning');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ⚠️ {severityCounts.warning} Warnings
            </Badge>

            <Badge
              color="amber"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('reminder') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('reminder')) {
                  newFilters.delete('reminder');
                } else {
                  newFilters.add('reminder');
                }
                setSeverityFilters(newFilters);
              }}
            >
              🔔 {severityCounts.reminder} Reminders
            </Badge>

            <Badge
              color="blue"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('info') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('info')) {
                  newFilters.delete('info');
                } else {
                  newFilters.add('info');
                }
                setSeverityFilters(newFilters);
              }}
            >
              📊 {severityCounts.info} Info
            </Badge>

            <Badge
              color="green"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={severityFilters.has('success') ? 'solid' : 'soft'}
              onClick={() => {
                const newFilters = new Set(severityFilters);
                if (newFilters.has('success')) {
                  newFilters.delete('success');
                } else {
                  newFilters.add('success');
                }
                setSeverityFilters(newFilters);
              }}
            >
              ✅ {severityCounts.success} Success
            </Badge>

            <Badge
              color="purple"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={futureOnly ? 'solid' : 'soft'}
              onClick={() => setFutureOnly(!futureOnly)}
            >
              🔮 Future
            </Badge>

            <Badge
              color="cyan"
              size="1"
              style={{ cursor: 'pointer' }}
              variant={activeOnly ? 'solid' : 'soft'}
              onClick={() => setActiveOnly(!activeOnly)}
            >
              ⚡ Active (±24h)
            </Badge>

            <Text size="1" color="gray">
              ({allFindings.length} total)
            </Text>
          </Flex>
        </Card>

        {/* Filters */}
        <Card size="1">
          <Flex gap="2" wrap="wrap" align="end">
            <Box style={{ flex: '1 1 300px', minWidth: '200px' }}>
              <TextField.Root
                size="1"
                placeholder="Search by EID, event name, message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="14" width="14" />
                </TextField.Slot>
              </TextField.Root>
            </Box>

            <Box style={{ flex: '0 1 120px', minWidth: '100px' }}>
              <Select.Root value={categoryFilter} onValueChange={setCategoryFilter}>
                <Select.Trigger size="1" style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All Categories</Select.Item>
                  {categories.map(cat => (
                    <Select.Item key={cat} value={cat}>
                      {cat.replace(/_/g, ' ')}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box style={{ flex: '0 1 120px', minWidth: '100px' }}>
              <Select.Root value={contextFilter} onValueChange={setContextFilter}>
                <Select.Trigger size="1" style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All Contexts</Select.Item>
                  {contexts.map(ctx => (
                    <Select.Item key={ctx} value={ctx}>
                      {ctx.replace(/_/g, ' ')}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            {(searchQuery || severityFilters.size > 0 || categoryFilter !== 'all' || contextFilter !== 'all' || futureOnly || activeOnly) && (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => {
                  setSearchQuery('');
                  setSeverityFilters(new Set());
                  setCategoryFilter('all');
                  setContextFilter('all');
                  setFutureOnly(false);
                  setActiveOnly(false);
                }}
              >
                <CrossCircledIcon />
                Clear
              </Button>
            )}
          </Flex>
        </Card>

        {/* Console-like Results Table */}
        <Card style={{
          backgroundColor: 'var(--color-panel-solid)',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
        }}>
          {loading ? (
            <Flex align="center" justify="center" p="6">
              <Spinner size="3" />
            </Flex>
          ) : findings.length === 0 ? (
            <Flex align="center" justify="center" p="6" direction="column" gap="2">
              <InfoCircledIcon width="24" height="24" color="var(--gray-9)" />
              <Text color="gray">No findings match the current filters</Text>
            </Flex>
          ) : (
            <ScrollArea style={{ maxHeight: 'calc(100vh - 400px)' }}>
              <Table.Root variant="surface" size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell style={{ width: '30px', padding: '4px 8px' }}></Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '80px', padding: '4px 8px' }}>EID</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '180px', padding: '4px 8px' }}>Event</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '90px', padding: '4px 8px' }}>Severity</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ minWidth: '300px', padding: '4px 8px' }}>Message</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '120px', padding: '4px 8px' }}>Category</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {findings.map((finding, index) => (
                    <Table.Row
                      key={`${finding.eventId}-${finding.ruleId}-${index}`}
                    >
                      <Table.Cell style={{ padding: '4px 8px' }}>
                        <Text size="2">{finding.emoji}</Text>
                      </Table.Cell>
                      <Table.Cell
                        style={{ padding: '4px 8px', cursor: 'pointer' }}
                        onClick={(e) => handleEidClick(e, finding)}
                      >
                        <Badge color="gray" variant="soft" size="1">
                          {finding.eventEid || 'N/A'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell style={{ padding: '4px 8px' }}>
                        <Text size="1" weight="medium" style={{
                          maxWidth: '180px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block'
                        }}>
                          {finding.eventName}
                        </Text>
                      </Table.Cell>
                      <Table.Cell style={{ padding: '4px 8px' }}>
                        <Badge color={getSeverityColor(finding.severity)} variant="soft" size="1">
                          {finding.severity}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell
                        style={{ padding: '4px 8px', cursor: 'pointer' }}
                        onClick={(e) => handleMessageClick(e, finding)}
                      >
                        <Text size="1" style={{ fontFamily: 'inherit' }}>
                          {finding.message}
                        </Text>
                      </Table.Cell>
                      <Table.Cell style={{ padding: '4px 8px' }}>
                        <Text size="1" color="gray" style={{
                          textTransform: 'capitalize',
                          fontFamily: 'inherit'
                        }}>
                          {finding.category.replace(/_/g, ' ')}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </ScrollArea>
          )}
        </Card>

        {/* Footer Info */}
        <Flex justify="between" align="center" style={{ fontSize: '11px' }}>
          <Text size="1" color="gray">
            {findings.length} findings • {rules.length || 0} rules
          </Text>
          <Text size="1" color="gray">
            {new Date().toLocaleTimeString()}
          </Text>
        </Flex>
      </Flex>

      {/* Event Details Modal */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>Event Details</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Basic information about this event
          </Dialog.Description>

          {selectedEvent && (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" color="gray">Event ID</Text>
                <Text size="3">{selectedEvent.eid || 'N/A'}</Text>
              </Box>

              <Separator size="4" />

              <Box>
                <Text size="2" weight="medium" color="gray">Name</Text>
                <Text size="3">{selectedEvent.name}</Text>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">City</Text>
                <Text size="3">
                  {selectedEvent.cities?.name || 'Not set'}
                  {selectedEvent.cities?.countries?.name && `, ${selectedEvent.cities.countries.name}`}
                </Text>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">Date</Text>
                <Flex align="center" gap="2">
                  <CalendarIcon />
                  <Text size="3">
                    {selectedEvent.event_start_datetime
                      ? formatDateForDisplay(selectedEvent.event_start_datetime).fullDate
                      : 'Not set'
                    }
                  </Text>
                </Flex>
              </Box>

              <Box>
                <Text size="2" weight="medium" color="gray">Status</Text>
                {selectedEvent.event_start_datetime && (() => {
                  const daysUntil = getDaysUntilEvent(selectedEvent.event_start_datetime);
                  if (daysUntil > 0) {
                    return (
                      <Badge color="blue" size="2">
                        {daysUntil} day{daysUntil !== 1 ? 's' : ''} until event
                      </Badge>
                    );
                  } else if (daysUntil === 0) {
                    return (
                      <Badge color="green" size="2">
                        Event today!
                      </Badge>
                    );
                  } else {
                    return (
                      <Badge color="gray" size="2">
                        {Math.abs(daysUntil)} day{Math.abs(daysUntil) !== 1 ? 's' : ''} ago
                      </Badge>
                    );
                  }
                })()}
              </Box>

              <Separator size="4" />

              <Button
                variant="soft"
                onClick={() => window.open(`/admin/events/${selectedEvent.id}`, '_blank')}
              >
                View Full Event Details
              </Button>
            </Flex>
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

              {/* Event Information */}
              <Card>
                <Flex direction="column" gap="2">
                  <Text size="1" weight="bold" color="gray">Event</Text>
                  <Flex align="center" gap="2">
                    <Badge color="gray" variant="soft" size="1">
                      {selectedFinding.eventEid || 'N/A'}
                    </Badge>
                    <Text size="2">{selectedFinding.eventName}</Text>
                  </Flex>
                  {selectedFinding.eventId && (
                    <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                      ID: {selectedFinding.eventId}
                    </Text>
                  )}
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

              {/* Artist Payment Info if available */}
              {selectedFinding.artistName && (
                <Card>
                  <Flex direction="column" gap="2">
                    <Text size="1" weight="bold" color="gray">Artist Payment Details</Text>
                    <Flex gap="4" wrap="wrap">
                      <Box>
                        <Text size="1" color="gray">Artist</Text>
                        <Text size="2">{selectedFinding.artistName}</Text>
                      </Box>
                      {selectedFinding.balanceOwed && (
                        <Box>
                          <Text size="1" color="gray">Amount Owed</Text>
                          <Text size="2">
                            {selectedFinding.currency} ${selectedFinding.balanceOwed.toFixed(2)}
                          </Text>
                        </Box>
                      )}
                      {selectedFinding.daysOverdue && (
                        <Box>
                          <Text size="1" color="gray">Days Overdue</Text>
                          <Badge color="red" size="1">
                            {selectedFinding.daysOverdue} days
                          </Badge>
                        </Box>
                      )}
                    </Flex>
                    {selectedFinding.artistEmail && (
                      <Box>
                        <Text size="1" color="gray">Email</Text>
                        <Text size="2" style={{ fontFamily: 'monospace' }}>
                          {selectedFinding.artistEmail}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Card>
              )}

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

      <style jsx>{`
        .hover-row:hover {
          background-color: var(--gray-3) !important;
        }
      `}</style>
    </Box>
  );
};

export default EventLinter;
