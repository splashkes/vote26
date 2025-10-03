import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Box, Container, Heading, Text, Card, Flex, Button, Dialog, Spinner, Badge, ScrollArea } from '@radix-ui/themes'
import { fetchOffersForHash, redeemOffer, trackOfferView } from '../lib/api'
import './PublicOfferViewer.css'

export default function PublicOfferViewer() {
  const { hash } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userData, setUserData] = useState(null)
  const [eligibleOffers, setEligibleOffers] = useState([])
  const [ineligibleOffers, setIneligibleOffers] = useState([])
  const [selectedOffer, setSelectedOffer] = useState(null)
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [redemptionResult, setRedemptionResult] = useState(null)

  useEffect(() => {
    if (!hash) {
      setError('Invalid offer link')
      setLoading(false)
      return
    }

    fetchOffers()
  }, [hash])

  async function fetchOffers() {
    try {
      const data = await fetchOffersForHash(hash)

      setUserData(data.user || {})
      setEligibleOffers(data.eligibleOffers || [])
      setIneligibleOffers(data.ineligibleOffers || [])
      setLoading(false)
    } catch (err) {
      console.error('Error fetching offers:', err)
      setError('Unable to load your offers. Please try again later.')
      setLoading(false)
    }
  }

  function handleOfferClick(offer) {
    setSelectedOffer(offer)
    trackOfferView(offer.id, hash, 'detail')
  }

  async function handleRedeemOffer() {
    if (!selectedOffer) return

    setIsRedeeming(true)

    try {
      const result = await redeemOffer(selectedOffer.id, hash)
      setRedemptionResult(result)

      // Redirect if redemption link exists
      if (result.redemptionLink) {
        setTimeout(() => {
          window.location.href = result.redemptionLink
        }, 3000)
      }
    } catch (err) {
      setRedemptionResult({ error: err.message })
    } finally {
      setIsRedeeming(false)
    }
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

  function formatExpiryDate(endDate) {
    if (!endDate) return null

    const now = new Date()
    const end = new Date(endDate)
    const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24))

    // Only show if within 7 days
    if (diffDays <= 7 && diffDays > 0) {
      const month = end.getMonth() + 1
      const day = end.getDate()
      const year = end.getFullYear().toString().slice(-2)
      return `Expires: ${month}/${day}/${year}`
    }

    return null
  }

  function isOfferExpired(endDate) {
    if (!endDate) return false
    return new Date(endDate) <= new Date()
  }

  function getInventoryDisplay(offer) {
    const remaining = offer.totalInventory - (offer.redeemedCount || 0)
    if (remaining <= 0) return { text: 'SOLD OUT', color: 'red' }
    return { text: `${remaining} remaining`, color: 'blue' }
  }

  // Loading state
  if (loading) {
    const firstName = userData?.firstName || userData?.displayName?.split(' ')[0] || ''
    const greeting = firstName ? `Hi ${firstName}!` : ''

    return (
      <Box className="public-viewer">
        <Box className="header">
          <Container size="3">
            <Flex justify="between" align="center">
              <Box>
                <img
                  src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
                  alt="Art Battle"
                  style={{ height: '48px', width: 'auto' }}
                />
                <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                  Exclusive Offers
                </Text>
              </Box>
              {greeting && (
                <Box style={{ textAlign: 'right' }}>
                  <Heading size="5">{greeting}</Heading>
                </Box>
              )}
            </Flex>
          </Container>
        </Box>

        <Flex direction="column" align="center" justify="center" style={{ minHeight: '60vh', gap: '1rem' }}>
          <Spinner size="3" />
          <Heading size="5">{greeting || 'Loading...'}</Heading>
          <Text color="gray">We're gathering your personalized offers...</Text>
        </Flex>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box className="public-viewer">
        <Box className="header">
          <Container size="3">
            <Flex justify="center">
              <Box style={{ textAlign: 'center' }}>
                <img
                  src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
                  alt="Art Battle"
                  style={{ height: '48px', width: 'auto' }}
                />
                <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                  Exclusive Offers
                </Text>
              </Box>
            </Flex>
          </Container>
        </Box>

        <Container size="2" style={{ paddingTop: '4rem' }}>
          <Flex direction="column" align="center" gap="4" style={{ textAlign: 'center' }}>
            <Text size="9">🔗</Text>
            <Heading size="8">Invalid Link</Heading>
            <Text size="4" color="gray">{error}</Text>

            <Card style={{ width: '100%', marginTop: '2rem' }}>
              <Heading size="4" mb="3">Need help?</Heading>
              <Flex direction="column" gap="2">
                <Text size="2" color="gray">• Double-check your offer link for any typos</Text>
                <Text size="2" color="gray">• Try opening the link in a fresh browser window</Text>
                <Text size="2" color="gray">
                  • Contact us at <a href="mailto:hello@artbattle.com" style={{ color: 'var(--accent-9)' }}>hello@artbattle.com</a> for assistance
                </Text>
              </Flex>
            </Card>
          </Flex>
        </Container>
      </Box>
    )
  }

  // No offers state
  if (eligibleOffers.length === 0 && ineligibleOffers.length === 0) {
    const firstName = userData?.firstName || userData?.displayName?.split(' ')[0] || ''
    const greeting = firstName ? `Hi ${firstName}!` : 'Hi there!'

    return (
      <Box className="public-viewer">
        <Container size="2">
          <Flex direction="column" align="center" justify="center" gap="4" style={{ minHeight: '100vh', textAlign: 'center' }}>
            <Text size="9">🎁</Text>
            <Heading size="6">{greeting}</Heading>
            <Text size="4" color="gray">No offers available at this time!</Text>
            <Text size="2" color="gray">
              Feel free to reach out at <a href="mailto:hello@artbattle.com" style={{ color: 'var(--accent-9)' }}>hello@artbattle.com</a> to say hi.
            </Text>
          </Flex>
        </Container>
      </Box>
    )
  }

  // Main offers view
  const firstName = userData?.firstName || userData?.displayName?.split(' ')[0] || ''

  return (
    <Box className="public-viewer">
      {/* Header */}
      <Box className="header">
        <Container size="4">
          <Flex justify="between" align="center">
            <Box>
              <img
                src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
                alt="Art Battle"
                style={{ height: '48px', width: 'auto' }}
              />
              <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                Exclusive Offers
              </Text>
            </Box>
          </Flex>
        </Container>
      </Box>

      {/* Main content */}
      <Container size="4" style={{ padding: '2rem 1rem' }}>
        {/* Greeting */}
        {firstName && (
          <Box style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <Heading size="8" mb="2">Hi {firstName}!</Heading>
            <Text size="4" color="gray">Here are your personalized offers</Text>
          </Box>
        )}

        {/* Eligible offers */}
        {eligibleOffers.length > 0 && (
          <Box mb="6">
            <Flex align="center" gap="2" mb="4">
              <Text size="2">✨</Text>
              <Heading size="6">Available Offers</Heading>
              <Badge color="green">{eligibleOffers.length}</Badge>
            </Flex>

            <div className="offers-grid">
              {eligibleOffers.map((offer) => {
                const inventory = getInventoryDisplay(offer)
                const expiry = formatExpiryDate(offer.endDate)
                const expired = isOfferExpired(offer.endDate)

                return (
                  <Card
                    key={offer.id}
                    className="offer-card"
                    onClick={() => handleOfferClick(offer)}
                    style={{
                      cursor: 'pointer',
                      background: offer.tileColor || 'var(--accent-9)',
                      color: 'white',
                      opacity: expired ? 0.5 : 1
                    }}
                  >
                    <Flex direction="column" gap="3">
                      <Text size="8">{getOfferIcon(offer.type)}</Text>
                      <Heading size="5" style={{ color: 'white' }}>{offer.name}</Heading>
                      <Text size="2" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {offer.description}
                      </Text>

                      {offer.value > 0 && (
                        <Badge color="gray" size="2">
                          {offer.currency} ${offer.value} Value
                        </Badge>
                      )}

                      <Flex direction="column" gap="1" style={{ fontSize: '12px' }}>
                        {expiry && (
                          <Flex align="center" gap="1">
                            <Text>⏰</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{expiry}</Text>
                          </Flex>
                        )}
                        <Flex align="center" gap="1">
                          <Text>📦</Text>
                          <Text style={{ color: inventory.color === 'red' ? '#fca5a5' : 'rgba(255,255,255,0.8)' }}>
                            {inventory.text}
                          </Text>
                        </Flex>
                      </Flex>

                      <Flex justify="between" align="center" mt="2">
                        <Text size="2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          {expired ? 'Expired' : 'Claim Now'}
                        </Text>
                        <Text size="4">→</Text>
                      </Flex>
                    </Flex>
                  </Card>
                )
              })}
            </div>
          </Box>
        )}

        {/* Ineligible offers */}
        {ineligibleOffers.length > 0 && (
          <Box>
            <Flex align="center" gap="2" mb="4">
              <Text size="2">🔒</Text>
              <Heading size="6">Locked Offers</Heading>
              <Badge color="gray">{ineligibleOffers.length}</Badge>
            </Flex>

            <div className="offers-grid">
              {ineligibleOffers.map(({ offer }) => (
                <Card
                  key={offer.id}
                  className="offer-card locked"
                  style={{
                    cursor: 'not-allowed',
                    background: 'var(--gray-4)',
                    opacity: 0.5
                  }}
                >
                  <Flex direction="column" gap="3">
                    <Text size="8">{getOfferIcon(offer.type)}</Text>
                    <Heading size="5" color="gray">{offer.name}</Heading>
                    <Text size="2" color="gray">
                      {offer.description.substring(0, 60)}...
                    </Text>

                    <Flex justify="between" align="center" mt="2">
                      <Text size="2" color="gray">Not Available</Text>
                      <Text size="4">🔒</Text>
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </div>
          </Box>
        )}
      </Container>

      {/* Offer detail modal */}
      <Dialog.Root open={!!selectedOffer && !redemptionResult} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          {selectedOffer && (
            <ScrollArea>
              <Flex direction="column" gap="4">
                <Text size="8">{getOfferIcon(selectedOffer.type)}</Text>
                <Dialog.Title size="8">{selectedOffer.name}</Dialog.Title>
                <Text size="4" color="gray">{selectedOffer.description}</Text>

                {selectedOffer.terms && (
                  <Card>
                    <Heading size="4" mb="2">Terms & Conditions</Heading>
                    <Text size="2" color="gray" style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedOffer.terms}
                    </Text>
                  </Card>
                )}

                <Flex gap="3">
                  {formatExpiryDate(selectedOffer.endDate) && (
                    <Flex align="center" gap="1">
                      <Text>⏰</Text>
                      <Text size="2" color="gray">{formatExpiryDate(selectedOffer.endDate)}</Text>
                    </Flex>
                  )}
                  <Flex align="center" gap="1">
                    <Text>📦</Text>
                    <Text size="2" color="gray">{getInventoryDisplay(selectedOffer).text}</Text>
                  </Flex>
                </Flex>

                <Flex gap="3" mt="4">
                  <Button variant="soft" color="gray" style={{ flex: 1 }} onClick={() => setSelectedOffer(null)}>
                    Cancel
                  </Button>
                  <Button
                    style={{ flex: 1 }}
                    onClick={handleRedeemOffer}
                    disabled={isOfferExpired(selectedOffer.endDate) || getInventoryDisplay(selectedOffer).text === 'SOLD OUT'}
                  >
                    {isOfferExpired(selectedOffer.endDate) ? 'Expired' :
                     getInventoryDisplay(selectedOffer).text === 'SOLD OUT' ? 'Sold Out' :
                     'Redeem Offer'}
                  </Button>
                </Flex>
              </Flex>
            </ScrollArea>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Redemption modal */}
      <Dialog.Root open={!!redemptionResult} onOpenChange={(open) => !open && setRedemptionResult(null)}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Flex direction="column" align="center" gap="4" style={{ textAlign: 'center' }}>
            {isRedeeming ? (
              <>
                <Spinner size="3" />
                <Text color="gray">Processing your redemption...</Text>
              </>
            ) : redemptionResult?.error ? (
              <>
                <Text size="9">❌</Text>
                <Dialog.Title size="6">Redemption Failed</Dialog.Title>
                <Text color="gray">{redemptionResult.error}</Text>
                <Button onClick={() => setRedemptionResult(null)}>Close</Button>
              </>
            ) : (
              <>
                <Text size="9">✅</Text>
                <Dialog.Title size="6">Success!</Dialog.Title>
                <Text color="gray">
                  {selectedOffer?.redemptionMessage || 'Your offer has been redeemed'}
                </Text>

                {redemptionResult?.redemption?.redemptionCode && (
                  <Card style={{ width: '100%' }}>
                    <Text size="2" color="gray" mb="1">Redemption Code</Text>
                    <Heading size="6" style={{ fontFamily: 'monospace' }}>
                      {redemptionResult.redemption.redemptionCode}
                    </Heading>
                  </Card>
                )}

                {redemptionResult?.redemptionLink && (
                  <Text size="2" color="gray">Redirecting you in 3 seconds...</Text>
                )}
              </>
            )}
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  )
}
