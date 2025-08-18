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
  Cross2Icon 
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

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

  const fetchAdminUsers = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('abhq_admin_users')
        .select(`
          id,
          user_id,
          email,
          level,
          cities_access,
          active,
          created_at,
          created_by,
          notes
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
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
      
      setAdminUsers(usersWithCities);
    } catch (err) {
      console.error('Error fetching admin users:', err);
      setError('Failed to load admin users');
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
      const { data, error: inviteError } = await supabase.functions.invoke('admin-invite-user', {
        body: {
          email: inviteForm.email.trim(),
          level: inviteForm.level,
          cities_access: inviteForm.cities_access,
          notes: inviteForm.notes.trim()
        }
      });

      if (inviteError) throw inviteError;
      if (!data.success) throw new Error(data.error || 'Failed to send invite');

      setSuccess(`Invite sent successfully to ${inviteForm.email}`);
      setInviteForm({ email: '', level: 'producer', cities_access: [], notes: '' });
      
      // Refresh the users list
      setTimeout(() => {
        fetchAdminUsers();
        setInviteModalOpen(false);
        setSuccess('');
      }, 2000);

    } catch (err) {
      console.error('Error sending invite:', err);
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
      
      // Refresh the users list
      setTimeout(() => {
        fetchAdminUsers();
        setEditModalOpen(false);
        setSelectedUser(null);
        setSuccess('');
      }, 1500);

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
          <Button onClick={() => {
            setInviteModalOpen(true);
            setError('');
            setSuccess('');
          }}>
            <PlusIcon />
            Invite Admin User
          </Button>
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
                <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
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
                    <Text size="1" color="gray">
                      {new Date(adminUser.created_at).toLocaleDateString()}
                    </Text>
                    {adminUser.created_by && (
                      <Text size="1" color="gray" style={{ display: 'block' }}>
                        by {adminUser.created_by}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Button 
                      size="1" 
                      variant="soft"
                      onClick={() => openEditModal(adminUser)}
                    >
                      Edit
                    </Button>
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