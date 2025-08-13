import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Heading,
  Grid,
  TextField,
  Select,
  Separator,
  Dialog
} from '@radix-ui/themes';
import {
  PersonIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Pencil1Icon,
  InstagramLogoIcon,
  EnvelopeClosedIcon,
  ExternalLinkIcon,
  BarChartIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import EventSearch from './EventSearch';

const AllArtists = () => {
  const { user, adminEvents } = useAuth();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterPerformance, setFilterPerformance] = useState('all');
  const [selectedEventFilter, setSelectedEventFilter] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    // Simulate loading all artists across the system
    setTimeout(() => {
      setArtists([
        {
          id: 1,
          name: 'Sarah Chen',
          email: 'sarah@example.com',
          phone: '+1-555-0123',
          instagram: '@sarahchen_art',
          location: 'Toronto, ON',
          bio: 'Contemporary artist specializing in urban landscapes',
          profileImage: '/api/placeholder/150/150',
          totalEvents: 8,
          wins: 3,
          winRate: 37.5,
          totalVotes: 892,
          averageVotes: 111.5,
          auctionEarnings: 2340,
          topSale: 650,
          recentEvents: ['AB3001', 'AB2998', 'AB2995'],
          status: 'active',
          joinDate: '2023-03-15',
          lastEvent: '2024-01-15'
        },
        {
          id: 2,
          name: 'Mike Rodriguez',
          email: 'mike.r@example.com',
          phone: '+1-555-0456',
          instagram: '@mikerodart',
          location: 'Vancouver, BC',
          bio: 'Abstract expressionist with focus on color theory',
          profileImage: '/api/placeholder/150/150',
          totalEvents: 12,
          wins: 5,
          winRate: 41.7,
          totalVotes: 1456,
          averageVotes: 121.3,
          auctionEarnings: 3890,
          topSale: 850,
          recentEvents: ['AB3002', 'AB3001', 'AB2999'],
          status: 'active',
          joinDate: '2022-11-08',
          lastEvent: '2024-01-16'
        },
        {
          id: 3,
          name: 'Emma Thompson',
          email: 'emma.t@example.com',
          phone: '+1-555-0789',
          instagram: '@emmathompsonart',
          location: 'Montreal, QC',
          bio: 'Mixed media artist exploring social themes',
          profileImage: '/api/placeholder/150/150',
          totalEvents: 6,
          wins: 1,
          winRate: 16.7,
          totalVotes: 567,
          averageVotes: 94.5,
          auctionEarnings: 1200,
          topSale: 400,
          recentEvents: ['AB3000', 'AB2997', 'AB2994'],
          status: 'active',
          joinDate: '2023-07-22',
          lastEvent: '2024-01-10'
        },
        {
          id: 4,
          name: 'James Wilson',
          email: 'james.wilson@example.com',
          phone: '+1-555-0321',
          instagram: '@jwilsonart',
          location: 'Calgary, AB',
          bio: 'Watercolor specialist with nature focus',
          profileImage: '/api/placeholder/150/150',
          totalEvents: 4,
          wins: 2,
          winRate: 50.0,
          totalVotes: 378,
          averageVotes: 94.5,
          auctionEarnings: 1850,
          topSale: 550,
          recentEvents: ['AB2996', 'AB2993', 'AB2990'],
          status: 'inactive',
          joinDate: '2023-09-10',
          lastEvent: '2023-12-15'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  // Filter artists based on search and filters
  const filteredArtists = artists.filter(artist => {
    const matchesSearch = !searchTerm || 
      artist.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artist.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artist.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLocation = filterLocation === 'all' || artist.location.includes(filterLocation);
    const matchesPerformance = filterPerformance === 'all' || 
      (filterPerformance === 'high' && artist.winRate > 35) ||
      (filterPerformance === 'medium' && artist.winRate > 15 && artist.winRate <= 35) ||
      (filterPerformance === 'low' && artist.winRate <= 15);

    const matchesEvent = !selectedEventFilter || artist.recentEvents.includes(selectedEventFilter);
    
    return matchesSearch && matchesLocation && matchesPerformance && matchesEvent;
  });

  const getPerformanceBadge = (winRate) => {
    if (winRate > 35) return <Badge color="green">High Performer</Badge>;
    if (winRate > 15) return <Badge color="blue">Good</Badge>;
    return <Badge color="gray">Developing</Badge>;
  };

  const getStatusBadge = (status) => {
    return status === 'active' 
      ? <Badge color="green">Active</Badge>
      : <Badge color="gray">Inactive</Badge>;
  };

  const openArtistDetail = (artist) => {
    setSelectedArtist(artist);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <Box p="4">
        <Text size="3">Loading artists...</Text>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="6">
        {/* Header */}
        <Box>
          <Flex align="center" gap="2" mb="2">
            <PersonIcon size={20} />
            <Heading size="6">All Artists</Heading>
          </Flex>
          <Text color="gray" size="3">
            Manage artists across all Art Battle events
          </Text>
        </Box>

        {/* Filters and Search */}
        <Card>
          <Box p="4">
            <Grid columns="5" gap="3" align="end">
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Search Artists
                </Text>
                <TextField.Root
                  placeholder="Search by name, location, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Location
                </Text>
                <Select.Root value={filterLocation} onValueChange={setFilterLocation}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Locations</Select.Item>
                    <Select.Item value="Toronto">Toronto, ON</Select.Item>
                    <Select.Item value="Vancouver">Vancouver, BC</Select.Item>
                    <Select.Item value="Montreal">Montreal, QC</Select.Item>
                    <Select.Item value="Calgary">Calgary, AB</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Performance
                </Text>
                <Select.Root value={filterPerformance} onValueChange={setFilterPerformance}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Performance</Select.Item>
                    <Select.Item value="high">High (35%+ wins)</Select.Item>
                    <Select.Item value="medium">Good (15-35% wins)</Select.Item>
                    <Select.Item value="low">Developing (&lt;15% wins)</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Filter by Event
                </Text>
                <EventSearch 
                  onSelectEvent={(event) => setSelectedEventFilter(event.event_eid || event.eid)}
                  selectedEventId={selectedEventFilter}
                />
              </Box>
              
              <Button>
                <PlusIcon />
                Add Artist
              </Button>
            </Grid>
          </Box>
        </Card>

        {/* Artists Grid */}
        <Grid columns="3" gap="4">
          {filteredArtists.map((artist) => (
            <Card key={artist.id} style={{ cursor: 'pointer' }} onClick={() => openArtistDetail(artist)}>
              <Box p="4">
                <Flex direction="column" gap="3">
                  {/* Artist Header */}
                  <Flex align="start" gap="3">
                    <Box style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--gray-4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <PersonIcon size={24} color="var(--gray-8)" />
                    </Box>
                    <Box style={{ flex: 1 }}>
                      <Text size="3" weight="bold" mb="1" style={{ display: 'block' }}>
                        {artist.name}
                      </Text>
                      <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>
                        {artist.location}
                      </Text>
                      <Flex gap="2">
                        {getStatusBadge(artist.status)}
                        {getPerformanceBadge(artist.winRate)}
                      </Flex>
                    </Box>
                  </Flex>
                  
                  {/* Performance Stats */}
                  <Box>
                    <Grid columns="3" gap="3">
                      <Box style={{ textAlign: 'center' }}>
                        <Text size="3" weight="bold" style={{ display: 'block' }}>
                          {artist.totalEvents}
                        </Text>
                        <Text size="1" color="gray">Events</Text>
                      </Box>
                      <Box style={{ textAlign: 'center' }}>
                        <Text size="3" weight="bold" style={{ display: 'block' }}>
                          {artist.wins}
                        </Text>
                        <Text size="1" color="gray">Wins</Text>
                      </Box>
                      <Box style={{ textAlign: 'center' }}>
                        <Text size="3" weight="bold" style={{ display: 'block' }}>
                          {artist.winRate}%
                        </Text>
                        <Text size="1" color="gray">Win Rate</Text>
                      </Box>
                    </Grid>
                  </Box>
                  
                  <Separator />
                  
                  {/* Recent Activity */}
                  <Box>
                    <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>
                      Recent Events
                    </Text>
                    <Text size="2">
                      {artist.recentEvents.slice(0, 3).join(', ')}
                    </Text>
                  </Box>
                  
                  {/* Contact Info */}
                  <Flex align="center" gap="3">
                    {artist.instagram && (
                      <InstagramLogoIcon size={16} color="var(--gray-9)" />
                    )}
                    <EnvelopeClosedIcon size={16} color="var(--gray-9)" />
                    <Text size="1" color="gray">
                      Last event: {new Date(artist.lastEvent).toLocaleDateString()}
                    </Text>
                  </Flex>
                </Flex>
              </Box>
            </Card>
          ))}
        </Grid>

        {/* Empty State */}
        {filteredArtists.length === 0 && !loading && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <PersonIcon size={48} color="var(--gray-8)" style={{ margin: '0 auto 16px' }} />
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No artists found
              </Text>
              <Text size="2" color="gray">
                Try adjusting your search criteria or filters
              </Text>
            </Box>
          </Card>
        )}

        {/* Artist Detail Dialog */}
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content style={{ maxWidth: '800px' }}>
            {selectedArtist && (
              <Box>
                <Dialog.Title size="5" mb="4">
                  {selectedArtist.name}
                </Dialog.Title>
                
                <Grid columns="2" gap="6">
                  {/* Profile Info */}
                  <Box>
                    <Flex direction="column" gap="4">
                      <Box style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--gray-4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto'
                      }}>
                        <PersonIcon size={48} color="var(--gray-8)" />
                      </Box>
                      
                      <Box style={{ textAlign: 'center' }}>
                        <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>Bio</Text>
                        <Text size="3">{selectedArtist.bio}</Text>
                      </Box>
                      
                      <Separator />
                      
                      <Flex direction="column" gap="2">
                        <Flex align="center" gap="2">
                          <EnvelopeClosedIcon size={16} />
                          <Text size="2">{selectedArtist.email}</Text>
                        </Flex>
                        {selectedArtist.instagram && (
                          <Flex align="center" gap="2">
                            <InstagramLogoIcon size={16} />
                            <Text size="2">{selectedArtist.instagram}</Text>
                          </Flex>
                        )}
                      </Flex>
                    </Flex>
                  </Box>
                  
                  {/* Performance Stats */}
                  <Box>
                    <Flex direction="column" gap="4">
                      <Box>
                        <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
                          Performance Overview
                        </Text>
                        
                        <Grid columns="2" gap="4">
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Events</Text>
                            <Text size="4" weight="bold">{selectedArtist.totalEvents}</Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Wins</Text>
                            <Text size="4" weight="bold" color="green">{selectedArtist.wins}</Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Win Rate</Text>
                            <Text size="4" weight="bold">{selectedArtist.winRate}%</Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Avg Votes</Text>
                            <Text size="4" weight="bold">{selectedArtist.averageVotes}</Text>
                          </Box>
                        </Grid>
                      </Box>
                      
                      <Separator />
                      
                      <Box>
                        <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
                          Auction Performance
                        </Text>
                        
                        <Grid columns="2" gap="4">
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Earnings</Text>
                            <Text size="4" weight="bold" color="green">${selectedArtist.auctionEarnings}</Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Top Sale</Text>
                            <Text size="4" weight="bold">${selectedArtist.topSale}</Text>
                          </Box>
                        </Grid>
                      </Box>
                      
                      <Separator />
                      
                      <Box>
                        <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
                          Recent Events
                        </Text>
                        <Flex direction="column" gap="1">
                          {selectedArtist.recentEvents.map((eventId, index) => (
                            <Text key={index} size="2" color="blue" style={{ cursor: 'pointer' }}>
                              {eventId}
                            </Text>
                          ))}
                        </Flex>
                      </Box>
                      
                      <Separator />
                      
                      <Flex gap="2">
                        <Button size="2">
                          <Pencil1Icon />
                          Edit Artist
                        </Button>
                        <Button variant="soft" size="2">
                          <BarChartIcon />
                          View Analytics
                        </Button>
                        <Button variant="soft" size="2">
                          <ExternalLinkIcon />
                          Contact
                        </Button>
                      </Flex>
                    </Flex>
                  </Box>
                </Grid>
              </Box>
            )}
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
};

export default AllArtists;