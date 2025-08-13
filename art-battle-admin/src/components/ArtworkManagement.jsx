import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
  Dialog,
  Separator
} from '@radix-ui/themes';
import {
  ImageIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Pencil1Icon,
  TrashIcon,
  DownloadIcon,
  EyeOpenIcon,
  HeartIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';

const ArtworkManagement = () => {
  const { eventId } = useParams();
  const { user, adminEvents } = useAuth();
  const [artworks, setArtworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRound, setFilterRound] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedArtwork, setSelectedArtwork] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Find current event
  const currentEvent = adminEvents?.find(e => e.event_id === eventId || e.id === eventId);

  useEffect(() => {
    // Simulate loading artwork data
    // In full implementation, this would fetch from Supabase
    setTimeout(() => {
      setArtworks([
        {
          id: 1,
          title: 'Urban Symphony',
          artist: 'Sarah Chen',
          easel: 1,
          round: 1,
          status: 'completed',
          medium: 'Acrylic on Canvas',
          dimensions: '18" x 24"',
          createdAt: '2024-01-15T10:30:00Z',
          imageUrl: '/api/placeholder/300/400',
          votes: 67,
          auctionStatus: 'sold',
          finalPrice: 450,
          startingBid: 100,
          bidCount: 8,
          progress: [
            { timestamp: '10:00', stage: 'canvas-prep', image: '/api/placeholder/200/300' },
            { timestamp: '10:15', stage: 'sketch', image: '/api/placeholder/200/300' },
            { timestamp: '10:45', stage: 'mid-progress', image: '/api/placeholder/200/300' },
            { timestamp: '11:30', stage: 'final', image: '/api/placeholder/200/300' }
          ]
        },
        {
          id: 2,
          title: 'Mystic Forest',
          artist: 'Mike Rodriguez',
          easel: 2,
          round: 1,
          status: 'completed',
          medium: 'Oil on Canvas',
          dimensions: '16" x 20"',
          createdAt: '2024-01-15T10:30:00Z',
          imageUrl: '/api/placeholder/300/400',
          votes: 89,
          auctionStatus: 'active',
          currentBid: 275,
          startingBid: 75,
          bidCount: 12,
          progress: [
            { timestamp: '10:00', stage: 'canvas-prep', image: '/api/placeholder/200/300' },
            { timestamp: '10:20', stage: 'sketch', image: '/api/placeholder/200/300' },
            { timestamp: '10:50', stage: 'mid-progress', image: '/api/placeholder/200/300' },
            { timestamp: '11:30', stage: 'final', image: '/api/placeholder/200/300' }
          ]
        },
        {
          id: 3,
          title: 'Abstract Dreams',
          artist: 'Emma Thompson',
          easel: 3,
          round: 2,
          status: 'in-progress',
          medium: 'Mixed Media',
          dimensions: '20" x 16"',
          createdAt: '2024-01-15T12:00:00Z',
          imageUrl: '/api/placeholder/300/400',
          votes: 34,
          auctionStatus: 'pending',
          startingBid: 125,
          progress: [
            { timestamp: '12:00', stage: 'canvas-prep', image: '/api/placeholder/200/300' },
            { timestamp: '12:15', stage: 'sketch', image: '/api/placeholder/200/300' },
            { timestamp: '12:45', stage: 'mid-progress', image: '/api/placeholder/200/300' }
          ]
        },
        {
          id: 4,
          title: 'Cosmic Dance',
          artist: 'James Wilson',
          easel: 4,
          round: 2,
          status: 'in-progress',
          medium: 'Watercolor',
          dimensions: '18" x 24"',
          createdAt: '2024-01-15T12:00:00Z',
          imageUrl: '/api/placeholder/300/400',
          votes: 56,
          auctionStatus: 'pending',
          startingBid: 90,
          progress: [
            { timestamp: '12:00', stage: 'canvas-prep', image: '/api/placeholder/200/300' },
            { timestamp: '12:20', stage: 'sketch', image: '/api/placeholder/200/300' }
          ]
        }
      ]);
      setLoading(false);
    }, 1000);
  }, [eventId]);

  // Filter artworks
  const filteredArtworks = artworks.filter(artwork => {
    const matchesSearch = !searchTerm || 
      artwork.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artwork.artist.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRound = filterRound === 'all' || artwork.round.toString() === filterRound;
    const matchesStatus = filterStatus === 'all' || artwork.status === filterStatus;
    
    return matchesSearch && matchesRound && matchesStatus;
  });

  const getStatusBadge = (status) => {
    const configs = {
      'completed': { color: 'green', label: 'Completed' },
      'in-progress': { color: 'blue', label: 'In Progress' },
      'not-started': { color: 'gray', label: 'Not Started' }
    };
    const config = configs[status] || configs['not-started'];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const getAuctionBadge = (auctionStatus) => {
    const configs = {
      'sold': { color: 'green', label: 'Sold' },
      'active': { color: 'orange', label: 'Active Bidding' },
      'pending': { color: 'gray', label: 'Pending Auction' },
      'unsold': { color: 'red', label: 'Unsold' }
    };
    const config = configs[auctionStatus] || configs['pending'];
    return <Badge color={config.color} variant="soft">{config.label}</Badge>;
  };

  const openArtworkDetail = (artwork) => {
    setSelectedArtwork(artwork);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <Box p="4">
        <Text size="3">Loading artwork...</Text>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="6">
        {/* Header */}
        <Box>
          <Flex align="center" gap="2" mb="2">
            <ImageIcon size={20} />
            <Heading size="6">Artwork Management</Heading>
          </Flex>
          <Text color="gray" size="3">
            Manage artwork for {currentEvent?.event_name || currentEvent?.name || 'Event'}
          </Text>
        </Box>

        {/* Filters and Search */}
        <Card>
          <Box p="4">
            <Grid columns="4" gap="3" align="end">
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Search Artwork
                </Text>
                <TextField.Root
                  placeholder="Search by title or artist..."
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
                  Round
                </Text>
                <Select.Root value={filterRound} onValueChange={setFilterRound}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Rounds</Select.Item>
                    <Select.Item value="1">Round 1</Select.Item>
                    <Select.Item value="2">Round 2</Select.Item>
                    <Select.Item value="3">Round 3</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Status
                </Text>
                <Select.Root value={filterStatus} onValueChange={setFilterStatus}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Status</Select.Item>
                    <Select.Item value="completed">Completed</Select.Item>
                    <Select.Item value="in-progress">In Progress</Select.Item>
                    <Select.Item value="not-started">Not Started</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Button>
                <PlusIcon />
                Add Artwork
              </Button>
            </Grid>
          </Box>
        </Card>

        {/* Artwork Grid */}
        <Grid columns="3" gap="4">
          {filteredArtworks.map((artwork) => (
            <Card key={artwork.id} style={{ cursor: 'pointer' }} onClick={() => openArtworkDetail(artwork)}>
              <Box>
                {/* Artwork Image */}
                <Box style={{
                  width: '100%',
                  height: '200px',
                  backgroundColor: 'var(--gray-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-2) var(--radius-2) 0 0'
                }}>
                  <ImageIcon size={48} color="var(--gray-8)" />
                </Box>
                
                {/* Artwork Details */}
                <Box p="3">
                  <Flex justify="between" align="start" mb="2">
                    <Box>
                      <Text size="3" weight="medium" mb="1" style={{ display: 'block' }}>
                        {artwork.title}
                      </Text>
                      <Text size="2" color="gray">
                        by {artwork.artist}
                      </Text>
                    </Box>
                    {getStatusBadge(artwork.status)}
                  </Flex>
                  
                  <Flex direction="column" gap="2" mb="3">
                    <Flex justify="between">
                      <Text size="2" color="gray">Easel</Text>
                      <Text size="2">{artwork.easel}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text size="2" color="gray">Round</Text>
                      <Text size="2">{artwork.round}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text size="2" color="gray">Votes</Text>
                      <Text size="2" weight="medium">{artwork.votes}</Text>
                    </Flex>
                  </Flex>
                  
                  {getAuctionBadge(artwork.auctionStatus)}
                  
                  {artwork.auctionStatus === 'sold' && (
                    <Text size="2" color="green" mt="1" style={{ display: 'block' }}>
                      Sold for ${artwork.finalPrice}
                    </Text>
                  )}
                  
                  {artwork.auctionStatus === 'active' && (
                    <Text size="2" color="orange" mt="1" style={{ display: 'block' }}>
                      Current bid: ${artwork.currentBid}
                    </Text>
                  )}
                </Box>
              </Box>
            </Card>
          ))}
        </Grid>

        {/* Empty State */}
        {filteredArtworks.length === 0 && !loading && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <ImageIcon size={48} color="var(--gray-8)" style={{ margin: '0 auto 16px' }} />
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No artwork found
              </Text>
              <Text size="2" color="gray">
                {searchTerm || filterRound !== 'all' || filterStatus !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Artwork will appear here once artists start creating'
                }
              </Text>
            </Box>
          </Card>
        )}

        {/* Artwork Detail Dialog */}
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content style={{ maxWidth: '800px' }}>
            {selectedArtwork && (
              <Box>
                <Dialog.Title size="5" mb="4">
                  {selectedArtwork.title}
                </Dialog.Title>
                
                <Grid columns="2" gap="6">
                  {/* Main Image */}
                  <Box>
                    <Box style={{
                      width: '100%',
                      height: '300px',
                      backgroundColor: 'var(--gray-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-2)',
                      marginBottom: '16px'
                    }}>
                      <ImageIcon size={64} color="var(--gray-8)" />
                    </Box>
                    
                    {/* Progress Images */}
                    <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
                      Creation Progress
                    </Text>
                    <Grid columns="4" gap="2">
                      {selectedArtwork.progress.map((stage, index) => (
                        <Box key={index}>
                          <Box style={{
                            width: '100%',
                            height: '60px',
                            backgroundColor: 'var(--gray-4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 'var(--radius-1)',
                            marginBottom: '4px'
                          }}>
                            <ImageIcon size={20} color="var(--gray-8)" />
                          </Box>
                          <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                            {stage.timestamp}
                          </Text>
                        </Box>
                      ))}
                    </Grid>
                  </Box>
                  
                  {/* Details */}
                  <Box>
                    <Flex direction="column" gap="4">
                      <Box>
                        <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>Artist</Text>
                        <Text size="3" weight="medium">{selectedArtwork.artist}</Text>
                      </Box>
                      
                      <Box>
                        <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>Medium</Text>
                        <Text size="3">{selectedArtwork.medium}</Text>
                      </Box>
                      
                      <Box>
                        <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>Dimensions</Text>
                        <Text size="3">{selectedArtwork.dimensions}</Text>
                      </Box>
                      
                      <Separator />
                      
                      <Box>
                        <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>Performance</Text>
                        <Flex align="center" gap="3">
                          <Flex align="center" gap="1">
                            <HeartIcon size={16} />
                            <Text size="3" weight="medium">{selectedArtwork.votes} votes</Text>
                          </Flex>
                          <Text size="2" color="gray">Round {selectedArtwork.round}</Text>
                        </Flex>
                      </Box>
                      
                      <Box>
                        <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>Auction Status</Text>
                        {getAuctionBadge(selectedArtwork.auctionStatus)}
                        
                        {selectedArtwork.auctionStatus === 'sold' && (
                          <Box mt="2">
                            <Text size="2">Final Price: <Text weight="medium">${selectedArtwork.finalPrice}</Text></Text>
                            <Text size="2" color="gray" style={{ display: 'block' }}>
                              {selectedArtwork.bidCount} bids
                            </Text>
                          </Box>
                        )}
                        
                        {selectedArtwork.auctionStatus === 'active' && (
                          <Box mt="2">
                            <Text size="2">Current Bid: <Text weight="medium" color="orange">${selectedArtwork.currentBid}</Text></Text>
                            <Text size="2" color="gray" style={{ display: 'block' }}>
                              {selectedArtwork.bidCount} bids
                            </Text>
                          </Box>
                        )}
                      </Box>
                      
                      <Separator />
                      
                      <Flex gap="2">
                        <Button size="2">
                          <Pencil1Icon />
                          Edit Details
                        </Button>
                        <Button variant="soft" size="2">
                          <DownloadIcon />
                          Download
                        </Button>
                        <Button variant="soft" size="2" color="red">
                          <TrashIcon />
                          Delete
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

export default ArtworkManagement;