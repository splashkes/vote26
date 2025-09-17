import { useState } from 'react';
import {
  Dialog,
  Button,
  Text,
  TextArea,
  Flex,
  Box,
  Heading,
  Callout,
  Badge,
  Separator,
  Card,
  Strong,
  Code
} from '@radix-ui/themes';
import {
  ExclamationTriangleIcon,
  TrashIcon,
  InfoCircledIcon,
  CrossCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const EventDeleteModal = ({ event, isOpen, onClose, onDeleted }) => {
  const [step, setStep] = useState(1); // 1: warning, 2: confirmation, 3: final confirm
  const [confirmText, setConfirmText] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);
  const [error, setError] = useState(null);

  const resetModal = () => {
    setStep(1);
    setConfirmText('');
    setAdminNotes('');
    setIsDeleting(false);
    setDeleteResult(null);
    setError(null);
  };

  const handleClose = () => {
    if (!isDeleting) {
      resetModal();
      onClose();
    }
  };

  const handleDeleteEvent = async () => {
    if (!event?.id) return;

    setIsDeleting(true);
    setError(null);

    try {
      const { data, error: deleteError } = await supabase.rpc('admin_delete_event_safely', {
        target_event_id: event.id,
        admin_notes: adminNotes.trim() || null
      });

      if (deleteError) {
        throw deleteError;
      }

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Delete operation failed');
      }

      setDeleteResult(result);
      setStep(4); // Success step

      // Notify parent component
      if (onDeleted) {
        onDeleted(event, result);
      }

    } catch (err) {
      console.error('Error deleting event:', err);
      setError(err.message || 'Failed to delete event');
    } finally {
      setIsDeleting(false);
    }
  };

  const expectedConfirmText = `DELETE ${event?.eid || ''}`;
  const isConfirmTextValid = confirmText.trim() === expectedConfirmText;

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Content style={{ maxWidth: 600 }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <ExclamationTriangleIcon color="red" />
            Delete Event: {event?.eid}
          </Flex>
        </Dialog.Title>

        {step === 1 && (
          <Box>
            <Callout.Root color="red" mb="4">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                <Strong>WARNING:</Strong> You are about to delete event {event?.eid} ({event?.name}).
                This action cannot be undone.
              </Callout.Text>
            </Callout.Root>

            <Box mb="4">
              <Heading size="3" mb="2">What happens when you delete this event:</Heading>
              <Card p="3">
                <Text size="2">
                  • Event <Strong>{event?.eid}</Strong> will be permanently removed<br/>
                  • All connected data (votes, bids, art, registrations, etc.) will be moved to <Badge color="gray">AB8888</Badge> holder event<br/>
                  • Data will be preserved for historical/audit purposes<br/>
                  • This action will be logged in the admin audit log<br/>
                  • Event will no longer be accessible to users or admins
                </Text>
              </Card>
            </Box>

            <Text size="2" color="gray" mb="4">
              Only super administrators can delete events. This requires multiple confirmation steps.
            </Text>

            <Flex gap="3" justify="end">
              <Button variant="soft" onClick={handleClose}>
                Cancel
              </Button>
              <Button color="red" onClick={() => setStep(2)}>
                Continue to Delete
              </Button>
            </Flex>
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Callout.Root color="orange" mb="4">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                Please provide a reason for deleting this event and confirm the action.
              </Callout.Text>
            </Callout.Root>

            <Box mb="4">
              <Text as="label" size="2" weight="bold" mb="2" display="block">
                Reason for deletion (optional but recommended):
              </Text>
              <TextArea
                placeholder="e.g., Event cancelled, duplicate entry, test event, etc."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </Box>

            <Separator my="4" />

            <Box mb="4">
              <Text as="label" size="2" weight="bold" mb="2" display="block">
                Type <Code>{expectedConfirmText}</Code> to confirm:
              </Text>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedConfirmText}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--gray-7)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              {confirmText && !isConfirmTextValid && (
                <Text size="1" color="red" mt="1" display="block">
                  Please type exactly: {expectedConfirmText}
                </Text>
              )}
            </Box>

            <Flex gap="3" justify="end">
              <Button variant="soft" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                color="red"
                disabled={!isConfirmTextValid}
                onClick={() => setStep(3)}
              >
                Proceed to Final Confirmation
              </Button>
            </Flex>
          </Box>
        )}

        {step === 3 && (
          <Box>
            <Callout.Root color="red" mb="4">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>
                <Strong>FINAL WARNING:</Strong> This is your last chance to cancel.
                Event {event?.eid} will be permanently deleted.
              </Callout.Text>
            </Callout.Root>

            <Card p="3" mb="4">
              <Text size="2">
                <Strong>Event:</Strong> {event?.eid} - {event?.name}<br/>
                <Strong>Venue:</Strong> {event?.venue || 'N/A'}<br/>
                <Strong>Date:</Strong> {event?.event_start_datetime ? new Date(event.event_start_datetime).toLocaleDateString() : 'N/A'}<br/>
                {adminNotes && (
                  <>
                    <Strong>Deletion Reason:</Strong> {adminNotes}
                  </>
                )}
              </Text>
            </Card>

            {error && (
              <Callout.Root color="red" mb="4">
                <Callout.Icon>
                  <CrossCircledIcon />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            <Flex gap="3" justify="end">
              <Button variant="soft" onClick={() => setStep(2)} disabled={isDeleting}>
                Back
              </Button>
              <Button
                color="red"
                loading={isDeleting}
                onClick={handleDeleteEvent}
              >
                <TrashIcon />
                {isDeleting ? 'Deleting...' : 'Delete Event Forever'}
              </Button>
            </Flex>
          </Box>
        )}

        {step === 4 && deleteResult && (
          <Box>
            <Callout.Root color="green" mb="4">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>
                <Strong>Success:</Strong> {deleteResult.message}
              </Callout.Text>
            </Callout.Root>

            <Box mb="4">
              <Heading size="3" mb="2">Data Migration Summary:</Heading>
              <Card p="3">
                <Text size="2">
                  The following data was moved to AB8888 holder event:
                </Text>
                {deleteResult.affected_tables && (
                  <Box mt="2">
                    {Object.entries(deleteResult.affected_tables).map(([table, count]) => (
                      count > 0 && (
                        <Text key={table} size="1" display="block">
                          • {table.replace(/_/g, ' ')}: {count} records
                        </Text>
                      )
                    ))}
                  </Box>
                )}
              </Card>
            </Box>

            <Flex gap="3" justify="end">
              <Button onClick={handleClose}>
                Close
              </Button>
            </Flex>
          </Box>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default EventDeleteModal;