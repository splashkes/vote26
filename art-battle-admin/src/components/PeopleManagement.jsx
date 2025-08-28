import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Heading,
  Grid,
  TextField,
  Spinner,
  Dialog,
  ScrollArea,
  Separator,
  Table,
  Tooltip
} from '@radix-ui/themes';
import {
  PersonIcon,
  MagnifyingGlassIcon,
  EnvelopeClosedIcon,
  ChatBubbleIcon,
  Cross2Icon,
  CalendarIcon,
  HeartIcon,
  CardStackIcon,
  EyeOpenIcon,
  ImageIcon,
  ExternalLinkIcon,
  StarIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getRFMScore, getBatchRFMScores, getSegmentColor, getSegmentTier } from '../lib/rfmScoring';
import PersonTile from './PersonTile';

const PeopleManagement = () => {
  const { user } = useAuth();
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personHistory, setPersonHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rfmScores, setRfmScores] = useState(new Map());
  const [rfmLoading, setRfmLoading] = useState(false);

  // Search people when search term has 4+ characters
  useEffect(() => {
    if (searchTerm.length >= 4) {
      searchPeople();
    } else {
      setPeople([]);
      setTotalCount(0);
    }
  }, [searchTerm]);

  const loadRFMScores = async (peopleList) => {
    try {
      setRfmLoading(true);
      const personIds = peopleList.map(person => person.id);
      const scores = await getBatchRFMScores(personIds);
      setRfmScores(scores);
    } catch (err) {
      console.error('Error loading RFM scores:', err);
    } finally {
      setRfmLoading(false);
    }
  };

  const searchPeople = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      // Call the edge function with service role access
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-search-people`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({ searchTerm })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const { people: searchResults, count } = await response.json();
      
      setPeople(searchResults || []);
      setTotalCount(count || 0);

      // Load RFM scores for found people
      if (searchResults && searchResults.length > 0) {
        loadRFMScores(searchResults);
      }
    } catch (err) {
      console.error('Error in searchPeople:', err);
      setError(`Failed to search people: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonHistory = async (person) => {
    try {
      setHistoryLoading(true);
      setSelectedPerson(person);
      setDialogOpen(true);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call the edge function with service role access
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-person-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({ personId: person.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const { data: personHistoryData } = await response.json();
      setPersonHistory(personHistoryData);

      // Load RFM score for this person if not already loaded
      if (!rfmScores.has(person.id)) {
        try {
          const rfmScore = await getRFMScore(person.id);
          setRfmScores(prev => new Map(prev.set(person.id, rfmScore)));
        } catch (err) {
          console.error('Error loading RFM score for person:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching person history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="center">
          <Box>
            <Heading size="6" mb="1">
              People Management
              {totalCount > 0 && (
                <Badge color="blue" size="2" ml="2">
                  {totalCount} total
                </Badge>
              )}
            </Heading>
            <Text color="gray" size="2">
              Search and manage customers across all events
            </Text>
          </Box>
        </Flex>

        {/* Search */}
        <Card>
          <Box p="4">
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                  Search People (minimum 4 characters)
                </Text>
                <TextField.Root
                  placeholder="Search by email or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  size="3"
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              
              {/* Search Instructions */}
              {searchTerm.length > 0 && searchTerm.length < 4 && (
                <Text size="2" color="orange">
                  Type at least 4 characters to search
                </Text>
              )}

              {/* Results Summary */}
              {searchTerm.length >= 4 && totalCount > 0 && (
                <Text size="2" color="blue">
                  Found {totalCount} people matching "{searchTerm}"
                </Text>
              )}
            </Flex>
          </Box>
        </Card>

        {/* Loading */}
        {loading && (
          <Box style={{ textAlign: 'center', padding: '2rem' }}>
            <Spinner size="3" />
          </Box>
        )}

        {/* Error */}
        {error && (
          <Card>
            <Box p="3">
              <Text color="red">Error: {error}</Text>
            </Box>
          </Card>
        )}

        {/* People Grid */}
        {people.length > 0 && (
          <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
            {people.map((person) => (
              <PersonTile
                key={person.id}
                person={person}
                onClick={fetchPersonHistory}
                rfmScores={rfmScores}
                rfmLoading={rfmLoading}
                showActivityBadges={false}
              />
            ))}
          </Grid>
        )}

        {/* Empty State */}
        {searchTerm.length >= 4 && !loading && people.length === 0 && !error && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No people found
              </Text>
              <Text size="2" color="gray">
                No people match your search criteria for "{searchTerm}"
              </Text>
            </Box>
          </Card>
        )}

        {/* Initial State */}
        {searchTerm.length < 4 && people.length === 0 && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                Search for people
              </Text>
              <Text size="2" color="gray">
                Enter at least 4 characters to search for customers by email or phone
              </Text>
            </Box>
          </Card>
        )}

        {/* Person Detail Modal */}
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content style={{ maxWidth: 800, maxHeight: '90vh' }}>
            <Dialog.Title>
              <Flex align="center" gap="3">
                <PersonIcon size={24} />
                <Box>
                  <Text size="5" weight="bold">
                    {selectedPerson?.first_name} {selectedPerson?.last_name}
                  </Text>
                  <Flex align="center" gap="2" mt="1">
                    <Text size="2" color="gray">
                      Customer Details & History
                    </Text>
                    {rfmScores.has(selectedPerson?.id) && (
                      <Badge color={getSegmentColor(rfmScores.get(selectedPerson.id).segmentCode)} size="2">
                        <StarIcon size={14} />
                        {rfmScores.get(selectedPerson.id).segment}
                      </Badge>
                    )}
                  </Flex>
                </Box>
              </Flex>
            </Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="4">
              View detailed information about this person including event history, bids, votes, and contact details.
            </Dialog.Description>

            <ScrollArea style={{ height: '70vh' }}>
              <Box p="4">
                {historyLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                    <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                      Loading customer history...
                    </Text>
                  </Box>
                ) : (
                  <Flex direction="column" gap="4">
                    {/* Basic Info */}
                    <Card>
                      <Box p="4">
                        <Heading size="4" mb="3">Contact Information</Heading>
                        <Flex direction="column" gap="2">
                          {selectedPerson?.email && (
                            <Flex align="center" gap="2">
                              <EnvelopeClosedIcon size={16} />
                              <Text>{selectedPerson.email}</Text>
                            </Flex>
                          )}
                          {selectedPerson?.phone && (
                            <Flex align="center" gap="2">
                              <ChatBubbleIcon size={16} />
                              <Text>{selectedPerson.phone}</Text>
                            </Flex>
                          )}
                          <Flex align="center" gap="2">
                            <CalendarIcon size={16} />
                            <Text size="2" color="gray">
                              Joined: {selectedPerson?.created_at ? new Date(selectedPerson.created_at).toLocaleDateString() : 'Unknown'}
                            </Text>
                          </Flex>
                        </Flex>
                      </Box>
                    </Card>

                    {/* RFM Analysis */}
                    {rfmScores.has(selectedPerson?.id) && (
                      <Card>
                        <Box p="4">
                          <Heading size="4" mb="3">
                            <Flex align="center" gap="2">
                              <StarIcon size={20} />
                              RFM Customer Analysis
                            </Flex>
                          </Heading>
                          <Flex direction="column" gap="3">
                            {(() => {
                              const rfm = rfmScores.get(selectedPerson.id);
                              const tier = getSegmentTier(rfm.segmentCode);
                              return (
                                <>
                                  <Flex justify="between" align="center">
                                    <Text size="3" weight="bold">
                                      {rfm.segment}
                                    </Text>
                                    <Badge color={getSegmentColor(rfm.segmentCode)} size="2">
                                      Tier {tier.tier}: {tier.description}
                                    </Badge>
                                  </Flex>
                                  
                                  <Grid columns="3" gap="4">
                                    <Box style={{ textAlign: 'center' }}>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>RECENCY</Text>
                                      <Text size="4" weight="bold" color={rfm.recencyScore >= 4 ? 'green' : rfm.recencyScore >= 3 ? 'yellow' : 'red'}>
                                        {rfm.recencyScore}
                                      </Text>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>
                                        {rfm.daysSinceLastActivity} days ago
                                      </Text>
                                    </Box>
                                    <Box style={{ textAlign: 'center' }}>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>FREQUENCY</Text>
                                      <Text size="4" weight="bold" color={rfm.frequencyScore >= 4 ? 'green' : rfm.frequencyScore >= 3 ? 'yellow' : 'red'}>
                                        {rfm.frequencyScore}
                                      </Text>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>
                                        {rfm.totalActivities} activities
                                      </Text>
                                    </Box>
                                    <Box style={{ textAlign: 'center' }}>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>MONETARY</Text>
                                      <Text size="4" weight="bold" color={rfm.monetaryScore >= 4 ? 'green' : rfm.monetaryScore >= 3 ? 'yellow' : 'red'}>
                                        {rfm.monetaryScore}
                                      </Text>
                                      <Text size="1" color="gray" style={{ display: 'block' }}>
                                        ${rfm.totalSpent.toFixed(2)}
                                      </Text>
                                    </Box>
                                  </Grid>
                                  
                                  <Flex justify="center">
                                    <Badge color="blue" size="2">
                                      Total Score: {rfm.totalScore}/15
                                    </Badge>
                                  </Flex>
                                  
                                  <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                                    Calculated: {new Date(rfm.calculatedAt).toLocaleString()}
                                  </Text>
                                </>
                              );
                            })()}
                          </Flex>
                        </Box>
                      </Card>
                    )}

                    {/* Voting History */}
                    <Card>
                      <Box p="4">
                        <Flex justify="between" align="center" mb="3">
                          <Heading size="4">Votes</Heading>
                          <Badge color="blue">{personHistory?.votes?.length || 0}</Badge>
                        </Flex>
                        {personHistory?.votes?.length > 0 ? (
                          <Table.Root>
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeaderCell>Art</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Weight</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                              </Table.Row>
                            </Table.Header>
                            <Table.Body>
                              {personHistory.votes.map((vote) => (
                                <Table.Row key={vote.id}>
                                  <Table.Cell>
                                    <Flex align="center" gap="2">
                                      <Box style={{ 
                                        width: 40, 
                                        height: 40, 
                                        backgroundColor: 'var(--gray-5)', 
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}>
                                        <ImageIcon size={16} />
                                      </Box>
                                      <Text size="2" style={{ fontWeight: 'bold' }}>
                                        R{vote.round} E{vote.easel}
                                      </Text>
                                    </Flex>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Button 
                                      variant="ghost" 
                                      size="1"
                                      onClick={() => window.open(`/admin/events/${vote.events?.id}`, '_blank')}
                                      style={{ padding: '4px' }}
                                    >
                                      <Flex align="center" gap="1">
                                        <Text size="2">{vote.events?.eid}</Text>
                                        <ExternalLinkIcon size={12} />
                                      </Flex>
                                    </Button>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="2">
                                      {vote.art?.artist_profiles?.name || 'Unknown'}
                                    </Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge color="green" size="1">{vote.vote_factor || 1}</Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="1" color="gray">
                                      {new Date(vote.created_at).toLocaleDateString()}
                                    </Text>
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Root>
                        ) : (
                          <Text size="2" color="gray">No votes found</Text>
                        )}
                      </Box>
                    </Card>

                    {/* Bidding History */}
                    <Card>
                      <Box p="4">
                        <Flex justify="between" align="center" mb="3">
                          <Heading size="4">Bids</Heading>
                          <Badge color="orange">{personHistory?.bids?.length || 0}</Badge>
                        </Flex>
                        {personHistory?.bids?.length > 0 ? (
                          <Table.Root>
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeaderCell>Art</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                              </Table.Row>
                            </Table.Header>
                            <Table.Body>
                              {personHistory.bids.map((bid) => (
                                <Table.Row key={bid.id}>
                                  <Table.Cell>
                                    <Flex align="center" gap="2">
                                      <Box style={{ 
                                        width: 40, 
                                        height: 40, 
                                        backgroundColor: 'var(--gray-5)', 
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}>
                                        <ImageIcon size={16} />
                                      </Box>
                                      <Text size="2" style={{ fontWeight: 'bold' }}>
                                        {bid.art?.art_code || 'Unknown Art'}
                                      </Text>
                                    </Flex>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Button 
                                      variant="ghost" 
                                      size="1"
                                      onClick={() => window.open(`/admin/events/${bid.art?.events?.id}`, '_blank')}
                                      style={{ padding: '4px' }}
                                    >
                                      <Flex align="center" gap="1">
                                        <Text size="2">{bid.art?.events?.eid}</Text>
                                        <ExternalLinkIcon size={12} />
                                      </Flex>
                                    </Button>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="2">Unknown Artist</Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge color="green">${bid.amount}</Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge color="gray" size="1">Bid</Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="1" color="gray">
                                      {new Date(bid.created_at).toLocaleDateString()}
                                    </Text>
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Root>
                        ) : (
                          <Text size="2" color="gray">No bids found</Text>
                        )}
                      </Box>
                    </Card>

                    {/* Payments */}
                    <Card>
                      <Box p="4">
                        <Flex justify="between" align="center" mb="3">
                          <Heading size="4">Payment History</Heading>
                          <Badge color="green">{personHistory?.payments?.length || 0}</Badge>
                        </Flex>
                        {personHistory?.payments?.length > 0 ? (
                          <Table.Root>
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                              </Table.Row>
                            </Table.Header>
                            <Table.Body>
                              {personHistory.payments.map((payment) => (
                                <Table.Row key={payment.id}>
                                  <Table.Cell>
                                    <Flex align="center" gap="2">
                                      <CardStackIcon size={16} />
                                      <Box>
                                        <Text size="2" style={{ fontWeight: 'bold' }}>
                                          {payment.description || 'Payment'}
                                        </Text>
                                        {payment.stripe_charge_id && (
                                          <Text size="1" color="gray" style={{ display: 'block' }}>
                                            {payment.stripe_charge_id}
                                          </Text>
                                        )}
                                      </Box>
                                    </Flex>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="2" color="gray">General</Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge color="green">
                                      ${payment.amount} {payment.currency?.toUpperCase()}
                                    </Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge 
                                      color={payment.status === 'succeeded' ? 'green' : payment.status === 'failed' ? 'red' : 'orange'} 
                                      size="1"
                                    >
                                      {payment.status || 'unknown'}
                                    </Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="1" color="gray">
                                      {new Date(payment.created_at).toLocaleDateString()}
                                    </Text>
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Root>
                        ) : (
                          <Text size="2" color="gray">No payments found</Text>
                        )}
                      </Box>
                    </Card>

                    {/* QR Scans */}
                    <Card>
                      <Box p="4">
                        <Flex justify="between" align="center" mb="3">
                          <Heading size="4">QR Code Scans</Heading>
                          <Badge color="purple">{personHistory?.qrScans?.length || 0}</Badge>
                        </Flex>
                        {personHistory?.qrScans?.length > 0 ? (
                          <Table.Root>
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Data</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                              </Table.Row>
                            </Table.Header>
                            <Table.Body>
                              {personHistory.qrScans.map((scan) => (
                                <Table.Row key={scan.id}>
                                  <Table.Cell>
                                    <Flex align="center" gap="2">
                                      <EyeOpenIcon size={16} />
                                      <Badge color="purple" size="1">
                                        QR Scan
                                      </Badge>
                                    </Flex>
                                  </Table.Cell>
                                  <Table.Cell>
                                    {scan.events?.eid ? (
                                      <Button 
                                        variant="ghost" 
                                        size="1"
                                        onClick={() => window.open(`/admin/events/${scan.events?.id}`, '_blank')}
                                        style={{ padding: '4px' }}
                                      >
                                        <Flex align="center" gap="1">
                                          <Text size="2">{scan.events.eid}</Text>
                                          <ExternalLinkIcon size={12} />
                                        </Flex>
                                      </Button>
                                    ) : (
                                      <Text size="2" color="gray">General</Text>
                                    )}
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="2" color="gray" style={{ fontFamily: 'monospace' }}>
                                      {scan.qr_code ? scan.qr_code.substring(0, 30) + (scan.qr_code.length > 30 ? '...' : '') : 'No data'}
                                    </Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Text size="1" color="gray">
                                      {new Date(scan.created_at).toLocaleDateString()}
                                    </Text>
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Root>
                        ) : (
                          <Text size="2" color="gray">No QR scans found</Text>
                        )}
                      </Box>
                    </Card>

                    {/* Interactions */}
                    {personHistory?.interactions?.length > 0 && (
                      <Card>
                        <Box p="4">
                          <Flex justify="between" align="center" mb="3">
                            <Heading size="4">Interactions</Heading>
                            <Badge color="gray">{personHistory.interactions.length}</Badge>
                          </Flex>
                          <Flex direction="column" gap="2">
                            {personHistory.interactions.map((interaction) => (
                              <Box key={interaction.id} p="2" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '4px' }}>
                                <Text size="2">{interaction.type || 'Unknown'}</Text>
                                <Text size="1" color="gray" style={{ display: 'block' }}>
                                  {new Date(interaction.created_at).toLocaleString()}
                                </Text>
                              </Box>
                            ))}
                          </Flex>
                        </Box>
                      </Card>
                    )}
                  </Flex>
                )}
              </Box>
            </ScrollArea>

            <Dialog.Close>
              <Button variant="soft" style={{ position: 'absolute', top: 10, right: 10 }}>
                <Cross2Icon />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
};

export default PeopleManagement;