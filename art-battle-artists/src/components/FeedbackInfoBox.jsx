import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Heading,
  Text,
  Button,
  Badge,
  Box,
  Callout
} from '@radix-ui/themes';
import { ChatBubbleIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import FeedbackModal from './FeedbackModal';

/**
 * FeedbackInfoBox Component
 * Displays an info box prompting artists to provide feedback for past events
 * Shows on Home page alongside PaymentStatusBanner and ServerNotes
 */
const FeedbackInfoBox = ({ artistProfile, confirmations }) => {
  const [pastEvents, setPastEvents] = useState([]);
  const [eventsWithFeedback, setEventsWithFeedback] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    if (artistProfile && confirmations) {
      loadFeedbackStatus();
    }
  }, [artistProfile, confirmations]);

  const loadFeedbackStatus = async () => {
    try {
      setLoading(true);

      // Filter confirmations for past events
      const now = new Date();
      const past = confirmations.filter(conf => {
        if (!conf.event?.event_end_datetime) return false;
        const eventEnd = new Date(conf.event.event_end_datetime);
        return eventEnd < now;
      });

      setPastEvents(past);

      // If there are past events, check which ones have feedback
      if (past.length > 0) {
        const { data: feedbackData, error } = await supabase
          .from('feedback_submissions')
          .select('event_id')
          .eq('artist_profile_id', artistProfile.id)
          .eq('respondent_type', 'artist')
          .in('event_id', past.map(p => p.event?.id).filter(Boolean));

        if (!error && feedbackData) {
          const feedbackSet = new Set(feedbackData.map(f => f.event_id));
          setEventsWithFeedback(feedbackSet);
        }
      }
    } catch (err) {
      console.error('Error loading feedback status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProvideFeedback = (event) => {
    setSelectedEvent(event);
    setShowFeedbackModal(true);
  };

  const handleFeedbackSuccess = () => {
    // Reload feedback status after successful submission
    loadFeedbackStatus();
  };

  // Don't show if loading or no past events
  if (loading || !pastEvents || pastEvents.length === 0) {
    return null;
  }

  // Get events without feedback, sorted by date (most recent first)
  const eventsNeedingFeedback = pastEvents
    .filter(conf => conf.event?.id && !eventsWithFeedback.has(conf.event.id))
    .sort((a, b) => {
      const dateA = new Date(a.event?.event_start_datetime || 0);
      const dateB = new Date(b.event?.event_start_datetime || 0);
      return dateB - dateA; // Most recent first
    });

  // Don't show if all past events have feedback
  if (eventsNeedingFeedback.length === 0) {
    return null;
  }

  // Only show the most recent event needing feedback
  const mostRecentEvent = eventsNeedingFeedback[0];

  return (
    <>
      <Card
        size="3"
        style={{
          backgroundColor: 'var(--blue-2)',
          border: '2px solid var(--blue-8)'
        }}
      >
        <Flex direction="column" gap="4">
          <Flex align="start" gap="3">
            <Box
              style={{
                padding: '8px',
                backgroundColor: 'var(--blue-9)',
                borderRadius: '6px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChatBubbleIcon width="20" height="20" />
            </Box>

            <Flex direction="column" gap="2" style={{ flex: 1 }}>
              <Flex justify="between" align="center">
                <Heading size="4" style={{ color: 'var(--blue-11)' }}>
                  Share Your Feedback
                </Heading>
              </Flex>

              <Text size="3" style={{ color: 'var(--gray-12)' }}>
                Help us improve! Share your feedback about your most recent event.
              </Text>

              {/* Most recent event needing feedback */}
              <Card
                size="2"
                style={{
                  backgroundColor: 'var(--blue-3)',
                  border: '1px solid var(--blue-6)',
                  marginTop: '8px'
                }}
              >
                <Flex justify="between" align="center">
                  <Flex direction="column" gap="1">
                    <Text size="3" weight="medium">
                      {mostRecentEvent.event?.name || mostRecentEvent.event_eid}
                    </Text>
                    <Text size="2" color="gray">
                      {mostRecentEvent.event?.event_start_datetime &&
                        new Date(mostRecentEvent.event.event_start_datetime).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      }
                      {mostRecentEvent.event?.city && ` • ${mostRecentEvent.event.city}`}
                    </Text>
                  </Flex>

                  <Button
                    size="2"
                    variant="solid"
                    color="blue"
                    onClick={() => handleProvideFeedback(mostRecentEvent.event)}
                  >
                    Give Feedback
                  </Button>
                </Flex>
              </Card>

              {eventsNeedingFeedback.length > 1 && (
                <Text size="1" color="gray" align="center" mt="2">
                  {eventsNeedingFeedback.length - 1} more event{eventsNeedingFeedback.length - 1 !== 1 ? 's' : ''} available after completing this one
                </Text>
              )}

              <Callout.Root color="blue" size="1" mt="2">
                <Callout.Icon>
                  <CheckCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  Your feedback is anonymous and helps us create better events for artists
                </Callout.Text>
              </Callout.Root>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      {/* Feedback Modal */}
      {selectedEvent && (
        <FeedbackModal
          open={showFeedbackModal}
          onOpenChange={setShowFeedbackModal}
          event={selectedEvent}
          artistProfile={artistProfile}
          onSubmitSuccess={handleFeedbackSuccess}
        />
      )}
    </>
  );
};

export default FeedbackInfoBox;
