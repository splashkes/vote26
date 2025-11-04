import { Box, Card, Heading, Text, TextField, Flex, Checkbox, Button } from '@radix-ui/themes'
import { useState } from 'react'

/**
 * SMS Marketing Opt-In Component
 *
 * This is a MOCK UI component for screenshot purposes only.
 * It demonstrates the SMS marketing preferences interface with two-step flow.
 *
 * To use: Import and render in PublicOfferViewer
 * To remove: Simply remove the import and component usage
 */
export default function SmsMarketingOptIn() {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [phone] = useState('+1 (555) 123-4567') // Mock phone number

  // Email preferences (default ON)
  const [emailUpcoming, setEmailUpcoming] = useState(true)
  const [emailOffers, setEmailOffers] = useState(true)
  const [emailCritical, setEmailCritical] = useState(true)

  // SMS preferences (default OFF)
  const [smsUpcoming, setSmsUpcoming] = useState(false)
  const [smsOffers, setSmsOffers] = useState(false)
  const [smsCritical, setSmsCritical] = useState(false)

  const handleEmailSubmit = () => {
    if (email) setStep(2)
  }

  if (step === 1) {
    return (
      <Card style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <Flex direction="column" gap="4">
          <Box>
            <Heading size="5" mb="2">Communication Preferences</Heading>
            <Text size="2" color="gray">Stay connected with Art Battle</Text>
          </Box>

          <Box>
            <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
              Email Address
            </Text>
            <TextField.Root
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="3"
              onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
            />
          </Box>

          <Button size="3" onClick={handleEmailSubmit} disabled={!email}>
            Continue
          </Button>
        </Flex>
      </Card>
    )
  }

  return (
    <Card style={{ maxWidth: '700px', margin: '2rem auto' }}>
      <Flex direction="column" gap="4">
        <Box>
          <Heading size="5" mb="3">Communication Preferences</Heading>
          <Box mb="2">
            <Text size="2" weight="bold">Email: {email}</Text>
          </Box>
          <Box>
            <Text size="2" weight="bold">Mobile: {phone}</Text>
          </Box>
        </Box>

        {/* Two-column checkboxes */}
        <Box>
          {/* Header Row */}
          <Flex gap="4" mb="3" style={{ borderBottom: '1px solid var(--gray-6)', paddingBottom: '8px' }}>
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium">Notifications</Text>
            </Box>
            <Box style={{ width: '80px', textAlign: 'center' }}>
              <Text size="1" weight="bold" color="gray">Email</Text>
            </Box>
            <Box style={{ width: '80px', textAlign: 'center' }}>
              <Text size="1" weight="bold" color="gray">SMS*</Text>
            </Box>
          </Flex>

          {/* Upcoming Events Row */}
          <Flex gap="4" mb="3" align="center">
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium">Upcoming Events</Text>
              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                Get notified about Art Battle events in your area
              </Text>
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={emailUpcoming} onCheckedChange={setEmailUpcoming} size="2" />
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={smsUpcoming} onCheckedChange={setSmsUpcoming} size="2" />
            </Box>
          </Flex>

          {/* Special Offers Row */}
          <Flex gap="4" mb="3" align="center">
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium">Special Offers</Text>
              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                Receive exclusive discounts and promotional offers
              </Text>
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={emailOffers} onCheckedChange={setEmailOffers} size="2" />
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={smsOffers} onCheckedChange={setSmsOffers} size="2" />
            </Box>
          </Flex>

          {/* Critical Messages Row - No email option */}
          <Flex gap="4" align="center">
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium">Critical Transaction Messages</Text>
              <Text size="1" color="gray" style={{ display: 'block', marginTop: '2px' }}>
                Important account and transaction updates only
              </Text>
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              {/* No checkbox for email transactions */}
            </Box>
            <Box style={{ width: '80px', display: 'flex', justifyContent: 'center' }}>
              <Checkbox checked={smsCritical} onCheckedChange={setSmsCritical} size="2" />
            </Box>
          </Flex>

          {/* Quick Selection Buttons */}
          <Flex gap="2" wrap="wrap" mt="3" justify="center">
            <Button
              size="2"
              variant="soft"
              color="gray"
              style={{ opacity: 0.5 }}
              onClick={() => {
                setEmailUpcoming(false)
                setEmailOffers(false)
                setSmsUpcoming(false)
                setSmsOffers(false)
                setSmsCritical(false)
              }}
            >
              No to All
            </Button>
            <Button size="2" variant="soft" onClick={() => {
              setEmailUpcoming(false)
              setEmailOffers(true)
              setSmsUpcoming(false)
              setSmsOffers(true)
              setSmsCritical(false)
            }}>
              Special Offers Only
            </Button>
            <Button size="2" variant="soft" onClick={() => {
              setEmailUpcoming(false)
              setEmailOffers(false)
              setSmsUpcoming(false)
              setSmsOffers(false)
              setSmsCritical(true)
            }}>
              Transactions Only
            </Button>
            <Button
              size="2"
              color="green"
              onClick={() => {
                setEmailUpcoming(true)
                setEmailOffers(true)
                setSmsUpcoming(true)
                setSmsOffers(true)
                setSmsCritical(true)
              }}
            >
              Yes to All
            </Button>
          </Flex>
        </Box>

        {/* CTIA Compliance Disclosure */}
        <Box style={{
          marginTop: '1rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--gray-6)'
        }}>
          <Text size="1" style={{ color: 'var(--gray-11)', lineHeight: '1.6' }}>
            <Text weight="medium">* SMS Disclosure:</Text> Reply STOP to opt out. Reply HELP for help. Standard message and data rates may apply.
            Message frequency may vary. View our{' '}
            <a href="#" style={{ color: 'var(--accent-9)', textDecoration: 'underline' }}>Terms and Conditions</a>
            . View our{' '}
            <a href="#" style={{ color: 'var(--accent-9)', textDecoration: 'underline' }}>Privacy Policy</a>.
          </Text>
        </Box>

        <Box style={{
          paddingTop: '0.5rem'
        }}>
          <Text size="1" style={{ fontStyle: 'italic', color: 'var(--gray-11)' }}>
            You can change your preferences anytime in your profile.
          </Text>
        </Box>

        {/* Done Button */}
        <Flex justify="end" mt="2">
          <Button size="3" color="green">
            DONE
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}
