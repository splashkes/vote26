import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Heading,
  Text,
  Button,
  Flex,
  Table,
  Badge,
  Callout,
  Dialog,
  TextField,
  Select,
  Spinner,
  AlertDialog
} from '@radix-ui/themes';
import { 
  CheckIcon, 
  ExclamationTriangleIcon, 
  ReloadIcon,
  PlusIcon,
  ClockIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const InvitationManagement = () => {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newInviteOpen, setNewInviteOpen] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  
  const [newInviteForm, setNewInviteForm] = useState({
    email: '',
    level: 'producer',
    notes: ''
  });

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      setError('');
      
      const { data, error: fetchError } = await supabase
        .from('admin_invitation_dashboard')
        .select('*')
        .order('active', { ascending: true })
        .order('invitation_expires_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      setInvitations(data || []);
    } catch (err) {
      console.error('Error loading invitations:', err);
      setError('Failed to load invitations: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNewInvite = async () => {
    if (!newInviteForm.email || !newInviteForm.level) {
      setError('Email and level are required');
      return;
    }

    try {
      setError('');
      setSuccess('');
      
      const { data, error: inviteError } = await supabase.functions.invoke('admin-improved-invite', {
        body: {
          email: newInviteForm.email,
          level: newInviteForm.level,
          notes: newInviteForm.notes
        }
      });

      if (inviteError) throw inviteError;
      if (!data.success) throw new Error(data.error || 'Failed to send invite');

      setSuccess(`Invitation sent to ${newInviteForm.email} successfully!`);
      setNewInviteForm({ email: '', level: 'producer', notes: '' });
      setNewInviteOpen(false);
      loadInvitations(); // Refresh the list
      
    } catch (err) {
      console.error('Error sending invite:', err);
      setError('Failed to send invitation: ' + err.message);
    }
  };

  const handleResendInvite = async (email, userId) => {
    try {
      setResendingId(userId);
      setError('');
      setSuccess('');
      
      const { data, error: resendError } = await supabase.functions.invoke('admin-improved-invite', {
        body: {
          email: email,
          level: 'producer', // Will be preserved from existing record
          notes: `Resent invitation on ${new Date().toISOString()}`
        }
      });

      if (resendError) throw resendError;
      if (!data.success) throw new Error(data.error || 'Failed to resend invite');

      setSuccess(`Invitation resent to ${email} successfully!`);
      loadInvitations(); // Refresh the list
      
    } catch (err) {
      console.error('Error resending invite:', err);
      setError('Failed to resend invitation: ' + err.message);
    } finally {
      setResendingId(null);
    }
  };

  const getStatusBadge = (invitation) => {
    if (invitation.active) {
      return <Badge color="green">Active</Badge>;
    }
    
    if (!invitation.invitation_sent_at) {
      return <Badge color="gray">No invitation sent</Badge>;
    }
    
    if (invitation.status === 'Expired') {
      return <Badge color="red">Expired</Badge>;
    }
    
    if (invitation.status === 'Expiring soon') {
      return <Badge color="orange">Expiring Soon</Badge>;
    }
    
    return <Badge color="blue">Pending</Badge>;
  };

  const formatTimeUntilExpiry = (hours) => {
    if (hours === null || hours === undefined) return '';
    
    if (hours < 0) {
      return `Expired ${Math.abs(hours).toFixed(1)}h ago`;
    } else {
      return `${hours.toFixed(1)}h remaining`;
    }
  };

  const pendingInvitations = invitations.filter(inv => !inv.active);
  const activeUsers = invitations.filter(inv => inv.active);
  const expiringInvitations = pendingInvitations.filter(inv => 
    inv.status === 'Expiring soon' || inv.status === 'Expired'
  );

  if (loading) {
    return (
      <Box p="6">
        <Flex align="center" gap="2">
          <Spinner size="2" />
          <Text>Loading invitation data...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="6">
      <Flex justify="between" align="center" mb="6">
        <Heading size="6">Admin Invitation Management</Heading>
        <Flex gap="2">
          <Button variant="soft" onClick={loadInvitations}>
            <ReloadIcon />
            Refresh
          </Button>
          <Button onClick={() => setNewInviteOpen(true)}>
            <PlusIcon />
            New Invitation
          </Button>
        </Flex>
      </Flex>

      {/* Summary Cards */}
      <Flex gap="4" mb="6">
        <Card style={{ flex: 1 }}>
          <Box p="4">
            <Text size="2" color="gray">Active Admins</Text>
            <Text size="6" weight="bold">{activeUsers.length}</Text>
          </Box>
        </Card>
        <Card style={{ flex: 1 }}>
          <Box p="4">
            <Text size="2" color="gray">Pending Invitations</Text>
            <Text size="6" weight="bold">{pendingInvitations.length}</Text>
          </Box>
        </Card>
        <Card style={{ flex: 1 }}>
          <Box p="4">
            <Text size="2" color="gray">Need Attention</Text>
            <Text size="6" weight="bold" color="red">{expiringInvitations.length}</Text>
          </Box>
        </Card>
      </Flex>

      {/* Status Messages */}
      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {success && (
        <Callout.Root color="green" mb="4">
          <Callout.Icon><CheckIcon /></Callout.Icon>
          <Callout.Text>{success}</Callout.Text>
        </Callout.Root>
      )}

      {/* Expiring/Expired Invitations Alert */}
      {expiringInvitations.length > 0 && (
        <Callout.Root color="orange" mb="4">
          <Callout.Icon><ClockIcon /></Callout.Icon>
          <Callout.Text>
            {expiringInvitations.length} invitation{expiringInvitations.length === 1 ? '' : 's'} need{expiringInvitations.length === 1 ? 's' : ''} attention (expiring soon or expired)
          </Callout.Text>
        </Callout.Root>
      )}

      {/* Invitations Table */}
      <Card>
        <Box p="4">
          <Heading size="4" mb="4">All Invitations</Heading>
          
          {invitations.length === 0 ? (
            <Text color="gray">No invitations found.</Text>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Level</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Sent</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Expiry Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Created By</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {invitations.map((invitation) => (
                  <Table.Row key={invitation.id}>
                    <Table.Cell>
                      <Text weight="medium">{invitation.email}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="soft">{invitation.level}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {getStatusBadge(invitation)}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {invitation.invitation_sent_at 
                          ? new Date(invitation.invitation_sent_at).toLocaleDateString()
                          : 'Not sent'
                        }
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color={invitation.hours_until_expiry_or_since_expired < 0 ? 'red' : 'gray'}>
                        {formatTimeUntilExpiry(invitation.hours_until_expiry_or_since_expired)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">{invitation.created_by || 'System'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {!invitation.active && (
                        <Button 
                          size="1" 
                          variant="soft"
                          onClick={() => handleResendInvite(invitation.email, invitation.id)}
                          loading={resendingId === invitation.id}
                          disabled={resendingId === invitation.id}
                        >
                          {resendingId === invitation.id ? 'Sending...' : 'Resend'}
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </Card>

      {/* New Invitation Dialog */}
      <Dialog.Root open={newInviteOpen} onOpenChange={setNewInviteOpen}>
        <Dialog.Content style={{ maxWidth: '450px' }}>
          <Dialog.Title>Send New Admin Invitation</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Send an invitation to a new admin user. The invitation will be valid for 24 hours.
          </Dialog.Description>

          <Flex direction="column" gap="3">
            <label>
              <Text size="2" weight="medium">Email Address</Text>
              <TextField.Root
                placeholder="admin@example.com"
                value={newInviteForm.email}
                onChange={(e) => setNewInviteForm(prev => ({ ...prev, email: e.target.value }))}
                mt="1"
              />
            </label>

            <label>
              <Text size="2" weight="medium">Admin Level</Text>
              <Select.Root
                value={newInviteForm.level}
                onValueChange={(value) => setNewInviteForm(prev => ({ ...prev, level: value }))}
              >
                <Select.Trigger mt="1" />
                <Select.Content>
                  <Select.Item value="producer">Producer</Select.Item>
                  <Select.Item value="photo">Photo Admin</Select.Item>
                  <Select.Item value="super">Super Admin</Select.Item>
                </Select.Content>
              </Select.Root>
            </label>

            <label>
              <Text size="2" weight="medium">Notes (optional)</Text>
              <TextField.Root
                placeholder="Additional notes about this invitation..."
                value={newInviteForm.notes}
                onChange={(e) => setNewInviteForm(prev => ({ ...prev, notes: e.target.value }))}
                mt="1"
              />
            </label>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleNewInvite}>
              Send Invitation
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default InvitationManagement;