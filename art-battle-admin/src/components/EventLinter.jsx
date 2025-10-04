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

  // Handle row click to show event details
  const handleRowClick = async (finding) => {
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
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="6">Event Linter</Heading>
            <Text size="2" color="gray">
              Automated event health checks and operational warnings
            </Text>
          </Box>
          <Button onClick={runLinter} disabled={loading}>
            <ReloadIcon />
            Refresh
          </Button>
        </Flex>

        {/* Summary Stats - Clickable Filters */}
        <Card>
          <Flex gap="3" align="center" wrap="wrap">
            <Text size="2" weight="medium">Filters:</Text>

            <Badge
              color="red"
              size="2"
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
              size="2"
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
              color="blue"
              size="2"
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
              size="2"
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
              size="2"
              style={{ cursor: 'pointer' }}
              variant={futureOnly ? 'solid' : 'soft'}
              onClick={() => setFutureOnly(!futureOnly)}
            >
              🔮 Future
            </Badge>

            <Badge
              color="cyan"
              size="2"
              style={{ cursor: 'pointer' }}
              variant={activeOnly ? 'solid' : 'soft'}
              onClick={() => setActiveOnly(!activeOnly)}
            >
              ⚡ Active (±24h)
            </Badge>

            <Text size="2" color="gray">
              ({allFindings.length} total)
            </Text>
          </Flex>
        </Card>

        {/* Filters */}
        <Card>
          <Flex gap="3" wrap="wrap" align="end">
            <Box style={{ flex: '1 1 300px', minWidth: '200px' }}>
              <Text size="2" mb="1" weight="medium">Search</Text>
              <TextField.Root
                placeholder="Search by EID, event name, message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="16" width="16" />
                </TextField.Slot>
              </TextField.Root>
            </Box>

            <Box style={{ flex: '0 1 150px', minWidth: '120px' }}>
              <Text size="2" mb="1" weight="medium">Category</Text>
              <Select.Root value={categoryFilter} onValueChange={setCategoryFilter}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All</Select.Item>
                  {categories.map(cat => (
                    <Select.Item key={cat} value={cat}>
                      {cat.replace(/_/g, ' ')}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box style={{ flex: '0 1 150px', minWidth: '120px' }}>
              <Text size="2" mb="1" weight="medium">Context</Text>
              <Select.Root value={contextFilter} onValueChange={setContextFilter}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All</Select.Item>
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
                Clear All Filters
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
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell style={{ width: '40px' }}></Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '100px' }}>EID</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '200px' }}>Event</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '120px' }}>Severity</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ minWidth: '300px' }}>Message</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell style={{ width: '150px' }}>Category</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {findings.map((finding, index) => (
                    <Table.Row
                      key={`${finding.eventId}-${finding.ruleId}-${index}`}
                      onClick={() => handleRowClick(finding)}
                      style={{
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      className="hover-row"
                    >
                      <Table.Cell>
                        <Text size="3">{finding.emoji}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="gray" variant="soft">
                          {finding.eventEid || 'N/A'}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="medium" style={{
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block'
                        }}>
                          {finding.eventName}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={getSeverityColor(finding.severity)} variant="soft">
                          {finding.severity}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" style={{ fontFamily: 'inherit' }}>
                          {finding.message}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
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
        <Flex justify="between" align="center">
          <Text size="1" color="gray">
            {findings.length} findings displayed • {rules.length || 0} rules active
          </Text>
          <Text size="1" color="gray">
            Last updated: {new Date().toLocaleTimeString()}
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

      <style jsx>{`
        .hover-row:hover {
          background-color: var(--gray-3) !important;
        }
      `}</style>
    </Box>
  );
};

export default EventLinter;
