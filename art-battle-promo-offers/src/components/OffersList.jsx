import { Table, Badge, Text, Box, Flex } from '@radix-ui/themes'

export default function OffersList({ offers, onSelectOffer }) {
  if (offers.length === 0) {
    return (
      <Box style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <Text size="4" color="gray">No offers found</Text>
        <Text size="2" color="gray" style={{ display: 'block', marginTop: '0.5rem' }}>
          Create your first promo offer to get started
        </Text>
      </Box>
    )
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function getOfferIcon(type) {
    const icons = {
      ticket: '🎫',
      merchandise: '🎨',
      auction_credit: '💰',
      discount: '🏷️',
      experience: '✨',
    }
    return icons[type] || '🎁'
  }

  return (
    <Table.Root variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Offer</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Inventory</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Valid Until</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {offers.map((offer) => (
          <Table.Row
            key={offer.id}
            onClick={() => onSelectOffer(offer)}
            style={{ cursor: 'pointer' }}
          >
            <Table.Cell>
              <Flex align="center" gap="2">
                <Text size="4">{getOfferIcon(offer.type)}</Text>
                <Box>
                  <Text weight="bold">{offer.name}</Text>
                  <Text size="2" color="gray" style={{ display: 'block' }}>
                    {offer.description?.substring(0, 60)}
                    {offer.description?.length > 60 ? '...' : ''}
                  </Text>
                </Box>
              </Flex>
            </Table.Cell>

            <Table.Cell>
              <Badge variant="soft">{offer.type || 'other'}</Badge>
            </Table.Cell>

            <Table.Cell>
              {offer.value > 0 ? (
                <Text>{offer.currency} ${offer.value}</Text>
              ) : (
                <Text color="gray">-</Text>
              )}
            </Table.Cell>

            <Table.Cell>
              {offer.totalInventory > 0 ? (
                <Flex align="center" gap="1">
                  <Text>{offer.totalInventory - (offer.redeemedCount || 0)}</Text>
                  <Text color="gray" size="2">/ {offer.totalInventory}</Text>
                </Flex>
              ) : (
                <Text color="gray">Unlimited</Text>
              )}
            </Table.Cell>

            <Table.Cell>
              <Text size="2">{formatDate(offer.endDate)}</Text>
            </Table.Cell>

            <Table.Cell>
              {offer.active ? (
                <Badge color="green">Active</Badge>
              ) : (
                <Badge color="gray">Inactive</Badge>
              )}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
