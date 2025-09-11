import { useState, useEffect } from 'react';
import { 
  Box, 
  Flex, 
  Text, 
  Button, 
  Table, 
  Badge, 
  TextField, 
  Select, 
  Dialog,
  IconButton,
  Tooltip,
  Checkbox,
  AlertDialog
} from '@radix-ui/themes';
import { 
  PlusIcon, 
  MagnifyingGlassIcon, 
  BarChartIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  StarIcon,
  TrashIcon,
  DotsVerticalIcon,
  FileTextIcon,
  CaretUpIcon,
  CaretDownIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import ContentStatsModal from './ContentStatsModal';
import ManualContentForm from './ManualContentForm';

const ContentLibrary = () => {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0
  });

  // Filters
  const [filters, setFilters] = useState({
    content_type: '',
    status: '',
    search: '',
    curator_type: ''
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'created_at',
    direction: 'desc'
  });

  // Selection state
  const [selectedItems, setSelectedItems] = useState(new Set());

  // Modals
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedContentId, setSelectedContentId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Load content data
  const loadContent = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sort_by: sortConfig.key,
        sort_direction: sortConfig.direction,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      });

      const { data, error } = await supabase.functions.invoke(`admin-content-library?${params.toString()}`, {
        method: 'GET'
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to load content');
      }

      setContent(data.data || []);
      setPagination(data.pagination || pagination);
    } catch (err) {
      console.error('Error loading content:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and when filters/pagination/sorting change
  useEffect(() => {
    loadContent();
  }, [filters, pagination.page, sortConfig]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle sorting
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
  };

  // Handle item selection
  const handleSelectItem = (itemId, checked) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedItems(new Set(content.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  // Content actions
  const performBulkAction = async (action, parameters = {}) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-content-actions', {
        method: 'POST',
        body: {
          action,
          content_ids: Array.from(selectedItems),
          parameters
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Action failed');
      }

      // Reload content and clear selection
      await loadContent();
      setSelectedItems(new Set());

      return data;
    } catch (err) {
      console.error(`Error performing ${action}:`, err);
      setError(err.message);
      throw err;
    }
  };

  const handlePin = () => {
    const pinUntil = new Date();
    pinUntil.setDate(pinUntil.getDate() + 7); // Pin for 1 week
    performBulkAction('pin', { pin_until: pinUntil.toISOString() });
  };

  const handleUnpin = () => performBulkAction('unpin');
  const handleHide = () => performBulkAction('hide');
  const handleActivate = () => performBulkAction('activate');

  const handleDelete = async () => {
    try {
      await performBulkAction('delete');
      setShowDeleteDialog(false);
    } catch (err) {
      // Error already handled in performBulkAction
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Get status badge variant
  const getStatusVariant = (status) => {
    switch (status) {
      case 'active': return 'green';
      case 'hidden': return 'gray';
      case 'expired': return 'red';
      default: return 'blue';
    }
  };

  // Get content type badge variant
  const getContentTypeVariant = (type) => {
    switch (type) {
      case 'event': return 'blue';
      case 'artist_spotlight': return 'purple';
      case 'artist_application': return 'orange';
      case 'artwork': return 'green';
      default: return 'gray';
    }
  };

  if (loading && content.length === 0) {
    return (
      <Box p="4">
        <Text>Loading content library...</Text>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Flex justify="between" align="center" mb="4">
        <Box>
          <Text size="6" weight="bold">Content Library</Text>
          <Text size="2" color="gray">
            Manage curated feed content, view analytics, and create manual content
          </Text>
        </Box>
        <Button onClick={() => setShowCreateModal(true)}>
          <PlusIcon />
          Add Content
        </Button>
      </Flex>

      {/* Filters */}
      <Flex gap="3" mb="4" wrap="wrap">
        <Box style={{ minWidth: '200px' }}>
          <TextField.Root
            placeholder="Search content..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
        </Box>

        <Select.Root
          value={filters.content_type || 'all'}
          onValueChange={(value) => handleFilterChange('content_type', value === 'all' ? '' : value)}
        >
          <Select.Trigger placeholder="Content Type" />
          <Select.Content>
            <Select.Item value="all">All Types</Select.Item>
            <Select.Item value="event">Events</Select.Item>
            <Select.Item value="artist_spotlight">Artist Spotlight</Select.Item>
            <Select.Item value="artist_application">Artist Applications</Select.Item>
            <Select.Item value="artwork">Artwork</Select.Item>
          </Select.Content>
        </Select.Root>

        <Select.Root
          value={filters.status || 'all_status'}
          onValueChange={(value) => handleFilterChange('status', value === 'all_status' ? '' : value)}
        >
          <Select.Trigger placeholder="Status" />
          <Select.Content>
            <Select.Item value="all_status">All Status</Select.Item>
            <Select.Item value="active">Active</Select.Item>
            <Select.Item value="hidden">Hidden</Select.Item>
          </Select.Content>
        </Select.Root>

        <Select.Root
          value={filters.curator_type || 'all_curator'}
          onValueChange={(value) => handleFilterChange('curator_type', value === 'all_curator' ? '' : value)}
        >
          <Select.Trigger placeholder="Curator Type" />
          <Select.Content>
            <Select.Item value="all_curator">All Types</Select.Item>
            <Select.Item value="auto">Automated</Select.Item>
            <Select.Item value="manual">Manual</Select.Item>
          </Select.Content>
        </Select.Root>
      </Flex>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <Flex gap="2" mb="4" p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '8px' }}>
          <Text size="2" style={{ marginRight: 'auto' }}>
            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
          </Text>
          <Button size="1" onClick={handlePin}>
            <StarIcon />
            Pin
          </Button>
          <Button size="1" onClick={handleUnpin} variant="soft">
            Unpin
          </Button>
          <Button size="1" onClick={handleHide} variant="soft">
            <EyeClosedIcon />
            Hide
          </Button>
          <Button size="1" onClick={handleActivate} variant="soft">
            <EyeOpenIcon />
            Activate
          </Button>
          <Button size="1" color="red" onClick={() => setShowDeleteDialog(true)}>
            <TrashIcon />
            Delete
          </Button>
        </Flex>
      )}

      {error && (
        <Box mb="4" p="3" style={{ backgroundColor: 'var(--red-2)', borderRadius: '8px' }}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {/* Content Table */}
      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>
              <Checkbox
                checked={selectedItems.size === content.length && content.length > 0}
                onCheckedChange={handleSelectAll}
              />
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('title')}
            >
              <Flex align="center" gap="1">
                Content
                {sortConfig.key === 'title' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('content_type')}
            >
              <Flex align="center" gap="1">
                Type
                {sortConfig.key === 'content_type' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('status')}
            >
              <Flex align="center" gap="1">
                Status
                {sortConfig.key === 'status' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Curator</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Scores</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('total_views')}
            >
              <Flex align="center" gap="1">
                Views (30d)
                {sortConfig.key === 'total_views' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('avg_dwell_time')}
            >
              <Flex align="center" gap="1">
                Avg Dwell (ms)
                {sortConfig.key === 'avg_dwell_time' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell 
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => handleSort('created_at')}
            >
              <Flex align="center" gap="1">
                Created
                {sortConfig.key === 'created_at' && (
                  sortConfig.direction === 'asc' ? <CaretUpIcon /> : <CaretDownIcon />
                )}
              </Flex>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {content.map((item) => (
            <Table.Row key={item.id}>
              <Table.Cell>
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={(checked) => handleSelectItem(item.id, checked)}
                />
              </Table.Cell>
              <Table.Cell>
                <Flex direction="column" gap="1">
                  <Text weight="medium" size="2">
                    {item.title || 'Untitled'}
                  </Text>
                  {item.description && (
                    <Text size="1" color="gray" style={{ maxWidth: '200px' }}>
                      {item.description.substring(0, 100)}
                      {item.description.length > 100 ? '...' : ''}
                    </Text>
                  )}
                  {(item.image_urls?.length > 0 || item.image_url) && (
                    <Text size="1" color="blue">
                      📷 {item.image_urls?.length || 1} image{(item.image_urls?.length || 1) !== 1 ? 's' : ''}
                    </Text>
                  )}
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="soft" color={getContentTypeVariant(item.content_type)}>
                  {item.content_type.replace('_', ' ')}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="soft" color={getStatusVariant(item.status)}>
                  {item.status}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Badge variant="outline" size="1">
                  {item.curator_type}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <Flex direction="column" gap="1">
                  <Tooltip content="Engagement Score: User interaction rate (0-10)">
                    <Text size="1">E: {item.engagement_score?.toFixed(1) || '0.0'}</Text>
                  </Tooltip>
                  <Tooltip content="Trending Score: Feed priority ranking (0-10, higher = top of feed)">
                    <Text size="1">T: {item.trending_score?.toFixed(1) || '0.0'}</Text>
                  </Tooltip>
                  <Tooltip content="Quality Score: Content quality assessment (0-10)">
                    <Text size="1">Q: {item.quality_score?.toFixed(1) || '0.0'}</Text>
                  </Tooltip>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                <Text size="1">
                  {item.calculated_total_views !== undefined ? item.calculated_total_views : '-'}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="1">
                  {item.calculated_avg_dwell_time !== undefined ? 
                    `${(item.calculated_avg_dwell_time / 1000).toFixed(1)}s` : '-'}
                </Text>
              </Table.Cell>
              <Table.Cell>
                <Text size="1">{formatDate(item.created_at)}</Text>
              </Table.Cell>
              <Table.Cell>
                <Flex gap="1">
                  <Tooltip content="View Analytics">
                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => {
                        setSelectedContentId(item);
                        setShowStatsModal(true);
                      }}
                    >
                      <BarChartIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content="Edit Content">
                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => {
                        setEditingItem(item);
                        setShowCreateModal(true);
                      }}
                    >
                      <FileTextIcon />
                    </IconButton>
                  </Tooltip>
                </Flex>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <Flex justify="center" align="center" gap="2" mt="4">
          <Button
            variant="soft"
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <Text size="2">
            Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
          </Text>
          <Button
            variant="soft"
            disabled={pagination.page === pagination.total_pages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </Flex>
      )}

      {/* Stats Modal */}
      <ContentStatsModal
        isOpen={showStatsModal}
        onClose={() => {
          setShowStatsModal(false);
          setSelectedContentId(null);
        }}
        contentItem={selectedContentId}
      />

      {/* Create/Edit Content Modal */}
      <ManualContentForm
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          setShowCreateModal(false);
          setEditingItem(null);
          loadContent();
        }}
        editingItem={editingItem}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialog.Content>
          <AlertDialog.Title>Delete Content</AlertDialog.Title>
          <AlertDialog.Description>
            Are you sure you want to delete {selectedItems.size} content item{selectedItems.size !== 1 ? 's' : ''}?
            This action cannot be undone.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={handleDelete}>Delete</Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  );
};

export default ContentLibrary;