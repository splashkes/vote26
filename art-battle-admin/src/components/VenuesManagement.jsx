import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Button,
  TextField,
  TextArea,
  Dialog,
  Table,
  Badge,
  Select,
  IconButton,
  Spinner,
  AlertDialog
} from '@radix-ui/themes';
import {
  PlusIcon,
  Pencil1Icon,
  TrashIcon,
  ImageIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const VenuesManagement = () => {
  const { user } = useAuth();
  const [venues, setVenues] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingVenue, setEditingVenue] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteVenueId, setDeleteVenueId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    notes: '',
    city_id: '',
    default_capacity: 200
  });

  useEffect(() => {
    fetchVenues();
    fetchCities();
  }, []);

  const fetchVenues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('venues')
        .select(`
          *,
          cities (
            id,
            name,
            countries (
              name,
              code
            )
          ),
          venue_logos (
            id,
            logo_url,
            logo_type,
            display_order
          )
        `)
        .order('name');

      if (error) throw error;
      setVenues(data || []);
    } catch (err) {
      console.error('Error fetching venues:', err);
      setError('Failed to load venues');
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
          countries (
            name,
            code
          )
        `)
        .order('name');

      if (error) throw error;
      setCities(data || []);
    } catch (err) {
      console.error('Error fetching cities:', err);
    }
  };

  const handleOpenDialog = (venue = null) => {
    if (venue) {
      setEditingVenue(venue);
      setFormData({
        name: venue.name || '',
        address: venue.address || '',
        notes: venue.notes || '',
        city_id: venue.city_id || '',
        default_capacity: venue.default_capacity || 200
      });
    } else {
      setEditingVenue(null);
      setFormData({
        name: '',
        address: '',
        notes: '',
        city_id: '',
        default_capacity: 200
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingVenue(null);
    setFormData({
      name: '',
      address: '',
      notes: '',
      city_id: '',
      default_capacity: 200
    });
  };

  const handleSaveVenue = async () => {
    try {
      if (!formData.name || !formData.city_id) {
        alert('Name and City are required');
        return;
      }

      if (editingVenue) {
        // Update existing venue
        const { error } = await supabase
          .from('venues')
          .update(formData)
          .eq('id', editingVenue.id);

        if (error) throw error;
      } else {
        // Create new venue
        const { error } = await supabase
          .from('venues')
          .insert([formData]);

        if (error) throw error;
      }

      await fetchVenues();
      handleCloseDialog();
    } catch (err) {
      console.error('Error saving venue:', err);
      alert('Failed to save venue: ' + err.message);
    }
  };

  const handleDeleteVenue = async (venueId) => {
    try {
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', venueId);

      if (error) throw error;

      await fetchVenues();
      setDeleteVenueId(null);
    } catch (err) {
      console.error('Error deleting venue:', err);
      alert('Failed to delete venue: ' + err.message);
    }
  };

  const filteredVenues = venues.filter(venue => {
    const matchesSearch = !searchTerm ||
      venue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.cities?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCity = selectedCity === 'all' || venue.city_id === selectedCity;

    return matchesSearch && matchesCity;
  });

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ minHeight: '400px' }}>
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
            <Text size="6" weight="bold">Venues Management</Text>
            <Text size="2" color="gray">Manage event venues and their details</Text>
          </Box>
          <Button onClick={() => handleOpenDialog()}>
            <PlusIcon /> Add Venue
          </Button>
        </Flex>

        {/* Filters */}
        <Card>
          <Flex gap="3" align="end">
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium" mb="1">Search</Text>
              <TextField.Root
                placeholder="Search venues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Box>
            <Box style={{ width: '250px' }}>
              <Text size="2" weight="medium" mb="1">Filter by City</Text>
              <Select.Root value={selectedCity} onValueChange={setSelectedCity}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="all">All Cities</Select.Item>
                  {cities.map(city => (
                    <Select.Item key={city.id} value={city.id}>
                      {city.name}, {city.countries?.code}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          </Flex>
        </Card>

        {/* Venues Table */}
        <Card>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>City</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Address</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Capacity</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Logos</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredVenues.map(venue => (
                <Table.Row key={venue.id}>
                  <Table.Cell>
                    <Text weight="medium">{venue.name}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2">
                      {venue.cities?.name}, {venue.cities?.countries?.code}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" color="gray">{venue.address || '-'}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color="blue">{venue.default_capacity}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={venue.venue_logos?.length > 0 ? 'green' : 'gray'}>
                      {venue.venue_logos?.length || 0}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2">
                      <IconButton
                        size="1"
                        variant="ghost"
                        onClick={() => handleOpenDialog(venue)}
                      >
                        <Pencil1Icon />
                      </IconButton>
                      <IconButton
                        size="1"
                        variant="ghost"
                        color="red"
                        onClick={() => setDeleteVenueId(venue.id)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          {filteredVenues.length === 0 && (
            <Flex align="center" justify="center" p="6">
              <Text color="gray">No venues found</Text>
            </Flex>
          )}
        </Card>
      </Flex>

      {/* Add/Edit Dialog */}
      <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>{editingVenue ? 'Edit Venue' : 'Add New Venue'}</Dialog.Title>

          <Flex direction="column" gap="3" mt="4">
            <Box>
              <Text size="2" weight="medium" mb="1">Name *</Text>
              <TextField.Root
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter venue name"
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">City *</Text>
              <Select.Root
                value={formData.city_id}
                onValueChange={(value) => setFormData({ ...formData, city_id: value })}
              >
                <Select.Trigger style={{ width: '100%' }} placeholder="Select city" />
                <Select.Content>
                  {cities.map(city => (
                    <Select.Item key={city.id} value={city.id}>
                      {city.name}, {city.countries?.code}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Address</Text>
              <TextArea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter venue address"
                rows={2}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Default Capacity</Text>
              <TextField.Root
                type="number"
                value={formData.default_capacity}
                onChange={(e) => setFormData({ ...formData, default_capacity: parseInt(e.target.value) || 200 })}
              />
            </Box>

            <Box>
              <Text size="2" weight="medium" mb="1">Notes</Text>
              <TextArea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes about this venue"
                rows={3}
              />
            </Box>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button onClick={handleSaveVenue}>
              {editingVenue ? 'Update' : 'Create'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Delete Confirmation */}
      <AlertDialog.Root open={!!deleteVenueId} onOpenChange={() => setDeleteVenueId(null)}>
        <AlertDialog.Content>
          <AlertDialog.Title>Delete Venue</AlertDialog.Title>
          <AlertDialog.Description>
            Are you sure you want to delete this venue? This action cannot be undone.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={() => handleDeleteVenue(deleteVenueId)}>
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  );
};

export default VenuesManagement;
