import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Heading,
  Text,
  Flex,
  Button,
  Table,
  Badge,
  Dialog,
  TextField,
  Select,
  TextArea,
  Spinner,
  Callout,
  Switch,
  Grid
} from '@radix-ui/themes';
import { 
  PlusIcon, 
  PersonIcon, 
  EnvelopeClosedIcon, 
  ExclamationTriangleIcon,
  CheckIcon,
  Cross2Icon,
  ReloadIcon,
  PaperPlaneIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

const AdminUsers = () => {
  const { user } = useAuth();
  const [adminUsers, setAdminUsers] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLevel, setUserLevel] = useState(null);
  
  // Modal states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Form states
  const [inviteLoading, setInviteLoading] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [resendingUserId, setResendingUserId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [inviteForm, setInviteForm] = useState({
    email: '',
    level: 'producer',
    cities_access: [],
    notes: ''
  });
  
  const [editForm, setEditForm] = useState({
    level: '',
    cities_access: [],
    active: true,
    notes: ''
  });

  useEffect(() => {
    checkUserLevel();
    fetchAdminUsers();
    fetchCities();
  }, [user]);

  const checkUserLevel = async () => {
    if (!user?.email) return;
    
    try {
      const { data: adminUser } = await supabase
        .from('abhq_admin_users')
        .select('level')
        .eq('email', user.email)
        .eq('active', true)
        .single();
        
      setUserLevel(adminUser?.level);
    } catch (err) {
      console.error('Error checking user level:', err);
    }
  };

  const fetchAdminUsers = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Use the admin function to fetch users (bypasses RLS)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data: response, error } = await supabase.functions.invoke('admin-get-users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;
      if (!response.success) throw new Error(response.error || 'Failed to fetch admin users');

      const data = response.users;
      
      // Get city names for each user
      const usersWithCities = await Promise.all(
        (data || []).map(async (adminUser) => {
          if (adminUser.cities_access && adminUser.cities_access.length > 0) {
            const { data: cityData } = await supabase
              .from('cities')
              .select('id, name, countries(name)')
              .in('id', adminUser.cities_access);
            
            return {
              ...adminUser,
              cities: cityData || []
            };
          }
          return {
            ...adminUser,
            cities: []
          };
        })
      );
      
      console.log('Fetched admin users:', usersWithCities.length, 'users');
      setAdminUsers(usersWithCities);
    } catch (err) {
      console.error('Error fetching admin users:', err);
      setError(`Failed to load admin users: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCities = async () => {
    try {
      const { data, error } = await supabase
        .from('cities')
        .select(`
          id,
          name,
          countries(name, code)
        `)
        .order('name');

      if (error) throw error;
      setCities(data || []);
    } catch (err) {
      console.error('Error fetching cities:', err);
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    
    if (!inviteForm.email.trim()) {
      setError('Email is required');
      return;
    }
    
    setInviteLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Make a direct fetch request to get raw error details
      const session = await supabase.auth.getSession();
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/admin-improved-invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'Content-Type': 'application/json',
          'apikey': supabase.supabaseKey
        },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          level: inviteForm.level,
          cities_access: inviteForm.cities_access,
          notes: inviteForm.notes.trim()
        })
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);
      
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed response data:', data);
      } catch (parseErr) {
        console.error('Failed to parse response as JSON:', parseErr);
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      if (!response.ok) {
        console.error('DETAILED ERROR FROM FUNCTION:', data);
        throw new Error(data.error || `HTTP ${response.status}: ${responseText}`);
      }

      // Simulate the original Supabase response format
      const inviteError = null;

      if (inviteError) {
        console.error('Invite error details:', inviteError);
        
        // Check if this is a FunctionsHttpError and extract detailed response
        if (inviteError instanceof FunctionsHttpError) {
          try {
            const errorDetails = await inviteError.context.json();
            console.error('DETAILED ERROR RESPONSE:', errorDetails);
            console.error('Error message:', errorDetails.message);
            console.error('Error code:', errorDetails.code);
            console.error('Error hint:', errorDetails.hint);
            console.error('Insert data:', errorDetails.insertData);
          } catch (parseError) {
            console.error('Failed to parse error details:', parseError);
            console.error('Raw error context:', inviteError.context);
          }
        }
        
        console.error('Full error object:', JSON.stringify(inviteError, null, 2));
        throw inviteError;
      }
      if (!data.success) {
        console.error('Response data error:', data);
        throw new Error(data.error || 'Failed to send invite');
      }

      console.log('Invite successful, refreshing user list...');
      setSuccess(`Invite sent successfully to ${inviteForm.email}`);
      setInviteForm({ email: '', level: 'producer', cities_access: [], notes: '' });
      
      // Small delay to ensure database transaction completes
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh the users list with force refresh
      await fetchAdminUsers(true);
      console.log('User list refreshed after invite');
      setInviteModalOpen(false);
      
      // Clear success message after a delay
      setTimeout(() => {
        setSuccess('');
      }, 3000);

    } catch (err) {
      console.error('=== INVITE ERROR ANALYSIS ===');
      console.error('Error type:', err.constructor.name);
      console.error('Error message:', err.message);
      console.error('Error instanceof FunctionsHttpError:', err instanceof FunctionsHttpError);
      console.error('Full error object:', err);
      
      // Try to extract detailed error response
      if (err instanceof FunctionsHttpError && err.context) {
        try {
          const rawResponse = await err.context.text();
          console.error('Raw response text:', rawResponse);
          try {
            const parsedError = JSON.parse(rawResponse);
            console.error('PARSED ERROR DETAILS:', parsedError);
          } catch (parseErr) {
            console.error('Could not parse as JSON:', parseErr);
          }
        } catch (contextErr) {
          console.error('Could not read context:', contextErr);
        }
      }
      
      console.error('=== END ERROR ANALYSIS ===');
      setError(err.message || 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedUser) return;
    
    setUpdateLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const { error: updateError } = await supabase
        .from('abhq_admin_users')
        .update({
          level: editForm.level,
          cities_access: editForm.cities_access,
          active: editForm.active,
          notes: editForm.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);

      if (updateError) throw updateError;

      setSuccess('User updated successfully');
      
      // Refresh the users list immediately with force refresh
      await fetchAdminUsers(true);
      setEditModalOpen(false);
      setSelectedUser(null);
      
      // Clear success message after a delay
      setTimeout(() => {
        setSuccess('');
      }, 3000);

    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setUpdateLoading(false);
    }
  };

  const openEditModal = (adminUser) => {
    setSelectedUser(adminUser);
    setEditForm({
      level: adminUser.level,
      cities_access: adminUser.cities_access || [],
      active: adminUser.active,
      notes: adminUser.notes || ''
    });
    setEditModalOpen(true);
    setError('');
    setSuccess('');
  };

  const handleResendInvite = async (adminUser) => {
    setResendingUserId(adminUser.id);
    setError('');
    setSuccess('');
    
    try {
      const { data, error: resendError } = await supabase.functions.invoke('admin-improved-invite', {
        body: {
          email: adminUser.email,
          level: adminUser.level,
          cities_access: adminUser.cities_access || [],
          notes: `Resent invitation on ${new Date().toISOString()}`
        }
      });

      if (resendError) throw resendError;
      if (!data.success) throw new Error(data.error || 'Failed to resend invite');

      setSuccess(`Invitation resent to ${adminUser.email} successfully!`);
      await fetchAdminUsers(true); // Refresh the list
      
      // Clear success message after a delay
      setTimeout(() => {
        setSuccess('');
      }, 3000);
      
    } catch (err) {
      console.error('Error resending invite:', err);
      setError('Failed to resend invitation: ' + err.message);
    } finally {
      setResendingUserId(null);
    }
  };

  const handleCityToggle = (cityId, formType) => {
    const form = formType === 'invite' ? inviteForm : editForm;
    const setForm = formType === 'invite' ? setInviteForm : setEditForm;
    
    const currentCities = form.cities_access || [];
    const newCities = currentCities.includes(cityId)
      ? currentCities.filter(id => id !== cityId)
      : [...currentCities, cityId];
    
    setForm(prev => ({ ...prev, cities_access: newCities }));
  };

  // Only show to super admins
  if (userLevel !== 'super') {
    return (
      <Box p="4">
        <Card>
          <Box p="6" style={{ textAlign: 'center' }}>
            <ExclamationTriangleIcon size={32} style={{ color: 'var(--red-9)', marginBottom: '16px' }} />
            <Heading size="4" mb="2">Access Restricted</Heading>
            <Text color="gray">Only super administrators can manage admin users.</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="6">Admin Users</Heading>
            <Text color="gray" size="2">
              Manage administrator access and permissions
            </Text>
          </Box>
          <Flex gap="2">
            <Button 
              variant="soft" 
              onClick={() => fetchAdminUsers(true)}
              disabled={loading}
            >
              <ReloadIcon />
              Refresh
            </Button>
            <Button onClick={() => {
              setInviteModalOpen(true);
              setError('');
              setSuccess('');
            }}>
              <PlusIcon />
              Invite Admin User
            </Button>
          </Flex>
        </Flex>

        {/* Success/Error Messages */}
        {success && (
          <Callout.Root color="green">
            <Callout.Icon><CheckIcon /></Callout.Icon>
            <Callout.Text>{success}</Callout.Text>
          </Callout.Root>
        )}

        {error && (
          <Callout.Root color="red">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Admin Users Table */}
        <Card>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>User</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Level</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>City Access</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last Login</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {adminUsers.map((adminUser) => (
                <Table.Row key={adminUser.id}>
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <PersonIcon />
                      <Box>
                        <Text weight="bold">{adminUser.email}</Text>
                        {adminUser.notes && (
                          <Text size="1" color="gray" style={{ display: 'block' }}>
                            {adminUser.notes}
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge 
                      color={
                        adminUser.level === 'super' ? 'red' :
                        adminUser.level === 'producer' ? 'blue' :
                        adminUser.level === 'photo' ? 'green' :
                        'gray'
                      }
                    >
                      {adminUser.level}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {adminUser.cities?.length > 0 ? (
                      <Flex direction="column" gap="1">
                        {adminUser.cities.map((city) => (
                          <Text key={city.id} size="1">
                            {city.name}, {city.countries?.name}
                          </Text>
                        ))}
                      </Flex>
                    ) : (
                      <Badge color="purple">All Cities</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={adminUser.active ? 'green' : 'red'}>
                      {adminUser.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {adminUser.last_sign_in_at ? (
                      <Text size="1" color="gray">
                        {new Date(adminUser.last_sign_in_at).toLocaleString()}
                      </Text>
                    ) : (
                      <Text size="1" color="orange">
                        Never logged in
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2">
                      <Button 
                        size="1" 
                        variant="soft"
                        onClick={() => openEditModal(adminUser)}
                      >
                        Edit
                      </Button>
                      {!adminUser.active && (
                        <Button 
                          size="1" 
                          variant="soft"
                          color="blue"
                          onClick={() => handleResendInvite(adminUser)}
                          loading={resendingUserId === adminUser.id}
                          disabled={resendingUserId === adminUser.id}
                        >
                          <PaperPlaneIcon />
                          {resendingUserId === adminUser.id ? 'Sending...' : 'Resend Invite'}
                        </Button>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          
          {adminUsers.length === 0 && (
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text color="gray">No admin users found.</Text>
            </Box>
          )}
        </Card>
      </Flex>

      {/* Invite User Modal */}
      <Dialog.Root open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>
            <Flex align="center" gap="2">
              <EnvelopeClosedIcon />
              Invite Admin User
            </Flex>
          </Dialog.Title>
          
          <form onSubmit={handleInviteSubmit}>
            <Flex direction="column" gap="4" mt="4">
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Email Address *
                </Text>
                <TextField.Root
                  type="email"
                  placeholder="user@example.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  disabled={inviteLoading}
                />
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Admin Level *
                </Text>
                <Select.Root 
                  value={inviteForm.level} 
                  onValueChange={(value) => setInviteForm(prev => ({ ...prev, level: value }))}
                  disabled={inviteLoading}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="producer">Producer</Select.Item>
                    <Select.Item value="photo">Photo</Select.Item>
                    <Select.Item value="voting">Voting</Select.Item>
                    <Select.Item value="super">Super Admin</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                  City Access (leave empty for all cities)
                </Text>
                <Grid columns="2" gap="2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {cities.map((city) => (
                    <Flex key={city.id} align="center" gap="2">
                      <Switch
                        checked={inviteForm.cities_access.includes(city.id)}
                        onCheckedChange={() => handleCityToggle(city.id, 'invite')}
                        disabled={inviteLoading}
                        size="1"
                      />
                      <Text size="2">
                        {city.name}, {city.countries?.name}
                      </Text>
                    </Flex>
                  ))}
                </Grid>
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Notes
                </Text>
                <TextArea
                  placeholder="Optional notes about this admin user..."
                  value={inviteForm.notes}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, notes: e.target.value }))}
                  disabled={inviteLoading}
                  rows={3}
                />
              </Box>

              <Flex justify="end" gap="3" mt="4">
                <Dialog.Close>
                  <Button variant="soft" disabled={inviteLoading}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" loading={inviteLoading}>
                  Send Invite
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      {/* Edit User Modal */}
      <Dialog.Root open={editModalOpen} onOpenChange={setEditModalOpen}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>
            <Flex align="center" gap="2" justify="between">
              <Flex align="center" gap="2">
                <PersonIcon />
                Edit Admin User
              </Flex>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>
          
          {selectedUser && (
            <form onSubmit={handleEditSubmit}>
              <Flex direction="column" gap="4" mt="4">
                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Email
                  </Text>
                  <TextField.Root
                    value={selectedUser.email}
                    disabled
                    style={{ backgroundColor: 'var(--gray-3)' }}
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Admin Level *
                  </Text>
                  <Select.Root 
                    value={editForm.level} 
                    onValueChange={(value) => setEditForm(prev => ({ ...prev, level: value }))}
                    disabled={updateLoading}
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="producer">Producer</Select.Item>
                      <Select.Item value="photo">Photo</Select.Item>
                      <Select.Item value="voting">Voting</Select.Item>
                      <Select.Item value="super">Super Admin</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>

                <Box>
                  <Flex align="center" gap="3" mb="3">
                    <Switch
                      checked={editForm.active}
                      onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, active: checked }))}
                      disabled={updateLoading}
                    />
                    <Text size="2" weight="medium">
                      Active (can log in)
                    </Text>
                  </Flex>
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                    City Access (leave empty for all cities)
                  </Text>
                  <Grid columns="2" gap="2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {cities.map((city) => (
                      <Flex key={city.id} align="center" gap="2">
                        <Switch
                          checked={editForm.cities_access.includes(city.id)}
                          onCheckedChange={() => handleCityToggle(city.id, 'edit')}
                          disabled={updateLoading}
                          size="1"
                        />
                        <Text size="2">
                          {city.name}, {city.countries?.name}
                        </Text>
                      </Flex>
                    ))}
                  </Grid>
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Notes
                  </Text>
                  <TextArea
                    placeholder="Notes about this admin user..."
                    value={editForm.notes}
                    onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    disabled={updateLoading}
                    rows={3}
                  />
                </Box>

                <Flex justify="end" gap="3" mt="4">
                  <Dialog.Close>
                    <Button variant="soft" disabled={updateLoading}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" loading={updateLoading}>
                    Update User
                  </Button>
                </Flex>
              </Flex>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default AdminUsers;