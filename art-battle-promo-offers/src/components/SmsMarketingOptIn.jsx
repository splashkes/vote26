import { Box, Card, Heading, Text, TextField, Flex, Switch } from '@radix-ui/themes'
import { useState } from 'react'

/**
 * SMS Marketing Opt-In Component
 *
 * This is a MOCK UI component for screenshot purposes only.
 * It demonstrates the SMS marketing preferences interface.
 *
 * To use: Import and render in PublicOfferViewer
 * To remove: Simply remove the import and component usage
 */
export default function SmsMarketingOptIn() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [upcomingEvents, setUpcomingEvents] = useState(true)
  const [specialOffers, setSpecialOffers] = useState(true)
  const [criticalOnly, setCriticalOnly] = useState(false)

  return (
    <Card style={{ maxWidth: '500px', margin: '2rem auto' }}>
      <Flex direction="column" gap="4">
        <Box>
          <Heading size="5" mb="2">SMS Notifications</Heading>
          <Text size="2" color="gray">Stay connected with Art Battle</Text>
        </Box>

        <Box>
          <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
            Name
          </Text>
          <TextField.Root
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="2"
          />
        </Box>

        <Box>
          <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
            Phone Number
          </Text>
          <TextField.Root
            placeholder="+1 (555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            size="2"
          />
        </Box>

        <Box>
          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
            Get notifications for:
          </Text>

          <Flex direction="column" gap="3">
            <Flex justify="between" align="center">
              <Box>
                <Text size="2" weight="medium">Upcoming Events</Text>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                  Get notified about Art Battle events in your area
                </Text>
              </Box>
              <Switch
                checked={upcomingEvents}
                onCheckedChange={setUpcomingEvents}
                size="2"
              />
            </Flex>

            <Flex justify="between" align="center">
              <Box>
                <Text size="2" weight="medium">Special Offers</Text>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                  Receive exclusive discounts and promotional offers
                </Text>
              </Box>
              <Switch
                checked={specialOffers}
                onCheckedChange={setSpecialOffers}
                size="2"
              />
            </Flex>

            <Flex justify="between" align="center">
              <Box>
                <Text size="2" weight="medium">Only Critical Transaction Messages</Text>
                <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                  Only receive important account and transaction updates
                </Text>
              </Box>
              <Switch
                checked={criticalOnly}
                onCheckedChange={setCriticalOnly}
                size="2"
              />
            </Flex>
          </Flex>
        </Box>

        <Box style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--gray-6)'
        }}>
          <Text size="1" style={{ fontStyle: 'italic', color: 'var(--gray-11)' }}>
            You can change your preferences anytime in your profile or send UNSUBSCRIBE
            as a reply to any messages we send you.
          </Text>
        </Box>
      </Flex>
    </Card>
  )
}
