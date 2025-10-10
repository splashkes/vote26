import { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Button,
  Table,
  Spinner,
  Badge,
  Dialog,
  Callout
} from '@radix-ui/themes';
import { CheckIcon, Cross2Icon, ArrowRightIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventRelationshipBackfill = () => {
  const [loading, setLoading] = useState(true);
  const [relationships, setRelationships] = useState([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedRelationship, setSelectedRelationship] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    loadPotentialRelationships();
  }, []);

  const loadPotentialRelationships = async () => {
    setLoading(true);
    setError(null);

    try {
      // Query to find artists who won (got most votes in R3) and then competed in another event within 1 year
      const { data, error } = await supabase.rpc('find_potential_event_progressions');

      if (error) {
        console.error('Error loading relationships:', error);
        setError(`Failed to load relationships: ${error.message}`);
        return;
      }

      setRelationships(data || []);
    } catch (err) {
      console.error('Error:', err);
      setError(`Failed to load relationships: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRelationship = (relationship) => {
    setSelectedRelationship(relationship);
    setConfirmDialogOpen(true);
  };

  const confirmRelationship = async () => {
    if (!selectedRelationship) return;

    setConfirming(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('events')
        .update({ advances_to_event_eid: selectedRelationship.next_event_eid })
        .eq('eid', selectedRelationship.first_event_eid);

      if (error) {
        console.error('Error updating relationship:', error);
        setError(`Failed to create relationship: ${error.message}`);
        return;
      }

      setSuccess(`✓ Created relationship: ${selectedRelationship.first_event_name} → ${selectedRelationship.next_event_name}`);

      // Remove from list
      setRelationships(prev =>
        prev.filter(r =>
          !(r.first_event_eid === selectedRelationship.first_event_eid &&
            r.next_event_eid === selectedRelationship.next_event_eid)
        )
      );

      setConfirmDialogOpen(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error:', err);
      setError(`Failed to create relationship: ${err.message}`);
    } finally {
      setConfirming(false);
    }
  };

  const dismissRelationship = (relationship) => {
    setRelationships(prev =>
      prev.filter(r =>
        !(r.first_event_eid === relationship.first_event_eid &&
          r.next_event_eid === relationship.next_event_eid)
      )
    );
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex direction="column" align="center" justify="center" style={{ minHeight: '50vh' }}>
          <Spinner size="3" />
          <Text size="2" color="gray" mt="3">
            Analyzing artist win patterns and event progressions...
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Box>
          <Heading size="8" mb="2">Event Relationship Backfill</Heading>
          <Text size="3" color="gray">
            Identify events where winners advanced to subsequent competitions within 1 year
          </Text>
        </Box>

        {/* Success Message */}
        {success && (
          <Callout.Root color="green">
            <Callout.Text>{success}</Callout.Text>
          </Callout.Root>
        )}

        {/* Error Message */}
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {/* Stats */}
        <Card>
          <Flex gap="4" p="3">
            <Box>
              <Text size="1" color="gray">Potential Relationships</Text>
              <Text size="5" weight="bold">{relationships.length}</Text>
            </Box>
          </Flex>
        </Card>

        {/* Relationships Table */}
        {relationships.length > 0 ? (
          <Card>
            <Box style={{ overflowX: 'auto' }}>
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>First Event (Won)</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>R3 Votes</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell width="50px"></Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Next Event</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Days Between</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell width="200px">Actions</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {relationships.map((rel, idx) => (
                    <Table.Row key={idx}>
                      {/* Artist */}
                      <Table.Cell>
                        <Text size="2" weight="bold">{rel.artist_name}</Text>
                        <Text size="1" color="gray" style={{ display: 'block' }}>
                          #{rel.artist_number}
                        </Text>
                      </Table.Cell>

                      {/* First Event */}
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="bold">{rel.first_event_name}</Text>
                          <Text size="1" color="gray">{rel.first_event_eid}</Text>
                          <Text size="1" color="gray">
                            {rel.first_event_city} • {new Date(rel.first_event_date).toLocaleDateString()}
                          </Text>
                          <Badge color="green" size="1">Winner</Badge>
                        </Flex>
                      </Table.Cell>

                      {/* R3 Votes */}
                      <Table.Cell>
                        <Text size="2" weight="bold">{rel.r3_votes || 'N/A'}</Text>
                        <Text size="1" color="gray" style={{ display: 'block' }}>votes</Text>
                      </Table.Cell>

                      {/* Arrow */}
                      <Table.Cell>
                        <ArrowRightIcon style={{ color: 'var(--blue-9)' }} />
                      </Table.Cell>

                      {/* Next Event */}
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="bold">{rel.next_event_name}</Text>
                          <Text size="1" color="gray">{rel.next_event_eid}</Text>
                          <Text size="1" color="gray">
                            {rel.next_event_city} • {new Date(rel.next_event_date).toLocaleDateString()}
                          </Text>
                        </Flex>
                      </Table.Cell>

                      {/* Days Between */}
                      <Table.Cell>
                        <Text size="2">{rel.days_between}</Text>
                        <Text size="1" color="gray" style={{ display: 'block' }}>days</Text>
                      </Table.Cell>

                      {/* Actions */}
                      <Table.Cell>
                        <Flex gap="2">
                          <Button
                            size="1"
                            color="green"
                            variant="soft"
                            onClick={() => handleConfirmRelationship(rel)}
                          >
                            <CheckIcon /> Confirm
                          </Button>
                          <Button
                            size="1"
                            color="gray"
                            variant="ghost"
                            onClick={() => dismissRelationship(rel)}
                          >
                            <Cross2Icon /> Dismiss
                          </Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Card>
        ) : (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <Text size="3" color="gray">
                No potential relationships found, or all have been processed.
              </Text>
            </Box>
          </Card>
        )}
      </Flex>

      {/* Confirmation Dialog */}
      <Dialog.Root open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <Dialog.Content style={{ maxWidth: 600 }}>
          <Dialog.Title>Confirm Event Relationship</Dialog.Title>

          {selectedRelationship && (
            <Box mt="4">
              <Flex direction="column" gap="4">
                <Text size="2">
                  You are about to create the following relationship:
                </Text>

                <Card style={{ backgroundColor: 'var(--blue-2)' }}>
                  <Flex align="center" justify="center" gap="3" p="4">
                    <Box style={{ textAlign: 'center' }}>
                      <Text size="3" weight="bold" style={{ display: 'block' }}>
                        {selectedRelationship.first_event_name}
                      </Text>
                      <Text size="2" color="gray">
                        {selectedRelationship.first_event_eid}
                      </Text>
                    </Box>

                    <ArrowRightIcon style={{ fontSize: '24px', color: 'var(--blue-9)' }} />

                    <Box style={{ textAlign: 'center' }}>
                      <Text size="3" weight="bold" style={{ display: 'block' }}>
                        {selectedRelationship.next_event_name}
                      </Text>
                      <Text size="2" color="gray">
                        {selectedRelationship.next_event_eid}
                      </Text>
                    </Box>
                  </Flex>
                </Card>

                <Text size="2" color="gray">
                  This will set the "Advances To" field on {selectedRelationship.first_event_name} to point to {selectedRelationship.next_event_name}.
                </Text>

                <Flex gap="3" justify="end">
                  <Button
                    variant="soft"
                    color="gray"
                    onClick={() => setConfirmDialogOpen(false)}
                    disabled={confirming}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="green"
                    onClick={confirmRelationship}
                    disabled={confirming}
                  >
                    {confirming ? (
                      <>
                        <Spinner size="1" /> Confirming...
                      </>
                    ) : (
                      <>
                        <CheckIcon /> Confirm Relationship
                      </>
                    )}
                  </Button>
                </Flex>
              </Flex>
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default EventRelationshipBackfill;
