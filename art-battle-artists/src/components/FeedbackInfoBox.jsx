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

  // Get events without feedback
  const eventsNeedingFeedback = pastEvents.filter(
    conf => conf.event?.id && !eventsWithFeedback.has(conf.event.id)
  );

  // Don't show if all past events have feedback
  if (eventsNeedingFeedback.length === 0) {
    return null;
  }

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
                <Badge color="blue" variant="solid">
                  {eventsNeedingFeedback.length} event{eventsNeedingFeedback.length !== 1 ? 's' : ''}
                </Badge>
              </Flex>

              <Text size="3" style={{ color: 'var(--gray-12)' }}>
                Help us improve! Share your feedback about recent events you've participated in.
              </Text>

              {/* List of events needing feedback */}
              <Flex direction="column" gap="2" mt="2">
                {eventsNeedingFeedback.slice(0, 3).map((conf) => (
                  <Card
                    key={conf.id}
                    size="1"
                    style={{
                      backgroundColor: 'var(--blue-3)',
                      border: '1px solid var(--blue-6)'
                    }}
                  >
                    <Flex justify="between" align="center">
                      <Flex direction="column" gap="1">
                        <Text size="2" weight="medium">
                          {conf.event?.name || conf.event_eid}
                        </Text>
                        <Text size="1" color="gray">
                          {conf.event?.event_start_datetime &&
                            new Date(conf.event.event_start_datetime).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          }
                          {conf.event?.city && ` • ${conf.event.city}`}
                        </Text>
                      </Flex>

                      <Button
                        size="1"
                        variant="soft"
                        color="blue"
                        onClick={() => handleProvideFeedback(conf.event)}
                      >
                        Give Feedback
                      </Button>
                    </Flex>
                  </Card>
                ))}

                {eventsNeedingFeedback.length > 3 && (
                  <Text size="1" color="gray" align="center" mt="1">
                    +{eventsNeedingFeedback.length - 3} more event{eventsNeedingFeedback.length - 3 !== 1 ? 's' : ''}
                  </Text>
                )}
              </Flex>

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
