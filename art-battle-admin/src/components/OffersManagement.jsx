import { useState, useEffect } from 'react';
import {
  Flex,
  Text,
  Button,
  Card,
  Heading,
  Badge,
  TextField,
  Select,
  Table,
  Box,
  Spinner,
  Callout,
  Dialog
} from '@radix-ui/themes';
import {
  PlusIcon,
  Pencil1Icon,
  TrashIcon,
  ReloadIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  MixIcon,
  DragHandleDots2Icon,
  EyeOpenIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { getAllOffers, deleteOffer, getOfferTypes, bulkUpdateDisplayOrder } from '../lib/OffersAPI';
import OfferFormModal from './OfferFormModal';

const OffersManagement = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [offerTypes, setOfferTypes] = useState([]);

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [deleteConfirmOffer, setDeleteConfirmOffer] = useState(null);
  const [previewOffer, setPreviewOffer] = useState(null);

  // Drag and drop state
  const [draggedOffer, setDraggedOffer] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    loadOffers();
    loadOfferTypes();
  }, []);

  const loadOffers = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await getAllOffers({
        searchTerm,
        typeFilter: typeFilter === 'all' ? null : typeFilter,
        activeOnly: activeFilter === 'active'
      });

      if (fetchError) {
        setError(fetchError);
        return;
      }

      setOffers(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  };

  const loadOfferTypes = async () => {
    const { data } = await getOfferTypes();
    if (data) {
      setOfferTypes(data);
    }
  };

  const handleCreateOffer = () => {
    setEditingOffer(null);
    setShowFormModal(true);
  };

  const handleEditOffer = (offer) => {
    setEditingOffer(offer);
    setShowFormModal(true);
  };

  const handleDeleteOffer = async (offer) => {
    if (!confirm(`Are you sure you want to delete "${offer.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { success, error: deleteError } = await deleteOffer(offer.id);

      if (!success) {
        setError(deleteError);
        return;
      }

      // Reload offers
      await loadOffers();
    } catch (err) {
      setError(err.message || 'Failed to delete offer');
    }
  };

  const handleSaveOffer = () => {
    setShowFormModal(false);
    setEditingOffer(null);
    loadOffers();
  };

  const handleSearch = () => {
    loadOffers();
  };

  // Drag and drop handlers
  const handleDragStart = (e, offer) => {
    setDraggedOffer(offer);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetOffer) => {
    e.preventDefault();
    if (!draggedOffer || draggedOffer.id === targetOffer.id) return;

    // Reorder offers array
    const draggedIndex = offers.findIndex(o => o.id === draggedOffer.id);
    const targetIndex = offers.findIndex(o => o.id === targetOffer.id);

    const newOffers = [...offers];
    newOffers.splice(draggedIndex, 1);
    newOffers.splice(targetIndex, 0, draggedOffer);

    setOffers(newOffers);
  };

  const handleDragEnd = () => {
    setDraggedOffer(null);
  };

  const handleSaveOrder = async () => {
    setSavingOrder(true);
    setError('');

    try {
      // Create order updates based on current array order
      const orderUpdates = offers.map((offer, index) => ({
        id: offer.id,
        display_order: index + 1
      }));

      const { success, error: saveError } = await bulkUpdateDisplayOrder(orderUpdates);

      if (!success) {
        setError(saveError);
        return;
      }

      // Reload to confirm
      await loadOffers();
      setReorderMode(false);
    } catch (err) {
      setError(err.message || 'Failed to save order');
    } finally {
      setSavingOrder(false);
    }
  };

  const formatNumber = (num) => new Intl.NumberFormat().format(num || 0);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getRFMSummary = (offer) => {
    const parts = [];
    if (offer.min_recency_score !== null && offer.min_recency_score !== 0) {
      parts.push(`R:${offer.min_recency_score}-${offer.max_recency_score}`);
    }
    if (offer.min_frequency_score !== null && offer.min_frequency_score !== 0) {
      parts.push(`F:${offer.min_frequency_score}-${offer.max_frequency_score}`);
    }
    if (offer.min_monetary_score !== null && offer.min_monetary_score !== 0) {
      parts.push(`M:${offer.min_monetary_score}-${offer.max_monetary_score}`);
    }
    return parts.length > 0 ? parts.join(' ') : 'All users';
  };

  const getGeoSummary = (offer) => {
    if (!offer.geography_scope || offer.geography_scope.length === 0) {
      return 'All cities';
    }
    return `${offer.geography_scope.length} cities`;
  };

  return (
    <Flex direction="column" gap="4" p="4">
      <Flex justify="between" align="center">
        <Heading size="8">
          <Flex align="center" gap="2">
            <MixIcon width="32" height="32" />
            Promotional Offers
          </Flex>
        </Heading>
        <Flex gap="2">
          {reorderMode ? (
            <>
              <Button
                size="3"
                color="green"
                onClick={handleSaveOrder}
                disabled={savingOrder}
              >
                {savingOrder ? 'Saving...' : 'Save Order'}
              </Button>
              <Button
                size="3"
                variant="soft"
                color="gray"
                onClick={() => {
                  setReorderMode(false);
                  loadOffers();
                }}
                disabled={savingOrder}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="3"
                variant="soft"
                onClick={() => setReorderMode(true)}
                disabled={offers.length === 0}
              >
                <DragHandleDots2Icon />
                Reorder
              </Button>
              <Button size="3" onClick={handleCreateOffer}>
                <PlusIcon />
                Create Offer
              </Button>
            </>
          )}
        </Flex>
      </Flex>

      {/* Filters */}
      <Card>
        <Flex direction="column" gap="3">
          <Heading size="5">Filters</Heading>
          <Flex gap="3" wrap="wrap">
            <Box style={{ flex: 1, minWidth: '200px' }}>
              <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Search
              </Text>
              <Flex gap="2">
                <TextField.Root
                  placeholder="Search by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  style={{ flex: 1 }}
                />
                <Button onClick={handleSearch}>
                  <ReloadIcon />
                  Search
                </Button>
              </Flex>
            </Box>

            <Box style={{ minWidth: '150px' }}>
              <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Type
              </Text>
              <Select.Root value={typeFilter} onValueChange={setTypeFilter}>
                <Select.Trigger placeholder="All types" />
                <Select.Content>
                  <Select.Item value="all">All types</Select.Item>
                  {offerTypes.map(type => (
                    <Select.Item key={type} value={type}>
                      {type}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box style={{ minWidth: '150px' }}>
              <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Status
              </Text>
              <Select.Root value={activeFilter} onValueChange={setActiveFilter}>
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="all">All offers</Select.Item>
                  <Select.Item value="active">Active only</Select.Item>
                  <Select.Item value="inactive">Inactive only</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>

            <Box style={{ alignSelf: 'flex-end' }}>
              <Button variant="soft" onClick={loadOffers}>
                <ReloadIcon />
                Refresh
              </Button>
            </Box>
          </Flex>
        </Flex>
      </Card>

      {/* Error Display */}
      {error && (
        <Callout.Root color="red">
          <Callout.Icon>
            <CrossCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {/* Offers List */}
      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Heading size="5">
              {loading ? 'Loading...' : `${offers.length} Offer${offers.length !== 1 ? 's' : ''}`}
            </Heading>
          </Flex>

          {loading ? (
            <Flex justify="center" p="6">
              <Spinner size="3" />
            </Flex>
          ) : offers.length === 0 ? (
            <Flex direction="column" align="center" gap="3" p="6" style={{ color: 'var(--gray-9)' }}>
              <MixIcon width="48" height="48" />
              <Text size="3">No offers found</Text>
              <Button onClick={handleCreateOffer}>
                <PlusIcon />
                Create your first offer
              </Button>
            </Flex>
          ) : (
            <Table.Root variant="surface">
              <Table.Header>
                <Table.Row>
                  {reorderMode && <Table.ColumnHeaderCell style={{ width: '40px' }}></Table.ColumnHeaderCell>}
                  <Table.ColumnHeaderCell style={{ width: '40px' }}>Order</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>RFM Targeting</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Geography</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Inventory</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Dates</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  {!reorderMode && <Table.ColumnHeaderCell style={{ width: '120px' }}>Actions</Table.ColumnHeaderCell>}
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {offers.map((offer) => (
                  <Table.Row
                    key={offer.id}
                    draggable={reorderMode}
                    onDragStart={(e) => handleDragStart(e, offer)}
                    onDragOver={(e) => handleDragOver(e, offer)}
                    onDragEnd={handleDragEnd}
                    style={{
                      cursor: reorderMode ? 'move' : 'default',
                      opacity: draggedOffer?.id === offer.id ? 0.5 : 1
                    }}
                  >
                    {reorderMode && (
                      <Table.Cell>
                        <DragHandleDots2Icon style={{ cursor: 'move' }} />
                      </Table.Cell>
                    )}
                    <Table.Cell>
                      <Badge color="gray">{offer.display_order}</Badge>
                    </Table.Cell>

                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="2" weight="medium">{offer.name}</Text>
                        {offer.description && (
                          <Text size="1" color="gray" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {offer.description}
                          </Text>
                        )}
                      </Flex>
                    </Table.Cell>

                    <Table.Cell>
                      {offer.type ? (
                        <Badge color="blue">{offer.type}</Badge>
                      ) : (
                        <Text size="1" color="gray">—</Text>
                      )}
                    </Table.Cell>

                    <Table.Cell>
                      {offer.value ? (
                        <Text size="2" weight="medium">
                          ${offer.value} {offer.currency}
                        </Text>
                      ) : (
                        <Text size="1" color="gray">—</Text>
                      )}
                    </Table.Cell>

                    <Table.Cell>
                      <Text size="1">{getRFMSummary(offer)}</Text>
                    </Table.Cell>

                    <Table.Cell>
                      <Text size="1">{getGeoSummary(offer)}</Text>
                    </Table.Cell>

                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="1">
                          {formatNumber(offer.redeemed_count)} / {formatNumber(offer.total_inventory)}
                        </Text>
                        <Text size="1" color="gray">
                          {formatNumber(offer.total_inventory - offer.redeemed_count)} left
                        </Text>
                      </Flex>
                    </Table.Cell>

                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="1">Start: {formatDate(offer.start_date)}</Text>
                        <Text size="1">End: {formatDate(offer.end_date)}</Text>
                      </Flex>
                    </Table.Cell>

                    <Table.Cell>
                      {offer.active ? (
                        <Badge color="green">
                          <CheckCircledIcon />
                          Active
                        </Badge>
                      ) : (
                        <Badge color="gray">
                          <CrossCircledIcon />
                          Inactive
                        </Badge>
                      )}
                    </Table.Cell>

                    {!reorderMode && (
                      <Table.Cell>
                        <Flex gap="2">
                          <Button
                            size="1"
                            variant="soft"
                            color="blue"
                            onClick={() => setPreviewOffer(offer)}
                          >
                            <EyeOpenIcon />
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => handleEditOffer(offer)}
                          >
                            <Pencil1Icon />
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            color="red"
                            onClick={() => handleDeleteOffer(offer)}
                          >
                            <TrashIcon />
                          </Button>
                        </Flex>
                      </Table.Cell>
                    )}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Flex>
      </Card>

      {/* Form Modal */}
      <OfferFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setEditingOffer(null);
        }}
        offer={editingOffer}
        onSave={handleSaveOffer}
      />

      {/* Preview Modal */}
      <Dialog.Root open={!!previewOffer} onOpenChange={(open) => !open && setPreviewOffer(null)}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>
            <Flex justify="between" align="center">
              Offer Preview
              <Dialog.Close asChild>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>

          {previewOffer && (
            <Card
              style={{
                backgroundColor: previewOffer.tile_color || '#3a88fe',
                padding: '2rem',
                marginTop: '1rem'
              }}
            >
              <Flex direction="column" gap="3" style={{ color: 'white' }}>
                {previewOffer.image_url && (
                  <img
                    src={previewOffer.image_url}
                    alt={previewOffer.name}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '200px',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}
                  />
                )}

                <Heading size="6" style={{ color: 'white' }}>
                  {previewOffer.name}
                </Heading>

                {previewOffer.value && (
                  <Text size="5" weight="bold" style={{ color: 'white' }}>
                    ${previewOffer.value} {previewOffer.currency}
                  </Text>
                )}

                {previewOffer.description && (
                  <Text size="3" style={{ color: 'white', opacity: 0.9 }}>
                    {previewOffer.description}
                  </Text>
                )}

                {previewOffer.terms && (
                  <Box
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      padding: '1rem',
                      borderRadius: '4px'
                    }}
                  >
                    <Text size="2" weight="bold" mb="1" style={{ display: 'block', color: 'white' }}>
                      Terms & Conditions:
                    </Text>
                    <Text size="1" style={{ color: 'white', opacity: 0.8 }}>
                      {previewOffer.terms}
                    </Text>
                  </Box>
                )}

                <Flex gap="2" mt="2">
                  <Badge color="gray">
                    {previewOffer.total_inventory - previewOffer.redeemed_count} remaining
                  </Badge>
                  {previewOffer.type && <Badge color="blue">{previewOffer.type}</Badge>}
                </Flex>
              </Flex>
            </Card>
          )}

          <Flex justify="between" align="center" mt="3">
            <Text size="2" color="gray">
              This is how the offer appears to users on artb.art/o/{'{hash}'}
            </Text>
            <Dialog.Close asChild>
              <Button>Close Preview</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
};

export default OffersManagement;
