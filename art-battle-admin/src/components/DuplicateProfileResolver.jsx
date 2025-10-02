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
  Dialog,
  ScrollArea,
  Checkbox,
  Code
} from '@radix-ui/themes';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
  Cross2Icon,
  PersonIcon,
  InfoCircledIcon,
  ReloadIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const DuplicateProfileResolver = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPrimary, setSelectedPrimary] = useState(null);
  const [selectedSecondaries, setSelectedSecondaries] = useState([]);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferOptions, setTransferOptions] = useState({
    art: true,
    invitations: true,
    applications: true,
    confirmations: true,
    stripe_accounts: true,
    payments: false
  });
  const [transferInProgress, setTransferInProgress] = useState(false);
  const [transferResult, setTransferResult] = useState(null);

  const searchProfiles = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setSearchResults(null);
    setSelectedPrimary(null);
    setSelectedSecondaries([]);

    try {
      const { data, error } = await supabase.functions.invoke('admin-duplicate-profile-search', {
        body: { query: searchQuery.trim() }
      });

      if (error) throw error;
      setSearchResults(data);

      // Auto-select recommended primary if duplicates found
      if (data.duplicate_groups && data.duplicate_groups.length > 0) {
        const firstGroup = data.duplicate_groups[0];
        if (firstGroup.recommended_primary) {
          setSelectedPrimary(firstGroup.recommended_primary.id);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      alert('Error searching profiles: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSecondaryToggle = (profileId) => {
    if (selectedSecondaries.includes(profileId)) {
      setSelectedSecondaries(selectedSecondaries.filter(id => id !== profileId));
    } else {
      setSelectedSecondaries([...selectedSecondaries, profileId]);
    }
  };

  const performTransfer = async () => {
    if (!selectedPrimary || selectedSecondaries.length === 0) {
      alert('Please select a primary profile and at least one secondary profile');
      return;
    }

    setTransferInProgress(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-transfer-profile-data', {
        body: {
          primary_profile_id: selectedPrimary,
          secondary_profile_ids: selectedSecondaries,
          transfer_options: transferOptions,
          safety_checks: true
        }
      });

      if (error) throw error;

      setTransferResult(data);

      if (data.success) {
        alert(`Successfully transferred data!\n\n${Object.entries(data.transferred).map(([key, count]) => `${key}: ${count}`).join('\n')}`);
        setShowTransferDialog(false);
        // Refresh search
        searchProfiles();
      } else {
        alert(`Transfer completed with errors:\n\n${data.errors.join('\n')}`);
      }
    } catch (err) {
      console.error('Transfer error:', err);
      alert('Error transferring data: ' + err.message);
    } finally {
      setTransferInProgress(false);
    }
  };

  const getProfileBadgeColor = (profile) => {
    if (profile.can_login) return 'green';
    if (profile.total_activity > 0) return 'blue';
    return 'gray';
  };

  const formatActivitySummary = (counts) => {
    const items = [];
    if (counts.art) items.push(`${counts.art} art`);
    if (counts.artist_payments) items.push(`${counts.artist_payments} payments`);
    if (counts.artist_invitations) items.push(`${counts.artist_invitations} invitations`);
    if (counts.artist_applications) items.push(`${counts.artist_applications} applications`);
    if (counts.artist_global_payments) items.push(`${counts.artist_global_payments} Stripe`);
    return items.length > 0 ? items.join(', ') : 'No activity';
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

      {searchResults && (
        <>
          {/* Summary Card */}
          <Card size="2" mb="4">
            <Flex gap="4" align="center">
              <Box>
                <Text size="1" color="gray">Profiles Found</Text>
                <Text size="5" weight="bold">{searchResults.total_profiles}</Text>
              </Box>
              <Separator orientation="vertical" />
              <Box>
                <Text size="1" color="gray">Duplicate Groups</Text>
                <Text size="5" weight="bold">{searchResults.duplicate_groups?.length || 0}</Text>
              </Box>
              <Separator orientation="vertical" />
              <Box>
                <Text size="1" color="gray">Orphan Profiles</Text>
                <Text size="5" weight="bold">{searchResults.orphan_profiles?.length || 0}</Text>
              </Box>
            </Flex>
          </Card>

          {searchResults.has_duplicates ? (
            <>
              {/* Duplicate Groups */}
              {searchResults.duplicate_groups?.map((group, groupIndex) => (
                <Card key={groupIndex} size="3" mb="4">
                  <Flex justify="between" align="center" mb="3">
                    <Box>
                      <Heading size="4">
                        Duplicate Group: {group.person_name}
                      </Heading>
                      <Text size="2" color="gray">
                        {group.profile_count} profiles linked to same person
                      </Text>
                    </Box>
                    <Button
                      onClick={() => setShowTransferDialog(true)}
                      disabled={!selectedPrimary || selectedSecondaries.length === 0}
                    >
                      Merge Selected
                    </Button>
                  </Flex>

                  <ScrollArea style={{ maxHeight: '500px' }}>
                    <Table.Root>
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeaderCell>Primary</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Merge</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Profile</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Person Info</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Balance</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Stripe</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Activity</Table.ColumnHeaderCell>
                          <Table.ColumnHeaderCell>Priority</Table.ColumnHeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {group.profiles.map((profile) => {
                          const isPrimary = selectedPrimary === profile.id;
                          const isSecondary = selectedSecondaries.includes(profile.id);

                          return (
                            <Table.Row key={profile.id} style={{
                              backgroundColor: isPrimary ? 'var(--green-2)' : isSecondary ? 'var(--orange-2)' : 'transparent'
                            }}>
                              <Table.Cell>
                                <Checkbox
                                  checked={isPrimary}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedPrimary(profile.id);
                                      // Remove from secondaries if was there
                                      setSelectedSecondaries(selectedSecondaries.filter(id => id !== profile.id));
                                    } else {
                                      setSelectedPrimary(null);
                                    }
                                  }}
                                />
                              </Table.Cell>
                              <Table.Cell>
                                {!isPrimary && (
                                  <Checkbox
                                    checked={isSecondary}
                                    onCheckedChange={() => handleSecondaryToggle(profile.id)}
                                  />
                                )}
                              </Table.Cell>
                              <Table.Cell>
                                <Box>
                                  <Text weight="medium">{profile.name}</Text>
                                  <Text size="1" color="gray" style={{ display: 'block' }}>
                                    ID: {profile.id.slice(0, 8)}...
                                  </Text>
                                  <Text size="1" color="gray" style={{ display: 'block' }}>
                                    Created: {new Date(profile.created_at).toLocaleDateString()}
                                  </Text>
                                </Box>
                              </Table.Cell>
                              <Table.Cell>
                                <Box>
                                  {profile.person ? (
                                    <>
                                      <Flex gap="2" mb="1">
                                        {profile.can_login && (
                                          <Badge color="green" size="1">🔐 Can Login</Badge>
                                        )}
                                      </Flex>
                                      {profile.person.phone && (
                                        <Text size="1" style={{ display: 'block' }}>
                                          📱 {profile.person.phone}
                                        </Text>
                                      )}
                                      {profile.person.email && (
                                        <Text size="1" style={{ display: 'block' }}>
                                          ✉️ {profile.person.email}
                                        </Text>
                                      )}
                                    </>
                                  ) : (
                                    <Badge color="red" size="1">No Person Link</Badge>
                                  )}
                                </Box>
                              </Table.Cell>
                              <Table.Cell>
                                {profile.outstanding_balance > 0 ? (
                                  <Text weight="bold" color="green">
                                    ${profile.outstanding_balance.toFixed(2)}
                                  </Text>
                                ) : (
                                  <Text size="1" color="gray">$0.00</Text>
                                )}
                              </Table.Cell>
                              <Table.Cell>
                                {profile.stripe_account ? (
                                  <Box>
                                    <Badge color="blue" size="1">✓ Connected</Badge>
                                    {profile.stripe_account.stripe_status && (
                                      <Text size="1" color="gray" style={{ display: 'block' }}>
                                        {profile.stripe_account.stripe_status}
                                      </Text>
                                    )}
                                  </Box>
                                ) : (
                                  <Text size="1" color="gray">Not set up</Text>
                                )}
                              </Table.Cell>
                              <Table.Cell>
                                <Text size="1">{formatActivitySummary(profile.activity_counts)}</Text>
                              </Table.Cell>
                              <Table.Cell>
                                <Badge color={profile.priority_score >= 7 ? 'green' : profile.priority_score >= 4 ? 'orange' : 'red'}>
                                  {profile.priority_score}
                                </Badge>
                              </Table.Cell>
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table.Root>
                  </ScrollArea>
                </Card>
              ))}

              {/* Orphan Profiles */}
              {searchResults.orphan_profiles?.length > 0 && (
                <Card size="3" mb="4">
                  <Heading size="4" mb="3">
                    Orphan Profiles (Not Linked to Person)
                  </Heading>
                  <Callout.Root color="orange" mb="3">
                    <Callout.Icon>
                      <InfoCircledIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      These profiles are not linked to any person record. Consider linking them before merging.
                    </Callout.Text>
                  </Callout.Root>
                  <Table.Root>
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Profile</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Activity</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {searchResults.orphan_profiles.map((profile) => (
                        <Table.Row key={profile.id}>
                          <Table.Cell>
                            <Text weight="medium">{profile.name}</Text>
                            <Text size="1" color="gray" style={{ display: 'block' }}>
                              {profile.id.slice(0, 8)}...
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="1">{formatActivitySummary(profile.activity_counts)}</Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="1">{new Date(profile.created_at).toLocaleDateString()}</Text>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Card>
              )}
            </>
          ) : (
            <Card size="3">
              <Flex direction="column" align="center" gap="2" py="6">
                <CheckCircledIcon width="32" height="32" color="var(--green-9)" />
                <Text size="4" weight="medium">No duplicates found</Text>
                <Text size="2" color="gray">All profiles appear to be unique</Text>
              </Flex>
            </Card>
          )}
        </>
      )}

      {/* Transfer Confirmation Dialog */}
      <Dialog.Root open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <Dialog.Content maxWidth="600px">
          <Dialog.Title>Confirm Profile Data Transfer</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            This will transfer data from secondary profiles to the primary profile. This action cannot be undone automatically.
          </Dialog.Description>

          {searchResults && selectedPrimary && (
            <Box mb="4">
              <Text weight="medium" mb="2" style={{ display: 'block' }}>
                Primary Profile (will receive data):
              </Text>
              <Card size="1" mb="3" style={{ backgroundColor: 'var(--green-2)' }}>
                {searchResults.profiles.find(p => p.id === selectedPrimary) && (
                  <Box>
                    <Text weight="medium">{searchResults.profiles.find(p => p.id === selectedPrimary).name}</Text>
                    <Text size="1" color="gray" style={{ display: 'block' }}>
                      {formatActivitySummary(searchResults.profiles.find(p => p.id === selectedPrimary).activity_counts)}
                    </Text>
                  </Box>
                )}
              </Card>

              <Text weight="medium" mb="2" style={{ display: 'block' }}>
                Secondary Profiles (data will be transferred from):
              </Text>
              {selectedSecondaries.map(secId => {
                const profile = searchResults.profiles.find(p => p.id === secId);
                return profile ? (
                  <Card key={secId} size="1" mb="2" style={{ backgroundColor: 'var(--orange-2)' }}>
                    <Text weight="medium">{profile.name}</Text>
                    <Text size="1" color="gray" style={{ display: 'block' }}>
                      {formatActivitySummary(profile.activity_counts)}
                    </Text>
                  </Card>
                ) : null;
              })}

              <Separator my="3" />

              <Text weight="medium" mb="2" style={{ display: 'block' }}>
                Transfer Options:
              </Text>
              <Flex direction="column" gap="2">
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.art}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, art: checked})}
                  />
                  <Text size="2">Art pieces</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.invitations}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, invitations: checked})}
                  />
                  <Text size="2">Invitations</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.applications}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, applications: checked})}
                  />
                  <Text size="2">Applications</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.confirmations}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, confirmations: checked})}
                  />
                  <Text size="2">Confirmations</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.stripe_accounts}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, stripe_accounts: checked})}
                  />
                  <Text size="2">Stripe Accounts</Text>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={transferOptions.payments}
                    onCheckedChange={(checked) => setTransferOptions({...transferOptions, payments: checked})}
                  />
                  <Text size="2">Payment records (use with caution)</Text>
                </Flex>
              </Flex>
            </Box>
          )}

          <Callout.Root color="red" mb="3">
            <Callout.Icon>
              <ExclamationTriangleIcon />
            </Callout.Icon>
            <Callout.Text>
              <strong>Warning:</strong> This operation transfers data between profiles. Always verify the profiles belong to the same person before proceeding.
            </Callout.Text>
          </Callout.Root>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              color="red"
              onClick={performTransfer}
              disabled={transferInProgress}
            >
              {transferInProgress ? 'Transferring...' : 'Confirm Transfer'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Help Section */}
      <Card size="2" style={{ marginTop: '2rem' }}>
        <Heading size="3" mb="2">How to Use</Heading>
        <Flex direction="column" gap="2">
          <Text size="2">1. Search by phone number (e.g. 5148266476), email, or artist name</Text>
          <Text size="2">2. Review duplicate groups - profiles with same person</Text>
          <Text size="2">3. Select the PRIMARY profile (usually one with login capability)</Text>
          <Text size="2">4. Select SECONDARY profiles to merge from</Text>
          <Text size="2">5. Click "Merge Selected" and confirm transfer</Text>
          <Text size="2" color="orange" weight="medium">⚠️ Priority score helps identify best primary (higher = better)</Text>
        </Flex>
      </Card>
    </Box>
  );
};

export default DuplicateProfileResolver;