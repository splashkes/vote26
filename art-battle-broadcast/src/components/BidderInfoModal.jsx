import React, { useState } from 'react';
import { Dialog, Button, TextField, Box, Flex, Text, Heading } from '@radix-ui/themes';
import { supabase } from '../lib/supabase';

const BidderInfoModal = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  userPhone,
  existingInfo = {} 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    first_name: existingInfo.first_name || '',
    last_name: existingInfo.last_name || '',
    nickname: existingInfo.nickname || '',
    email: existingInfo.email || ''
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const generateAuctionHandle = () => {
    const firstName = formData.first_name.trim();
    const lastName = formData.last_name.trim();

    if (firstName && lastName && !formData.nickname.trim()) {
      const lastInitial = lastName.charAt(0).toUpperCase();
      const auctionHandle = `${firstName} ${lastInitial}.`;
      setFormData(prev => ({
        ...prev,
        nickname: auctionHandle
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      if (!formData.first_name.trim()) {
        setError('First name is required');
        setLoading(false);
        return;
      }

      if (!formData.last_name.trim()) {
        setError('Last name is required');
        setLoading(false);
        return;
      }

      // Get current session token, refresh if needed
      let { data: { session } } = await supabase.auth.getSession();

      // If no session or token is expired, try to refresh
      if (!session?.access_token) {
        const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
        session = refreshedSession;
      }

      if (!session?.access_token) {
        throw new Error('Please sign in again to update your information');
      }

      // Call edge function to update bidder info
      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/update-bidder-info',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        }
      );

      const result = await response.json();

      if (!response.ok) {
        // Log debug info for ALL error responses
        if (result.debug) {
          console.log(`🚨 Edge function error debug (${response.status}):`, result.debug);
        }

        if (response.status === 401) {
          throw new Error('Session expired. Please refresh the page and try again.');
        }
        throw new Error(result.error || `Failed to update bidder information (${response.status})`);
      }

      if (result.success) {
        // Call success callback with updated info
        onSuccess({
          name: result.name,
          nickname: result.nickname,
          email: result.email,
          phone: result.phone
        });
        onClose();
      } else {
        throw new Error(result.error || 'Update failed');
      }

    } catch (error) {
      console.error('🚨 Error updating bidder info:', error);
      console.error('🚨 Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setError(error.message || 'Failed to update information. Please try again.');
    }

    setLoading(false);
  };

  const handleSkip = () => {
    // User can skip and continue bidding
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: 450 }}>
        <Dialog.Title>
          <Heading size="4" mb="2">
            Complete Your Bidder Information
          </Heading>
        </Dialog.Title>
        
        <Dialog.Description size="2" color="gray" mb="4">
          Help us process your payment faster by completing your information. 
          You can skip this and still place bids, but we'll need this info if you win.
        </Dialog.Description>

        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            {/* First Name */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                First Name *
              </Text>
              <TextField.Root
                value={formData.first_name}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                placeholder="Enter your first name"
                disabled={loading}
                required
              />
            </Box>

            {/* Last Name */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Last Name *
              </Text>
              <TextField.Root
                value={formData.last_name}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                onBlur={generateAuctionHandle}
                placeholder="Enter your last name"
                disabled={loading}
                required
              />
            </Box>

            {/* Nickname (Optional) */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Auction handle
              </Text>
              <TextField.Root
                value={formData.nickname}
                onChange={(e) => handleInputChange('nickname', e.target.value)}
                placeholder="How you'd like to be called"
                disabled={loading}
              />
            </Box>

            {/* Email (Optional) */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Email (Optional)
              </Text>
              <TextField.Root
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="your.email@example.com"
                disabled={loading}
              />
            </Box>

            {/* Phone Display */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Phone Number
              </Text>
              <TextField.Root
                value={userPhone || 'Not available'}
                disabled
                style={{ opacity: 0.6 }}
              />
              <Text size="1" color="gray">
                This is the phone number you used to sign in
              </Text>
            </Box>

            {/* Error Message */}
            {error && (
              <Box>
                <Text size="2" color="red">
                  {error}
                </Text>
              </Box>
            )}

            {/* Action Buttons */}
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close asChild>
                <Button 
                  variant="soft" 
                  color="gray" 
                  onClick={handleSkip}
                  disabled={loading}
                >
                  Skip for Now
                </Button>
              </Dialog.Close>
              
              <Button 
                type="submit" 
                loading={loading}
                disabled={!formData.first_name.trim() || !formData.last_name.trim()}
              >
                Save Information
              </Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default BidderInfoModal;