import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Card,
  Table,
  TextField,
  Badge,
  Heading,
  Callout,
  IconButton,
  Avatar,
  Progress,
  Separator,
  Switch
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  Pencil1Icon,
  ImageIcon,
  ReloadIcon,
  InfoCircledIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon
} from '@radix-ui/react-icons';
import { 
  getBulkArtistData, 
  getBulkArtistStats
} from '../lib/AdminBulkArtistAPI';
import BioEditModal from './BioEditModal';
import PromoImageUploadModal from './PromoImageUploadModal';
import ArtistDetailModal from './ArtistDetailModal';

const ITEMS_PER_PAGE = 50;

const BulkArtistView = () => {
  // Data state
  const [artists, setArtists] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [hideWithBio, setHideWithBio] = useState(false);
  const [hideWithPromoImage, setHideWithPromoImage] = useState(false);

  // Modal state
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [artistDetailModalOpen, setArtistDetailModalOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);

  // Load initial data
  useEffect(() => {
    loadData();
    loadStats();
  }, []);

  // Reload data when filters change
  useEffect(() => {
    if (!loading) {
      setCurrentPage(1);
      loadData();
    }
  }, [hideWithBio, hideWithPromoImage]);

  // Search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loading) {
        setCurrentPage(1);
        loadData();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const result = await getBulkArtistData({
        limit: ITEMS_PER_PAGE + 1, // Get one extra to check if there's more
        offset,
        searchTerm: searchTerm.trim() || null
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      let filteredData = result.data || [];

      // Apply hide filters locally
      if (hideWithBio) {
        filteredData = filteredData.filter(artist => !artist.has_bio);
      }
      if (hideWithPromoImage) {
        filteredData = filteredData.filter(artist => !artist.has_promo_image);
      }

      // Check if we have more data
      const hasMoreData = filteredData.length > ITEMS_PER_PAGE;
      if (hasMoreData) {
        filteredData = filteredData.slice(0, ITEMS_PER_PAGE);
      }

      if (currentPage === 1) {
        setArtists(filteredData);
      } else {
        setArtists(prev => [...prev, ...filteredData]);
      }
      
      setHasMore(hasMoreData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await getBulkArtistStats();
      if (result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleLoadMore = () => {
    setCurrentPage(prev => prev + 1);
    loadData();
  };

  const handleRefresh = () => {
    setCurrentPage(1);
    loadData();
    loadStats();
  };

  const handleBioEdit = (artist) => {
    setSelectedArtist(artist);
    setBioModalOpen(true);
  };

  const handlePromoEdit = (artist) => {
    setSelectedArtist(artist);
    setPromoModalOpen(true);
  };

  const handleArtistDetailView = (artist) => {
    setSelectedArtist(artist);
    setArtistDetailModalOpen(true);
  };

  const handleArtistUpdate = (updatedArtist) => {
    setArtists(prev => prev.map(artist => 
      artist.artist_profile_id === updatedArtist.artist_profile_id 
        ? updatedArtist 
        : artist
    ));
    // Refresh stats to reflect changes
    loadStats();
  };

  const getStatusBadge = (artist) => {
    if (artist.has_bio && artist.has_promo_image) {
      return <Badge color="green" size="1"><CheckCircledIcon width="12" height="12" /> Complete</Badge>;
    } else if (!artist.has_bio && !artist.has_promo_image) {
      return <Badge color="red" size="1"><CrossCircledIcon width="12" height="12" /> Missing Both</Badge>;
    } else if (!artist.has_bio) {
      return <Badge color="orange" size="1"><ExclamationTriangleIcon width="12" height="12" /> Missing Bio</Badge>;
    } else {
      return <Badge color="orange" size="1"><ExclamationTriangleIcon width="12" height="12" /> Missing Image</Badge>;
    }
  };

  return (
    <Box style={{ padding: '1.5rem', maxWidth: '100%', overflowX: 'auto' }}>
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Heading size="6">Bulk Artist Management</Heading>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <ReloadIcon />
            Refresh
          </Button>
        </Flex>

        {/* Statistics Cards */}
        {stats && (
          <Flex gap="4" wrap="wrap">
            <Card size="2" style={{ flex: '1', minWidth: '200px' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">Total Artists</Text>
                <Text size="5" weight="bold">{stats.total_confirmed_artists}</Text>
              </Flex>
            </Card>
            <Card size="2" style={{ flex: '1', minWidth: '200px' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">Bio Completion</Text>
                <Flex align="center" gap="2">
                  <Text size="5" weight="bold" color="green">
                    {stats.bio_completion_rate}%
                  </Text>
                  <Text size="2" color="gray">
                    ({stats.artists_with_bio}/{stats.total_confirmed_artists})
                  </Text>
                </Flex>
              </Flex>
            </Card>
            <Card size="2" style={{ flex: '1', minWidth: '200px' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">Image Completion</Text>
                <Flex align="center" gap="2">
                  <Text size="5" weight="bold" color="blue">
                    {stats.promo_completion_rate}%
                  </Text>
                  <Text size="2" color="gray">
                    ({stats.artists_with_promo_image}/{stats.total_confirmed_artists})
                  </Text>
                </Flex>
              </Flex>
            </Card>
            <Card size="2" style={{ flex: '1', minWidth: '200px' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">Missing Both</Text>
                <Text size="5" weight="bold" color="red">{stats.artists_missing_both}</Text>
              </Flex>
            </Card>
          </Flex>
        )}

        {/* Search and Filters */}
        <Flex direction="column" gap="3">
          {/* Search Bar */}
          <Card size="2">
            <Flex direction="column" gap="2">
              <Text size="3" weight="medium">Search Artists</Text>
              <TextField.Root
                size="3"
                placeholder="Search by artist name, event ID (e.g. AB3037), or artist number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="18" width="18" />
                </TextField.Slot>
              </TextField.Root>
              <Text size="1" color="gray">
                Shows artists from events in the last 5 days to future, sorted by event date
              </Text>
            </Flex>
          </Card>

          {/* Hide Toggles */}
          <Card size="2">
            <Flex direction="column" gap="3">
              <Text size="3" weight="medium">Focus Options</Text>
              <Flex gap="6" wrap="wrap">
                <Flex align="center" gap="2">
                  <Switch
                    checked={hideWithBio}
                    onCheckedChange={setHideWithBio}
                    size="2"
                  />
                  <Text size="2">
                    Hide artists <strong>WITH</strong> bios ({hideWithBio ? 'showing only missing bios' : 'showing all'})
                  </Text>
                </Flex>
                <Flex align="center" gap="2">
                  <Switch
                    checked={hideWithPromoImage}
                    onCheckedChange={setHideWithPromoImage}
                    size="2"
                  />
                  <Text size="2">
                    Hide artists <strong>WITH</strong> promo images ({hideWithPromoImage ? 'showing only missing images' : 'showing all'})
                  </Text>
                </Flex>
              </Flex>
            </Flex>
          </Card>
        </Flex>

        {/* Error Display */}
        {error && (
          <Callout.Root color="red">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Data Table */}
        <Card size="1">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Location & Date</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Bio</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Promo Image</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {artists.map((artist, index) => (
                <Table.Row key={`${artist.artist_profile_id}-${artist.event_eid}-${index}`}>
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Button 
                        variant="ghost" 
                        size="1" 
                        style={{ 
                          padding: '0', 
                          height: 'auto', 
                          fontWeight: 'var(--font-weight-medium)',
                          fontSize: 'var(--font-size-2)',
                          cursor: 'pointer',
                          color: 'var(--accent-11)'
                        }}
                        onClick={() => handleArtistDetailView(artist)}
                      >
                        {artist.artist_name}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="1" 
                        style={{ 
                          padding: '0', 
                          height: 'auto', 
                          cursor: 'pointer' 
                        }}
                        onClick={() => handleArtistDetailView(artist)}
                      >
                        <Badge size="1" color="gray">#{artist.artist_number}</Badge>
                      </Button>
                    </Flex>
                  </Table.Cell>
                  
                  <Table.Cell>
                    <Badge color="blue" size="2">{artist.event_eid}</Badge>
                  </Table.Cell>
                  
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Text size="2">{artist.city_name}</Text>
                      <Text size="1" color="gray">{artist.event_date}</Text>
                    </Flex>
                  </Table.Cell>
                  
                  <Table.Cell style={{ maxWidth: '200px' }}>
                    <Flex direction="column" gap="1">
                      {artist.has_bio ? (
                        <>
                          <Text size="1" style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap' 
                          }}>
                            {artist.bio_preview}
                            {artist.full_bio.length > 100 && '...'}
                          </Text>
                          <Text size="1" color="gray">
                            {artist.full_bio.length} characters
                          </Text>
                        </>
                      ) : (
                        <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                          No bio
                        </Text>
                      )}
                    </Flex>
                  </Table.Cell>
                  
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      {artist.has_promo_image ? (
                        <Avatar
                          src={artist.promotion_artwork_url}
                          fallback={<ImageIcon />}
                          size="2"
                        />
                      ) : (
                        <Box 
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            backgroundColor: 'var(--gray-3)', 
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <ImageIcon color="var(--gray-8)" />
                        </Box>
                      )}
                      <Text size="1" color="gray">
                        {artist.has_promo_image ? 'Uploaded' : 'None'}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  
                  <Table.Cell>
                    {getStatusBadge(artist)}
                  </Table.Cell>
                  
                  <Table.Cell>
                    <Flex gap="1">
                      <IconButton
                        size="1"
                        variant="ghost"
                        onClick={() => handleBioEdit(artist)}
                        title="Edit Bio"
                      >
                        <Pencil1Icon />
                      </IconButton>
                      <IconButton
                        size="1"
                        variant="ghost"
                        onClick={() => handlePromoEdit(artist)}
                        title="Manage Promo Image"
                      >
                        <ImageIcon />
                      </IconButton>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          {/* Loading State */}
          {loading && artists.length === 0 && (
            <Flex justify="center" align="center" style={{ padding: '2rem' }}>
              <Text>Loading artists...</Text>
            </Flex>
          )}

          {/* Empty State */}
          {!loading && artists.length === 0 && (
            <Flex justify="center" align="center" direction="column" gap="2" style={{ padding: '2rem' }}>
              <InfoCircledIcon size="24" color="var(--gray-8)" />
              <Text color="gray">No artists found matching the current filters</Text>
            </Flex>
          )}

          {/* Load More Button */}
          {hasMore && (
            <Flex justify="center" style={{ padding: '1rem' }}>
              <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                {loading ? 'Loading...' : `Load More (${artists.length} shown)`}
              </Button>
            </Flex>
          )}
        </Card>

        {/* Results Summary */}
        {!loading && artists.length > 0 && (
          <Text size="2" color="gray" style={{ textAlign: 'center' }}>
            Showing {artists.length} artist{artists.length !== 1 ? 's' : ''}
            {hasMore && ' (more available)'}
          </Text>
        )}
      </Flex>

      {/* Modals */}
      <BioEditModal
        isOpen={bioModalOpen}
        onClose={() => {
          setBioModalOpen(false);
          setSelectedArtist(null);
        }}
        artist={selectedArtist}
        onSave={handleArtistUpdate}
      />

      <PromoImageUploadModal
        isOpen={promoModalOpen}
        onClose={() => {
          setPromoModalOpen(false);
          setSelectedArtist(null);
        }}
        artist={selectedArtist}
        onSave={handleArtistUpdate}
      />

      <ArtistDetailModal
        isOpen={artistDetailModalOpen}
        onClose={() => {
          setArtistDetailModalOpen(false);
          setSelectedArtist(null);
        }}
        artist={selectedArtist}
      />
    </Box>
  );
};

export default BulkArtistView;