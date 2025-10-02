import { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Button,
  TextField,
  Heading,
  Badge,
  Table,
  Separator,
  Callout,
  ScrollArea,
  Dialog,
  RadioGroup,
  Grid
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  InfoCircledIcon,
  ReloadIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const DuplicateProfileResolver = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [selectedArtistProfileId, setSelectedArtistProfileId] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);

  const searchProfiles = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setSearchResults(null);
    setSelectedPersonId(null);
    setSelectedArtistProfileId(null);
    setReconcileResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('admin-duplicate-profile-search', {
        body: { query: searchQuery.trim() }
      });

      if (error) throw error;
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      alert('Error searching profiles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedPersonId || !selectedArtistProfileId) {
      alert('Please select both a Person and an Artist Profile');
      return;
    }

    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reconcile-profile', {
        body: {
          phone_number: searchResults.search_type === 'phone' ? searchQuery.trim() : null,
          canonical_person_id: selectedPersonId,
          canonical_artist_profile_id: selectedArtistProfileId,
          all_person_ids: searchResults.profiles
            .filter(p => p.person)
            .map(p => p.person.id)
            .filter((id, idx, arr) => arr.indexOf(id) === idx),
          all_artist_profile_ids: searchResults.profiles.map(p => p.id)
        }
      });

      if (error) throw error;

      setReconcileResult(data);
      setShowConfirmDialog(false);

      if (data.success) {
        alert('✅ Reconciliation successful!\n\nRefreshing results...');
        searchProfiles();
      } else {
        alert('⚠️ Reconciliation completed with errors:\n\n' + (data.errors || []).join('\n'));
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
      alert('❌ Error during reconciliation: ' + err.message);
    } finally {
      setReconciling(false);
    }
  };


  return (
    <Box p="4">
      <Heading size="6" mb="2">Duplicate Artist Profile Resolution</Heading>
      <Text size="2" color="gray" mb="4" style={{ display: 'block' }}>
        Search by phone number, email, or artist name to find and merge duplicate profiles
      </Text>

      <Card size="3" mb="4">
        <Flex gap="3" align="end">
          <Box style={{ flex: 1 }}>
            <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
              Search Query
            </Text>
            <TextField.Root
              size="3"
              placeholder="e.g. 5148266476, email@example.com, or 'John Smith'"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchProfiles()}
            />
          </Box>
          <Button size="3" onClick={searchProfiles} disabled={loading}>
            {loading ? <ReloadIcon className="animate-spin" /> : <MagnifyingGlassIcon />}
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </Flex>
      </Card>

      {searchResults && searchResults.profiles && searchResults.profiles.length > 0 && (() => {
        // Group profiles by person_id and collect unique persons
        const uniquePersons = [];
        const personMap = new Map();

        searchResults.profiles.forEach(profile => {
          if (profile.person && profile.person.id && !personMap.has(profile.person.id)) {
            personMap.set(profile.person.id, profile.person);
            uniquePersons.push(profile.person);
          }
        });

        // Get USER info from first person with auth_user_id
        const userInfo = uniquePersons.find(p => p.auth_user_id);
        const phoneNumber = searchResults.search_type === 'phone' ? searchQuery :
                           uniquePersons.find(p => p.phone)?.phone || 'Unknown';

        // Check if already reconciled - find canonical profile
        const canonicalProfile = searchResults.profiles.find(p => !p.superseded_by);
        const supersededProfiles = searchResults.profiles.filter(p => p.superseded_by);
        const isAlreadyReconciled = supersededProfiles.length > 0 && canonicalProfile;
        const onlyOnePerson = uniquePersons.length === 1;
        const singlePerson = onlyOnePerson ? uniquePersons[0] : null;

        // Auto-select the single person if there's only one
        if (onlyOnePerson && singlePerson && !selectedPersonId) {
          setSelectedPersonId(singlePerson.id);
        }

        return (
          <>
            {/* USER Header */}
            <Card size="3" mb="4" style={{ backgroundColor: onlyOnePerson ? 'var(--green-2)' : 'var(--blue-2)' }}>
              <Flex direction="column" gap="2">
                <Heading size="5">
                  For USER {userInfo ? `(${userInfo.auth_user_id.slice(0, 8)}...)` : '(Not Linked)'} with phone number {phoneNumber}
                  {onlyOnePerson && singlePerson && (
                    <span style={{ color: 'var(--green-11)' }}> IS LINKED TO PERSON {singlePerson.id.slice(0, 8)}...</span>
                  )}
                </Heading>
                {onlyOnePerson && singlePerson && (
                  <Flex gap="3" mt="2" wrap="wrap">
                    {singlePerson.name && (
                      <Text size="2" weight="medium">👤 {singlePerson.name}</Text>
                    )}
                    {singlePerson.phone && (
                      <Text size="2">📱 {singlePerson.phone}</Text>
                    )}
                    {singlePerson.email && (
                      <Text size="2">✉️ {singlePerson.email}</Text>
                    )}
                    {singlePerson.has_login && (
                      <Badge color="green" size="1">🔐 Has Login</Badge>
                    )}
                  </Flex>
                )}
                {userInfo && userInfo.email && !onlyOnePerson && (
                  <Text size="2" color="gray">Email: {userInfo.email}</Text>
                )}
                {!onlyOnePerson && (
                  <Text size="2" weight="bold" color="blue">
                    Which PERSON and ARTIST_PROFILE do you want to link?
                  </Text>
                )}
                {onlyOnePerson && isAlreadyReconciled && (
                  <Badge color="green" size="2" style={{ marginTop: '8px' }}>
                    ✅ Reconciliation Complete
                  </Badge>
                )}
              </Flex>
            </Card>

            {/* Summary Card */}
            <Card size="2" mb="4">
              <Flex gap="4" align="center">
                <Box>
                  <Text size="1" color="gray">Total Profiles Found</Text>
                  <Text size="5" weight="bold">{searchResults.total_profiles}</Text>
                </Box>
                <Separator orientation="vertical" />
                <Box>
                  <Text size="1" color="gray">Unique Person Records</Text>
                  <Text size="5" weight="bold">{uniquePersons.length}</Text>
                </Box>
                <Separator orientation="vertical" />
                <Box>
                  <Text size="1" color="gray">Total Balance Owing</Text>
                  <Text size="5" weight="bold" color="green">
                    ${searchResults.profiles.reduce((sum, p) => sum + (p.outstanding_balance || 0), 0).toFixed(2)}
                  </Text>
                </Box>
              </Flex>
            </Card>

            {/* Two Column Selection OR Single Column if only one person */}
            {onlyOnePerson ? (
              /* Single Column: Just show profiles */
              <Card size="3" mb="4">
                <Heading size="4" mb="3">Artist Profiles</Heading>
                {isAlreadyReconciled && canonicalProfile ? (
                  <Callout.Root color="green" mb="3">
                    <Callout.Icon>
                      <CheckCircledIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      <strong>Single Linked Account:</strong> {canonicalProfile.name} (ID: {canonicalProfile.id.slice(0, 8)}...)
                      {canonicalProfile.outstanding_balance > 0 && ` • Balance: $${canonicalProfile.outstanding_balance.toFixed(2)}`}
                    </Callout.Text>
                  </Callout.Root>
                ) : !isAlreadyReconciled && searchResults.profiles.length > 1 ? (
                  <Callout.Root color="orange" mb="3">
                    <Callout.Icon>
                      <InfoCircledIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      <strong>Reconciliation Needed:</strong> Select the canonical artist profile below, then click Reconcile.
                    </Callout.Text>
                  </Callout.Root>
                ) : null}
                <RadioGroup.Root value={selectedArtistProfileId || ''} onValueChange={setSelectedArtistProfileId}>
                  <Flex direction="column" gap="3">
                    {searchResults.profiles.map((profile) => {
                      const isCanonical = !profile.superseded_by;
                      const isSuperseded = !!profile.superseded_by;

                      return (
                        <Card key={profile.id} size="2" style={{
                          backgroundColor: selectedArtistProfileId === profile.id ? 'var(--green-2)' :
                                          isSuperseded ? 'var(--gray-2)' : 'transparent',
                          cursor: 'pointer',
                          border: selectedArtistProfileId === profile.id ? '2px solid var(--green-9)' :
                                  isCanonical && isAlreadyReconciled ? '2px solid var(--green-7)' :
                                  '1px solid var(--gray-6)',
                          opacity: isSuperseded ? 0.7 : 1
                        }}>
                          <Flex gap="3" align="start">
                            <RadioGroup.Item value={profile.id} disabled={isAlreadyReconciled} />
                            <Box style={{ flex: 1 }}>
                              <Flex justify="between" align="start" mb="2">
                                <Box>
                                  <Flex gap="2" align="center" mb="1">
                                    <Text weight="bold" size="3">{profile.name}</Text>
                                    {isCanonical && isAlreadyReconciled && (
                                      <Badge color="green" size="1">⭐ CANONICAL</Badge>
                                    )}
                                    {isSuperseded && (
                                      <Badge color="gray" size="1">Superseded</Badge>
                                    )}
                                  </Flex>
                                  {profile.outstanding_balance > 0 && (
                                    <Text size="5" weight="bold" color="green" style={{ display: 'block' }}>
                                      💰 ${profile.outstanding_balance.toFixed(2)}
                                    </Text>
                                  )}
                                </Box>
                                {profile.person && (
                                  <Badge size="1" color="blue">
                                    → Person {profile.person.id.slice(0, 6)}
                                  </Badge>
                                )}
                              </Flex>
                              <Flex direction="column" gap="1">
                              {profile.email && (
                                <Text size="2">✉️ {profile.email}</Text>
                              )}
                              {profile.activity_counts.art > 0 && (
                                <Text size="2">🎨 {profile.activity_counts.art} art pieces</Text>
                              )}
                              {profile.activity_counts.artist_applications > 0 && (
                                <Text size="2">📝 {profile.activity_counts.artist_applications} applications</Text>
                              )}
                              {profile.activity_counts.artist_invitations > 0 && (
                                <Text size="2">📧 {profile.activity_counts.artist_invitations} invitations</Text>
                              )}
                              {profile.activity_counts.artist_payments > 0 && (
                                <Text size="2">💵 {profile.activity_counts.artist_payments} payments</Text>
                              )}
                              {profile.stripe_account && (
                                <Badge color="blue" size="1">✓ Stripe Connected</Badge>
                              )}
                              <Text size="1" color="gray">
                                Profile ID: {profile.id.slice(0, 8)}...
                              </Text>
                              <Text size="1" color="gray">
                                Created: {new Date(profile.created_at).toLocaleDateString()}
                              </Text>
                              {isSuperseded && profile.superseded_by && (
                                <Text size="1" color="orange">
                                  → Superseded by {profile.superseded_by.slice(0, 8)}...
                                </Text>
                              )}
                            </Flex>
                          </Box>
                        </Flex>
                      </Card>
                    );
                    })}
                  </Flex>
                </RadioGroup.Root>
              </Card>
            ) : (
              /* Two Column Grid: Show both person and profile selection */
              <Grid columns="2" gap="4" mb="4">
                {/* Left Column: Person Selection */}
                <Card size="3">
                  <Heading size="4" mb="3">Select PERSON to Link</Heading>
                  <RadioGroup.Root value={selectedPersonId || ''} onValueChange={setSelectedPersonId}>
                    <Flex direction="column" gap="3">
                      {uniquePersons.map((person) => (
                        <Card key={person.id} size="2" style={{
                          backgroundColor: selectedPersonId === person.id ? 'var(--green-2)' : 'transparent',
                          cursor: 'pointer',
                          border: selectedPersonId === person.id ? '2px solid var(--green-9)' : '1px solid var(--gray-6)'
                        }}>
                          <Flex gap="3" align="start">
                            <RadioGroup.Item value={person.id} />
                            <Box style={{ flex: 1 }}>
                              <Flex justify="between" align="start" mb="2">
                                <Text weight="bold" size="3">
                                  {person.name || 'Unnamed Person'}
                                </Text>
                                {person.has_login && (
                                  <Badge color="green" size="1">🔐 Has Login</Badge>
                                )}
                              </Flex>
                              <Flex direction="column" gap="1">
                                {person.phone && (
                                  <Text size="2">📱 {person.phone}</Text>
                                )}
                                {person.email && (
                                  <Text size="2">✉️ {person.email}</Text>
                                )}
                                <Text size="1" color="gray">
                                  Person ID: {person.id.slice(0, 8)}...
                                </Text>
                                {person.auth_user_id && (
                                  <Text size="1" color="gray">
                                    User ID: {person.auth_user_id.slice(0, 8)}...
                                  </Text>
                                )}
                              </Flex>
                            </Box>
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  </RadioGroup.Root>
                </Card>

                {/* Right Column: Artist Profile Selection */}
                <Card size="3">
                  <Heading size="4" mb="3">Select ARTIST_PROFILE to Link</Heading>
                  <RadioGroup.Root value={selectedArtistProfileId || ''} onValueChange={setSelectedArtistProfileId}>
                    <Flex direction="column" gap="3">
                      {searchResults.profiles.map((profile) => {
                        const isCanonical = !profile.superseded_by;
                        const isSuperseded = !!profile.superseded_by;

                        return (
                          <Card key={profile.id} size="2" style={{
                            backgroundColor: selectedArtistProfileId === profile.id ? 'var(--green-2)' :
                                            isSuperseded ? 'var(--gray-2)' : 'transparent',
                            cursor: 'pointer',
                            border: selectedArtistProfileId === profile.id ? '2px solid var(--green-9)' :
                                    isCanonical && isAlreadyReconciled ? '2px solid var(--green-7)' :
                                    '1px solid var(--gray-6)',
                            opacity: isSuperseded ? 0.7 : 1
                          }}>
                            <Flex gap="3" align="start">
                              <RadioGroup.Item value={profile.id} disabled={isAlreadyReconciled} />
                              <Box style={{ flex: 1 }}>
                                <Flex justify="between" align="start" mb="2">
                                  <Box>
                                    <Flex gap="2" align="center" mb="1">
                                      <Text weight="bold" size="3">{profile.name}</Text>
                                      {isCanonical && isAlreadyReconciled && (
                                        <Badge color="green" size="1">⭐ CANONICAL</Badge>
                                      )}
                                      {isSuperseded && (
                                        <Badge color="gray" size="1">Superseded</Badge>
                                      )}
                                    </Flex>
                                    {profile.outstanding_balance > 0 && (
                                      <Text size="5" weight="bold" color="green" style={{ display: 'block' }}>
                                        💰 ${profile.outstanding_balance.toFixed(2)}
                                      </Text>
                                    )}
                                  </Box>
                                  {profile.person && (
                                    <Badge size="1" color="blue">
                                      → Person {profile.person.id.slice(0, 6)}
                                    </Badge>
                                  )}
                                </Flex>
                                <Flex direction="column" gap="1">
                                  {profile.email && (
                                    <Text size="2">✉️ {profile.email}</Text>
                                  )}
                                  {profile.activity_counts.art > 0 && (
                                    <Text size="2">🎨 {profile.activity_counts.art} art pieces</Text>
                                  )}
                                  {profile.activity_counts.artist_applications > 0 && (
                                    <Text size="2">📝 {profile.activity_counts.artist_applications} applications</Text>
                                  )}
                                  {profile.activity_counts.artist_invitations > 0 && (
                                    <Text size="2">📧 {profile.activity_counts.artist_invitations} invitations</Text>
                                  )}
                                  {profile.activity_counts.artist_payments > 0 && (
                                    <Text size="2">💵 {profile.activity_counts.artist_payments} payments</Text>
                                  )}
                                  {profile.stripe_account && (
                                    <Badge color="blue" size="1">✓ Stripe Connected</Badge>
                                  )}
                                  <Text size="1" color="gray">
                                    Profile ID: {profile.id.slice(0, 8)}...
                                  </Text>
                                  <Text size="1" color="gray">
                                    Created: {new Date(profile.created_at).toLocaleDateString()}
                                  </Text>
                                  {isSuperseded && profile.superseded_by && (
                                    <Text size="1" color="orange">
                                      → Superseded by {profile.superseded_by.slice(0, 8)}...
                                    </Text>
                                  )}
                                </Flex>
                              </Box>
                            </Flex>
                          </Card>
                        );
                      })}
                    </Flex>
                  </RadioGroup.Root>
                </Card>
              </Grid>
            )}

            {/* Reconcile Button */}
            {selectedPersonId && selectedArtistProfileId && (
              <Card size="3" mb="4" style={{ backgroundColor: 'var(--green-2)' }}>
                <Flex justify="between" align="center">
                  <Box>
                    <Text weight="bold" size="4">Ready to Reconcile</Text>
                    <Text size="2" color="gray">
                      Person {selectedPersonId.slice(0, 8)}... will be linked to Artist Profile {selectedArtistProfileId.slice(0, 8)}...
                    </Text>
                  </Box>
                  <Button size="3" color="green" onClick={() => setShowConfirmDialog(true)}>
                    🔗 Reconcile for Phone {phoneNumber}
                  </Button>
                </Flex>
              </Card>
            )}
          </>
        );
      })()}

      {/* Confirmation Dialog */}
      <Dialog.Root open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <Dialog.Content maxWidth="600px">
          <Dialog.Title>Confirm Profile Reconciliation</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            This will set the canonical USER → PERSON → ARTIST_PROFILE chain and mark other records as superseded.
          </Dialog.Description>

          {searchResults && selectedPersonId && selectedArtistProfileId && (() => {
            const selectedPerson = searchResults.profiles.find(p => p.person && p.person.id === selectedPersonId)?.person;
            const selectedProfile = searchResults.profiles.find(p => p.id === selectedArtistProfileId);
            const phoneNumber = searchResults.search_type === 'phone' ? searchQuery :
                               selectedPerson?.phone || 'Unknown';

            return (
              <Box mb="4">
                <Callout.Root color="blue" mb="3">
                  <Callout.Icon>
                    <InfoCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    <strong>What will happen:</strong>
                    <br/>1. Artist Profile "{selectedProfile?.name}" will be linked to Person {selectedPersonId?.slice(0, 8)}
                    <br/>2. Person will be linked to USER with phone {phoneNumber}
                    <br/>3. All other Artist Profiles will be transferred to this Person
                    <br/>4. Other Persons will be marked as superseded
                  </Callout.Text>
                </Callout.Root>

                <Text weight="medium" mb="2" style={{ display: 'block' }}>
                  Selected PERSON (will be canonical):
                </Text>
                <Card size="1" mb="3" style={{ backgroundColor: 'var(--green-2)' }}>
                  <Text weight="medium">{selectedPerson?.name || 'Unnamed'}</Text>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    {selectedPerson?.email} • {selectedPerson?.phone}
                  </Text>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Person ID: {selectedPersonId?.slice(0, 8)}...
                  </Text>
                </Card>

                <Text weight="medium" mb="2" style={{ display: 'block' }}>
                  Selected ARTIST_PROFILE (will be canonical):
                </Text>
                <Card size="1" mb="3" style={{ backgroundColor: 'var(--green-2)' }}>
                  <Text weight="medium">{selectedProfile?.name}</Text>
                  {selectedProfile?.outstanding_balance > 0 && (
                    <Text size="2" weight="bold" color="green" style={{ display: 'block' }}>
                      Balance: ${selectedProfile.outstanding_balance.toFixed(2)}
                    </Text>
                  )}
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Profile ID: {selectedArtistProfileId?.slice(0, 8)}...
                  </Text>
                </Card>

                <Separator my="3" />

                <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                  <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                    📋 Message for Support Team / User:
                  </Text>
                  <Box style={{
                    backgroundColor: 'white',
                    padding: '12px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '12px'
                  }}>
                    <Text size="1" style={{ whiteSpace: 'pre-wrap', userSelect: 'all' }}>
{`Hi ${selectedProfile?.name || 'there'},

We've resolved the duplicate profile issue with your account.

Your account is now properly linked to phone number ${phoneNumber}.

When you log in, you'll see:
• Your balance of $${selectedProfile?.outstanding_balance?.toFixed(2) || '0.00'}
• All your art pieces and applications
• Your complete event history

If you have any questions, please let us know!

Best regards,
Art Battle Support Team`}
                    </Text>
                  </Box>
                  <Text size="1" color="gray" mt="2" style={{ display: 'block' }}>
                    ↑ Click text above to select and copy
                  </Text>
                </Card>
              </Box>
            );
          })()}

          <Callout.Root color="red" mb="3">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              <strong>Warning:</strong> This operation modifies Person and Artist_Profile records. Make sure you've selected the correct records before proceeding.
            </Callout.Text>
          </Callout.Root>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              color="green"
              onClick={handleReconcile}
              disabled={reconciling}
            >
              {reconciling ? <ReloadIcon className="animate-spin" /> : <CheckCircledIcon />}
              {reconciling ? 'Reconciling...' : 'Confirm Reconciliation'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Help Section */}
      <Card size="2" style={{ marginTop: '2rem' }}>
        <Heading size="3" mb="2">How to Use</Heading>
        <Flex direction="column" gap="2">
          <Text size="2">1. <strong>Search</strong> by phone number (e.g. 5148266476), email, or artist name</Text>
          <Text size="2">2. <strong>Select PERSON</strong> - pick the one with correct contact info and login</Text>
          <Text size="2">3. <strong>Select ARTIST_PROFILE</strong> - pick the one with actual data/balance</Text>
          <Text size="2">4. <strong>Click Reconcile</strong> - links them together and marks others as superseded</Text>
          <Text size="2">5. <strong>Copy support message</strong> - use the pre-written message to inform the user</Text>
          <Text size="2" color="orange" weight="medium">⚠️ This creates the canonical USER → PERSON → ARTIST_PROFILE chain</Text>
        </Flex>
      </Card>
    </Box>
  );
};

export default DuplicateProfileResolver;