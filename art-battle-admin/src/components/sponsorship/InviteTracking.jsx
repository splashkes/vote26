import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Heading,
  Text,
  Table,
  Badge,
  Button,
  Flex,
  Dialog,
  Tabs,
  Grid,
  Select,
  TextField,
  ScrollArea
} from '@radix-ui/themes';
import { supabase } from '../../lib/supabase';
import { MagnifyingGlassIcon, CalendarIcon, EnvelopeClosedIcon, ReloadIcon } from '@radix-ui/react-icons';

const InviteTracking = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvite, setSelectedInvite] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [packageTemplates, setPackageTemplates] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadInvites();
    loadPackageTemplates();
  }, []);

  const loadPackageTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('sponsorship_package_templates')
        .select('id, name, category');

      if (!error && data) {
        setPackageTemplates(data);
      }
    } catch (err) {
      console.error('Error loading package templates:', err);
    }
  };

  const loadInvites = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sponsorship_invites')
        .select(`
          *,
          events (
            id,
            name,
            event_start_datetime,
            cities (
              name
            )
          ),
          sponsorship_interactions (
            id,
            interaction_type,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate status for each invite
      const invitesWithStatus = (data || []).map(invite => {
        const interactions = invite.sponsorship_interactions || [];
        const hasView = interactions.some(i => i.interaction_type === 'view');
        const hasTierSelect = interactions.some(i => i.interaction_type === 'tier_select');
        const hasPackageClick = interactions.some(i => i.interaction_type === 'package_click');
        const hasCheckout = interactions.some(i => i.interaction_type === 'checkout_initiated');

        const isExpired = invite.valid_until && new Date(invite.valid_until) < new Date();
        const isUsed = invite.use_count >= invite.max_uses;

        let status = 'pending';
        if (isUsed) status = 'used';
        else if (isExpired) status = 'expired';
        else if (hasCheckout) status = 'checkout_initiated';
        else if (hasPackageClick) status = 'engaged';
        else if (hasTierSelect) status = 'browsing';
        else if (hasView) status = 'viewed';

        const lastInteraction = interactions.length > 0
          ? new Date(Math.max(...interactions.map(i => new Date(i.created_at))))
          : null;

        // Most recent activity is either last interaction or created date, whichever is newer
        const mostRecentActivity = lastInteraction
          ? new Date(Math.max(lastInteraction, new Date(invite.created_at)))
          : new Date(invite.created_at);

        return {
          ...invite,
          status,
          interaction_count: interactions.length,
          last_interaction: lastInteraction,
          most_recent_activity: mostRecentActivity
        };
      });

      // Sort by most recent activity (interactions or creation time)
      invitesWithStatus.sort((a, b) => b.most_recent_activity - a.most_recent_activity);

      setInvites(invitesWithStatus);
    } catch (err) {
      console.error('Error loading invites:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadInviteDetails = async (invite) => {
    setSelectedInvite(invite);

    // Load detailed interactions
    const { data, error } = await supabase
      .from('sponsorship_interactions')
      .select('*')
      .eq('invite_id', invite.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInteractions(data);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': 'gray',
      'viewed': 'blue',
      'browsing': 'cyan',
      'engaged': 'green',
      'checkout_initiated': 'orange',
      'used': 'purple',
      'expired': 'red'
    };
    return colors[status] || 'gray';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'pending': 'Not Viewed',
      'viewed': 'Viewed',
      'browsing': 'Browsing',
      'engaged': 'Package Selected',
      'checkout_initiated': 'Checkout Started',
      'used': 'Completed',
      'expired': 'Expired'
    };
    return labels[status] || status;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const copyInviteLink = (hash) => {
    const url = `https://artb.art/sponsor/${hash}`;
    navigator.clipboard.writeText(url);
    // You could add a toast notification here
  };

  const formatInteractionMetadata = (interaction) => {
    if (!interaction.metadata || Object.keys(interaction.metadata).length === 0) {
      return '-';
    }

    const metadata = interaction.metadata;

    // Handle addon_select interaction type
    if (interaction.interaction_type === 'addon_select' && metadata.addon_ids) {
      const addonNames = metadata.addon_ids.map(id => {
        const template = packageTemplates.find(t => t.id === id);
        return template ? template.name : id;
      });

      return (
        <Flex direction="column" gap="1">
          <Text size="1" weight="bold">Addons Selected ({metadata.addon_count || addonNames.length}):</Text>
          {addonNames.map((name, idx) => (
            <Text key={idx} size="1">• {name}</Text>
          ))}
        </Flex>
      );
    }

    // Handle package_click interaction type
    if (interaction.interaction_type === 'package_click' && interaction.package_id) {
      const template = packageTemplates.find(t => t.id === interaction.package_id);
      if (template) {
        return <Text size="1">Package: {template.name}</Text>;
      }
    }

    // Default: show JSON
    return <Text size="1" style={{ fontFamily: 'monospace' }}>{JSON.stringify(metadata)}</Text>;
  };

  const filteredInvites = invites.filter(invite => {
    const matchesStatus = filterStatus === 'all' || invite.status === filterStatus;
    const matchesSearch = !searchTerm ||
      invite.prospect_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invite.prospect_company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invite.prospect_email?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const getConversionFunnel = () => {
    const total = invites.length;
    const viewed = invites.filter(i => i.status !== 'pending' && i.status !== 'expired').length;
    const browsing = invites.filter(i => ['browsing', 'engaged', 'checkout_initiated', 'used'].includes(i.status)).length;
    const engaged = invites.filter(i => ['engaged', 'checkout_initiated', 'used'].includes(i.status)).length;
    const checkout = invites.filter(i => ['checkout_initiated', 'used'].includes(i.status)).length;
    const completed = invites.filter(i => i.status === 'used').length;

    return { total, viewed, browsing, engaged, checkout, completed };
  };

  const funnel = getConversionFunnel();

  return (
    <Box>
      {/* Header Stats */}
      <Grid columns="5" gap="4" mb="4">
        <Card>
          <Flex direction="column" gap="1">
            <Text size="2" style={{ color: 'var(--gray-11)' }}>Total Invites</Text>
            <Heading size="6">{funnel.total}</Heading>
          </Flex>
        </Card>
        <Card style={{ background: 'var(--blue-2)' }}>
          <Flex direction="column" gap="1">
            <Text size="2" style={{ color: 'var(--blue-11)' }}>Viewed</Text>
            <Heading size="6" style={{ color: 'var(--blue-11)' }}>
              {funnel.viewed} <Text size="2">({funnel.total > 0 ? Math.round(funnel.viewed / funnel.total * 100) : 0}%)</Text>
            </Heading>
          </Flex>
        </Card>
        <Card style={{ background: 'var(--cyan-2)' }}>
          <Flex direction="column" gap="1">
            <Text size="2" style={{ color: 'var(--cyan-11)' }}>Browsing</Text>
            <Heading size="6" style={{ color: 'var(--cyan-11)' }}>
              {funnel.browsing} <Text size="2">({funnel.total > 0 ? Math.round(funnel.browsing / funnel.total * 100) : 0}%)</Text>
            </Heading>
          </Flex>
        </Card>
        <Card style={{ background: 'var(--green-2)' }}>
          <Flex direction="column" gap="1">
            <Text size="2" style={{ color: 'var(--green-11)' }}>Engaged</Text>
            <Heading size="6" style={{ color: 'var(--green-11)' }}>
              {funnel.engaged} <Text size="2">({funnel.total > 0 ? Math.round(funnel.engaged / funnel.total * 100) : 0}%)</Text>
            </Heading>
          </Flex>
        </Card>
        <Card style={{ background: 'var(--purple-2)' }}>
          <Flex direction="column" gap="1">
            <Text size="2" style={{ color: 'var(--purple-11)' }}>Completed</Text>
            <Heading size="6" style={{ color: 'var(--purple-11)' }}>
              {funnel.completed} <Text size="2">({funnel.total > 0 ? Math.round(funnel.completed / funnel.total * 100) : 0}%)</Text>
            </Heading>
          </Flex>
        </Card>
      </Grid>

      {/* Filters */}
      <Card mb="4">
        <Flex gap="3" align="center">
          <TextField.Root
            placeholder="Search by name, company, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1 }}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
          </TextField.Root>

          <Select.Root value={filterStatus} onValueChange={setFilterStatus}>
            <Select.Trigger style={{ width: '200px' }} />
            <Select.Content>
              <Select.Item value="all">All Statuses</Select.Item>
              <Select.Item value="pending">Not Viewed</Select.Item>
              <Select.Item value="viewed">Viewed</Select.Item>
              <Select.Item value="browsing">Browsing</Select.Item>
              <Select.Item value="engaged">Package Selected</Select.Item>
              <Select.Item value="checkout_initiated">Checkout Started</Select.Item>
              <Select.Item value="used">Completed</Select.Item>
              <Select.Item value="expired">Expired</Select.Item>
            </Select.Content>
          </Select.Root>

          <Button onClick={loadInvites} variant="soft">
            <ReloadIcon width="16" height="16" />
            Refresh
          </Button>
        </Flex>
      </Card>

      {/* Invites Table */}
      <Card>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Prospect</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last Activity</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {loading ? (
              <Table.Row>
                <Table.Cell colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>Loading invites...</Text>
                </Table.Cell>
              </Table.Row>
            ) : filteredInvites.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>No invites found</Text>
                </Table.Cell>
              </Table.Row>
            ) : (
              filteredInvites.map(invite => (
                <Table.Row key={invite.id}>
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Text weight="bold">{invite.prospect_company || invite.prospect_name || 'Unknown'}</Text>
                      {invite.prospect_email && (
                        <Text size="1" style={{ color: 'var(--gray-11)' }}>
                          <EnvelopeClosedIcon width="12" height="12" style={{ display: 'inline', marginRight: '4px' }} />
                          {invite.prospect_email}
                        </Text>
                      )}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Text size="2">{invite.events?.name || 'Unknown Event'}</Text>
                      <Text size="1" style={{ color: 'var(--gray-11)' }}>
                        {invite.events?.cities?.name || 'Unknown City'}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Badge color={getStatusColor(invite.status)}>
                        {getStatusLabel(invite.status).toUpperCase()}
                      </Badge>
                      <Text size="1" style={{ color: 'var(--gray-11)' }}>
                        {invite.interaction_count} clicks
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ color: 'var(--gray-11)' }}>
                      {formatTimeAgo(invite.last_interaction)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2">
                      <Button size="1" variant="soft" onClick={() => loadInviteDetails(invite)}>
                        Details
                      </Button>
                      <Button size="1" variant="outline" onClick={() => copyInviteLink(invite.hash)}>
                        Copy Link
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      </Card>

      {/* Detail Modal */}
      <Dialog.Root open={!!selectedInvite} onOpenChange={() => setSelectedInvite(null)}>
        <Dialog.Content style={{ maxWidth: '900px' }}>
          <Dialog.Title>Invite Details</Dialog.Title>

          {selectedInvite && (
            <Tabs.Root defaultValue="overview">
              <Tabs.List>
                <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
                <Tabs.Trigger value="interactions">Interactions ({interactions.length})</Tabs.Trigger>
                <Tabs.Trigger value="link">Share Link</Tabs.Trigger>
              </Tabs.List>

              <Box pt="4">
                <Tabs.Content value="overview">
                  <Flex direction="column" gap="4">
                    <Grid columns="2" gap="4">
                      <Box>
                        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>Prospect Information</Text>
                        <Flex direction="column" gap="2">
                          <Text size="2"><strong>Company:</strong> {selectedInvite.prospect_company || 'N/A'}</Text>
                          <Text size="2"><strong>Name:</strong> {selectedInvite.prospect_name || 'N/A'}</Text>
                          <Text size="2"><strong>Email:</strong> {selectedInvite.prospect_email || 'N/A'}</Text>
                          <Text size="2"><strong>Phone:</strong> {selectedInvite.prospect_phone || 'N/A'}</Text>
                        </Flex>
                      </Box>

                      <Box>
                        <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>Invite Settings</Text>
                        <Flex direction="column" gap="2">
                          <Text size="2"><strong>Status:</strong> <Badge color={getStatusColor(selectedInvite.status)}>{getStatusLabel(selectedInvite.status)}</Badge></Text>
                          <Text size="2"><strong>Discount:</strong> {selectedInvite.discount_percent}%</Text>
                          <Text size="2"><strong>Valid Until:</strong> {formatDate(selectedInvite.valid_until)}</Text>
                          <Text size="2"><strong>Uses:</strong> {selectedInvite.use_count} / {selectedInvite.max_uses}</Text>
                          <Text size="2"><strong>Created:</strong> {formatDate(selectedInvite.created_at)}</Text>
                        </Flex>
                      </Box>
                    </Grid>

                    <Box>
                      <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>Event Information</Text>
                      <Flex direction="column" gap="2">
                        <Text size="2"><strong>Event:</strong> {selectedInvite.events?.name}</Text>
                        <Text size="2"><strong>City:</strong> {selectedInvite.events?.cities?.name}</Text>
                        <Text size="2"><strong>Date:</strong> {formatDate(selectedInvite.events?.event_start_datetime)}</Text>
                      </Flex>
                    </Box>
                  </Flex>
                </Tabs.Content>

                <Tabs.Content value="interactions">
                  <ScrollArea style={{ height: '400px' }}>
                    <Table.Root>
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Time</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>IP Address</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Details</Table.ColumnHeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {interactions.map(interaction => (
                          <Table.Row key={interaction.id}>
                            <Table.Cell>
                              <Badge color="blue">{interaction.interaction_type}</Badge>
                            </Table.Cell>
                            <Table.Cell>
                              <Text size="1">{formatDate(interaction.created_at)}</Text>
                            </Table.Cell>
                            <Table.Cell>
                              <Text size="1" style={{ fontFamily: 'monospace' }}>
                                {interaction.ip_address?.split(',')[0] || 'N/A'}
                              </Text>
                            </Table.Cell>
                            <Table.Cell>
                              {formatInteractionMetadata(interaction)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </ScrollArea>
                </Tabs.Content>

                <Tabs.Content value="link">
                  <Flex direction="column" gap="4">
                    <Box>
                      <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>Invite Link</Text>
                      <Card style={{ background: 'var(--gray-3)', padding: '1rem' }}>
                        <Text size="2" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          https://artb.art/sponsor/{selectedInvite.hash}
                        </Text>
                      </Card>
                    </Box>
                    <Button onClick={() => copyInviteLink(selectedInvite.hash)}>
                      Copy to Clipboard
                    </Button>
                  </Flex>
                </Tabs.Content>
              </Box>
            </Tabs.Root>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default InviteTracking;
