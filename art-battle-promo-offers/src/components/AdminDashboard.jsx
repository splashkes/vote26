import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Container, Heading, Flex, Button, Text, Card, Spinner, TextField, Dialog } from '@radix-ui/themes'
import { PlusIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useAuth } from '../contexts/AuthContext'
import { fetchAllOffers } from '../lib/api'
import OffersList from './OffersList'
import OfferDetail from './OfferDetail'
import AuthModal from './AuthModal'

export default function AdminDashboard() {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const { offerId } = useParams()
  const navigate = useNavigate()

  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        setShowAuthModal(true)
      } else if (!isAdmin) {
        // User is logged in but not an admin
        setLoading(false)
      } else {
        loadOffers()
      }
    }
  }, [authLoading, user, isAdmin])

  useEffect(() => {
    // Load specific offer if offerId in URL
    if (offerId && offers.length > 0) {
      const offer = offers.find(o => o.id === offerId)
      if (offer) {
        setSelectedOffer(offer)
      }
    }
  }, [offerId, offers])

  async function loadOffers() {
    try {
      const data = await fetchAllOffers()
      setOffers(data)
    } catch (error) {
      console.error('Error loading offers:', error)
    } finally {
      setLoading(false)
    }
  }

  function handleCreateOffer() {
    setSelectedOffer({ id: 'new' })
  }

  function handleSelectOffer(offer) {
    setSelectedOffer(offer)
    navigate(`/admin/offers/${offer.id}`)
  }

  function handleCloseDetail() {
    setSelectedOffer(null)
    navigate('/admin')
  }

  function handleOfferUpdate(updatedOffer) {
    if (updatedOffer.id === 'new') {
      // New offer created
      loadOffers()
    } else {
      // Existing offer updated
      setOffers(offers.map(o => o.id === updatedOffer.id ? updatedOffer : o))
    }
    handleCloseDetail()
  }

  function handleOfferDelete(offerId) {
    setOffers(offers.filter(o => o.id !== offerId))
    handleCloseDetail()
  }

  const filteredOffers = offers.filter(offer => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      offer.name?.toLowerCase().includes(query) ||
      offer.description?.toLowerCase().includes(query) ||
      offer.type?.toLowerCase().includes(query)
    )
  })

  // Auth modal
  if (showAuthModal) {
    return <AuthModal onClose={() => setShowAuthModal(false)} />
  }

  // Not authorized
  if (!authLoading && user && !isAdmin) {
    return (
      <Container size="2" style={{ paddingTop: '4rem' }}>
        <Flex direction="column" align="center" gap="4" style={{ textAlign: 'center' }}>
          <Text size="9">🔒</Text>
          <Heading size="8">Access Denied</Heading>
          <Text size="4" color="gray">You don't have permission to access the admin dashboard.</Text>
          <Text size="2" color="gray">
            This area is restricted to Art Battle HQ administrators only.
          </Text>
        </Flex>
      </Container>
    )
  }

  // Loading
  if (authLoading || loading) {
    return (
      <Flex direction="column" align="center" justify="center" style={{ minHeight: '100vh', gap: '1rem' }}>
        <Spinner size="3" />
        <Text color="gray">Loading...</Text>
      </Flex>
    )
  }

  return (
    <Box style={{ minHeight: '100vh', background: 'var(--gray-1)' }}>
      {/* Header */}
      <Box style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'var(--gray-2)',
        borderBottom: '1px solid var(--gray-6)',
        padding: '1rem 0'
      }}>
        <Container size="4">
          <Flex justify="between" align="center">
            <Flex align="center" gap="3">
              <img
                src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
                alt="Art Battle"
                style={{ height: '40px', width: 'auto' }}
              />
              <Box>
                <Heading size="5">Promo Offers</Heading>
                <Text size="2" color="gray">Admin Dashboard</Text>
              </Box>
            </Flex>

            <Button onClick={handleCreateOffer}>
              <PlusIcon /> Create Offer
            </Button>
          </Flex>
        </Container>
      </Box>

      {/* Main content */}
      <Container size="4" style={{ padding: '2rem 1rem' }}>
        {/* Search */}
        <Box mb="4">
          <TextField.Root
            placeholder="Search offers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="3"
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
        </Box>

        {/* Stats */}
        <Flex gap="4" mb="4">
          <Card style={{ flex: 1 }}>
            <Text size="2" color="gray">Total Offers</Text>
            <Heading size="6">{offers.length}</Heading>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text size="2" color="gray">Active Offers</Text>
            <Heading size="6">{offers.filter(o => o.active).length}</Heading>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text size="2" color="gray">Inactive Offers</Text>
            <Heading size="6">{offers.filter(o => !o.active).length}</Heading>
          </Card>
        </Flex>

        {/* Offers list */}
        <OffersList
          offers={filteredOffers}
          onSelectOffer={handleSelectOffer}
        />
      </Container>

      {/* Offer detail dialog */}
      <Dialog.Root open={!!selectedOffer} onOpenChange={handleCloseDetail}>
        <Dialog.Content style={{ maxWidth: '900px', maxHeight: '90vh' }}>
          {selectedOffer && (
            <OfferDetail
              offer={selectedOffer}
              onUpdate={handleOfferUpdate}
              onDelete={handleOfferDelete}
              onClose={handleCloseDetail}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  )
}
