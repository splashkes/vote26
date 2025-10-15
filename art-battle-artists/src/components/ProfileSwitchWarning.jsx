import { useState, useEffect } from 'react';
import { Card, Flex, Text, Button, Badge, Callout, Dialog, Grid, Heading } from '@radix-ui/themes';
import { ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const ProfileSwitchWarning = ({ currentProfile, onProfileSwitch }) => {
  const [loading, setLoading] = useState(true);
  const [otherProfiles, setOtherProfiles] = useState([]);
  const [hasOtherProfilesWithBalance, setHasOtherProfilesWithBalance] = useState(false);
  const [totalOtherBalance, setTotalOtherBalance] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkOtherProfiles();
  }, [currentProfile?.id]);

  const checkOtherProfiles = async () => {
    if (!currentProfile?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('check-other-profiles-balance');

      if (error) {
        console.error('Error checking other profiles:', error);
        setLoading(false);
        return;
      }

      console.log('Other profiles check result:', data);

      setOtherProfiles(data.otherProfiles || []);
      setHasOtherProfilesWithBalance(data.hasOtherProfilesWithBalance || false);
      setTotalOtherBalance(data.totalOtherBalance || 0);
      setLoading(false);
    } catch (err) {
      console.error('Error checking other profiles:', err);
      setLoading(false);
    }
  };

  const handleViewProfiles = () => {
    setShowModal(true);
  };

  const handleSelectProfile = (profile) => {
    setSelectedProfile(profile);
    setShowConfirmDialog(true);
  };

  const handleConfirmSwitch = async () => {
    if (!selectedProfile) return;

    setSwitching(true);
    setError(null);

    try {
      // Call the same edge function that the profile picker uses
      const { data: result, error: setPrimaryError } = await supabase.functions.invoke('set-primary-profile', {
        body: {
          profile_id: selectedProfile.id,
          target_person_id: currentProfile.person_id
        }
      });

      if (setPrimaryError || !result?.success) {
        throw new Error(result?.message || setPrimaryError?.message || 'Failed to switch profiles');
      }

      console.log('Profile switched successfully to:', selectedProfile.name);

      // Close dialogs
      setShowConfirmDialog(false);
      setShowModal(false);

      // Notify parent component to refresh
      if (onProfileSwitch) {
        onProfileSwitch(selectedProfile);
      } else {
        // Force page reload if no callback provided
        window.location.reload();
      }
    } catch (err) {
      console.error('Error switching profile:', err);
      setError(err.message);
      setSwitching(false);
    }
  };

  if (loading || !hasOtherProfilesWithBalance) {
    return null;
  }

  return (
    <>
      <Card size="3" style={{ backgroundColor: 'var(--amber-2)', borderColor: 'var(--amber-6)' }}>
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <ExclamationTriangleIcon width="24" height="24" style={{ color: 'var(--amber-11)' }} />
            <Heading size="5" style={{ color: 'var(--amber-11)' }}>
              Money on Another Profile
            </Heading>
          </Flex>

          <Text size="3">
            You have <Text weight="bold" style={{ color: 'var(--amber-11)' }}>${totalOtherBalance.toFixed(2)}</Text> owed
            on {otherProfiles.length === 1 ? 'another profile' : `${otherProfiles.length} other profiles`}.
          </Text>

          <Callout.Root color="amber">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              <Text size="2" weight="bold">Current profile:</Text> {currentProfile.name} (#{currentProfile.entry_id})
            </Callout.Text>
          </Callout.Root>

          <Button variant="solid" color="amber" onClick={handleViewProfiles}>
            View Other Profiles
          </Button>
        </Flex>
      </Card>

      {/* Modal showing other profiles */}
      <Dialog.Root open={showModal} onOpenChange={setShowModal}>
        <Dialog.Content style={{ maxWidth: 800 }}>
          <Dialog.Title>Other Profiles With Outstanding Balance</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            You have money owed on the following profile{otherProfiles.length > 1 ? 's' : ''}.
            You can switch to one of these profiles to access your funds.
          </Dialog.Description>

          {error && (
            <Callout.Root color="red" mb="4">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Flex direction="column" gap="4">
            {otherProfiles.map((profile) => (
              <Card key={profile.id} size="2">
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start">
                    <Flex direction="column" gap="1">
                      <Text size="4" weight="bold" style={{ color: 'var(--crimson-11)' }}>
                        {profile.name || 'Unnamed Profile'}
                      </Text>
                      <Text size="2" color="gray">Profile #{profile.entry_id}</Text>
                    </Flex>

                    <Flex direction="column" gap="2" align="end">
                      <Badge color="orange" variant="solid" size="2">
                        💰 ${profile.outstandingBalance.toFixed(2)} owed
                      </Badge>
                      <Button
                        size="2"
                        color="green"
                        onClick={() => handleSelectProfile(profile)}
                        disabled={switching}
                      >
                        Switch to This Profile
                      </Button>
                    </Flex>
                  </Flex>

                  <Grid columns={{ initial: '1', md: '2' }} gap="3">
                    <Flex direction="column" gap="2">
                      {profile.email && (
                        <Text size="2">📧 {profile.email}</Text>
                      )}
                      {profile.phone && (
                        <Text size="2">📱 {profile.phone}</Text>
                      )}
                      {profile.city && (
                        <Text size="2">📍 {profile.city}, {profile.country}</Text>
                      )}
                      {profile.artworkCount > 0 && (
                        <Badge color="blue" variant="soft">
                          {profile.artworkCount} artwork{profile.artworkCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </Flex>

                    {profile.sampleWorks && profile.sampleWorks.length > 0 && (
                      <Grid columns="3" gap="2">
                        {profile.sampleWorks.slice(0, 3).map((work, idx) => (
                          <img
                            key={idx}
                            src={work.url}
                            alt={`Sample work ${idx + 1}`}
                            style={{
                              width: '100%',
                              height: '80px',
                              objectFit: 'cover',
                              borderRadius: '4px'
                            }}
                          />
                        ))}
                      </Grid>
                    )}
                  </Grid>
                </Flex>
              </Card>
            ))}
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Confirmation dialog with warnings */}
      <Dialog.Root open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>⚠️ Confirm Profile Switch</Dialog.Title>

          <Flex direction="column" gap="4" mt="3">
            <Callout.Root color="red">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                <Text size="2" weight="bold">Warning: This action cannot be undone easily.</Text>
              </Callout.Text>
            </Callout.Root>

            <Text size="2">
              You are about to switch from:
            </Text>

            <Card size="1" style={{ backgroundColor: 'var(--gray-3)' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">Current profile:</Text>
                <Text size="3" weight="bold">{currentProfile.name} (#{currentProfile.entry_id})</Text>
              </Flex>
            </Card>

            <Text size="2">To:</Text>

            <Card size="1" style={{ backgroundColor: 'var(--green-3)' }}>
              <Flex direction="column" gap="1">
                <Text size="2" color="gray">New profile:</Text>
                <Text size="3" weight="bold">{selectedProfile?.name} (#{selectedProfile?.entry_id})</Text>
                <Badge color="orange" variant="solid" size="1" style={{ width: 'fit-content' }}>
                  💰 ${selectedProfile?.outstandingBalance.toFixed(2)} owed
                </Badge>
              </Flex>
            </Card>

            <Callout.Root color="amber">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                <Text size="2">
                  <Text weight="bold">What will happen:</Text><br />
                  • Your future logins will use the new profile<br />
                  • Your current profile will remain in the system<br />
                  • All payment information stays with each profile<br />
                  <br />
                  <Text weight="bold">Important:</Text><br />
                  If you need to merge profile data (bio, photos, applications), please contact support.
                </Text>
              </Callout.Text>
            </Callout.Root>

            {error && (
              <Callout.Root color="red">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray" disabled={switching}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="solid"
              color="red"
              onClick={handleConfirmSwitch}
              disabled={switching}
            >
              {switching ? 'Switching...' : 'Confirm Switch'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export default ProfileSwitchWarning;
