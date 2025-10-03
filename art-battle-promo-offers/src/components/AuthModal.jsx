import { useState } from 'react'
import { Box, Heading, Text, TextField, Button, Flex, Dialog, Spinner } from '@radix-ui/themes'
import { useAuth } from '../contexts/AuthContext'

export default function AuthModal({ onClose }) {
  const { signIn, verifyOtp } = useAuth()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('phone') // 'phone' or 'otp'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSendOTP() {
    if (!phone || phone.length < 10) {
      setError('Please enter a valid phone number')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Ensure phone is in E.164 format
      let formattedPhone = phone.replace(/\D/g, '')
      if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
        formattedPhone = '1' + formattedPhone
      }

      await signIn(`+${formattedPhone}`)
      setStep('otp')
    } catch (err) {
      console.error('Error sending OTP:', err)
      setError('Failed to send verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOTP() {
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      let formattedPhone = phone.replace(/\D/g, '')
      if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
        formattedPhone = '1' + formattedPhone
      }

      await verifyOtp(`+${formattedPhone}`, otp)
      // Auth context will handle the session update
      onClose()
    } catch (err) {
      console.error('Error verifying OTP:', err)
      setError('Invalid verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={true}>
      <Dialog.Content style={{ maxWidth: '400px' }}>
        <Flex direction="column" gap="4">
          <Box style={{ textAlign: 'center' }}>
            <img
              src="https://artb.tor1.cdn.digitaloceanspaces.com/img/AB-HWOT1.png"
              alt="Art Battle"
              style={{ height: '48px', width: 'auto', margin: '0 auto' }}
            />
            <Heading size="6" mt="3">Admin Login</Heading>
            <Text size="2" color="gray">
              {step === 'phone' ? 'Enter your phone number' : 'Enter verification code'}
            </Text>
          </Box>

          {error && (
            <Box p="3" style={{ background: 'var(--red-3)', borderRadius: 'var(--radius-3)' }}>
              <Text size="2" color="red">{error}</Text>
            </Box>
          )}

          {step === 'phone' ? (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" mb="1" weight="bold">Phone Number</Text>
                <TextField.Root
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  disabled={loading}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendOTP()}
                />
              </Box>

              <Button onClick={handleSendOTP} disabled={loading}>
                {loading ? <Spinner /> : 'Send Verification Code'}
              </Button>
            </Flex>
          ) : (
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" mb="1" weight="bold">Verification Code</Text>
                <TextField.Root
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength="6"
                  disabled={loading}
                  onKeyPress={(e) => e.key === 'Enter' && handleVerifyOTP()}
                />
                <Text size="1" color="gray" mt="1">
                  Code sent to {phone}
                </Text>
              </Box>

              <Flex gap="2">
                <Button
                  variant="soft"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setStep('phone')
                    setOtp('')
                    setError(null)
                  }}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button style={{ flex: 1 }} onClick={handleVerifyOTP} disabled={loading}>
                  {loading ? <Spinner /> : 'Verify'}
                </Button>
              </Flex>
            </Flex>
          )}

          <Text size="1" color="gray" style={{ textAlign: 'center' }}>
            This area is restricted to Art Battle HQ administrators
          </Text>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
