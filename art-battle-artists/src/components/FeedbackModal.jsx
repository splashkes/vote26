import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Heading,
  Text,
  Button,
  TextArea,
  Checkbox,
  Callout,
  Slider as RadixSlider,
  Box,
  Card,
  ScrollArea
} from '@radix-ui/themes';
import { InfoCircledIcon, CheckCircledIcon, ChatBubbleIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

/**
 * Custom Slider Component for Ratings
 * Wraps Radix Slider with labels and value display
 */
const RatingSlider = ({ question, value, onChange, min = 1, max = 5, required = false, leftLabel, rightLabel }) => {
  return (
    <Flex direction="column" gap="2" style={{ width: '100%' }}>
      <Flex justify="between" align="center">
        <Text size="3" weight="medium">
          {question}
          {required && <Text color="red" style={{ display: 'inline' }}> *</Text>}
        </Text>
        <Box
          style={{
            minWidth: '40px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--crimson-9)',
            color: 'white',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '16px'
          }}
        >
          {value || min}
        </Box>
      </Flex>

      <Box px="2">
        <RadixSlider
          value={[value || min]}
          onValueChange={(vals) => onChange(vals[0])}
          min={min}
          max={max}
          step={1}
          size="2"
        />
      </Box>

      {(leftLabel || rightLabel) && (
        <Flex justify="between" px="2">
          <Text size="1" color="gray">{leftLabel || min}</Text>
          <Text size="1" color="gray">{rightLabel || max}</Text>
        </Flex>
      )}
    </Flex>
  );
};

/**
 * FeedbackModal Component
 * Modal for collecting artist feedback about events
 */
const FeedbackModal = ({ open, onOpenChange, event, artistProfile, onSubmitSuccess }) => {
  // Form state
  const [responses, setResponses] = useState({});
  const [requestsFollowup, setRequestsFollowup] = useState(false);
  const [followupMessage, setFollowupMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Question template structure (from spec)
  const questions = [
    // Event Experience
    {
      section: 'Event Experience',
      items: [
        {
          id: 'artist_post_event_organization',
          text: 'How organized was the event?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Producer & Staff
    {
      section: 'Producer & Staff',
      items: [
        {
          id: 'artist_post_event_producer_communication',
          text: 'How satisfied were you with producer communication?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Artwork & Materials
    {
      section: 'Artwork & Materials',
      items: [
        {
          id: 'artist_post_event_artwork_handling',
          text: 'How well was your artwork handled and stored?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Technology
    {
      section: 'Technology',
      items: [
        {
          id: 'artist_post_event_technology',
          text: 'How smooth was the technology (voting, displays, timers)?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Payment
    {
      section: 'Payment',
      items: [
        {
          id: 'artist_post_event_payment',
          text: 'How easy was it to receive payment?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Artists
    {
      section: 'Artists',
      items: [
        {
          id: 'artist_post_event_peer_quality',
          text: 'Quality of fellow artists',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Venue
    {
      section: 'Venue',
      items: [
        {
          id: 'artist_post_event_venue',
          text: 'How suitable was the venue?',
          type: 'slider_1_5',
          required: false
        }
      ]
    },
    // Overall (NPS)
    {
      section: 'Overall',
      items: [
        {
          id: 'artist_post_event_nps',
          text: 'How likely are you to participate in another Art Battle event?',
          type: 'slider_1_10',
          required: true
        }
      ]
    },
    // Additional Feedback
    {
      section: 'Additional Feedback',
      items: [
        {
          id: 'artist_post_event_highlights',
          text: 'What was the highlight of this event?',
          type: 'text',
          required: false
        },
        {
          id: 'artist_post_event_improvements',
          text: 'What could we improve?',
          type: 'text',
          required: false
        }
      ]
    }
  ];

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setResponses({});
      setRequestsFollowup(false);
      setFollowupMessage('');
      setError('');
      setSuccess(false);
    }
  }, [open]);

  // Handle response change
  const handleResponseChange = (questionId, value) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  // Validate required fields
  const validateForm = () => {
    for (const section of questions) {
      for (const item of section.items) {
        if (item.required && !responses[item.id]) {
          return `Please answer: ${item.text}`;
        }
      }
    }
    return null;
  };

  // Handle submit
  const handleSubmit = async () => {
    // Validate
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (requestsFollowup && !followupMessage.trim()) {
      setError('Please provide details about what we should follow up on');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data, error: submitError } = await supabase.functions.invoke('submit-feedback', {
        body: {
          event_id: event.id,
          event_eid: event.eid,
          feedback_context: 'on_demand',
          respondent_type: 'artist',
          artist_profile_id: artistProfile.id,
          responses: responses,
          requests_followup: requestsFollowup,
          followup_message: followupMessage.trim() || null
        }
      });

      if (submitError) {
        throw new Error(submitError.message || 'Failed to submit feedback');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit feedback');
      }

      console.log('Feedback submitted successfully:', data);
      setSuccess(true);

      // Call success callback and close after delay
      setTimeout(() => {
        if (onSubmitSuccess) {
          onSubmitSuccess(data);
        }
        onOpenChange(false);
      }, 2000);

    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle skip
  const handleSkip = () => {
    onOpenChange(false);
  };

  if (!event || !artistProfile) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: '650px', maxHeight: '90vh' }}>
        <Dialog.Title>
          Event Feedback: {event.name || event.eid}
        </Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Your feedback helps us improve Art Battle events for everyone. All responses are optional except the overall rating.
        </Dialog.Description>

        {error && (
          <Callout.Root color="red" mb="4">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {success && (
          <Callout.Root color="green" mb="4">
            <Callout.Icon>
              <CheckCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              Thank you for your feedback! It has been submitted successfully.
            </Callout.Text>
          </Callout.Root>
        )}

        <ScrollArea style={{ maxHeight: '55vh' }} scrollbars="vertical">
          <Flex direction="column" gap="5" pr="4">
            {questions.map((section, idx) => (
              <Box key={idx}>
                <Heading size="4" mb="3" style={{ color: 'var(--crimson-11)' }}>
                  {section.section}
                </Heading>

                <Flex direction="column" gap="4">
                  {section.items.map((item) => {
                    if (item.type === 'slider_1_5') {
                      return (
                        <RatingSlider
                          key={item.id}
                          question={item.text}
                          value={responses[item.id]}
                          onChange={(val) => handleResponseChange(item.id, val)}
                          min={1}
                          max={5}
                          required={item.required}
                          leftLabel="Poor"
                          rightLabel="Excellent"
                        />
                      );
                    } else if (item.type === 'slider_1_10') {
                      return (
                        <RatingSlider
                          key={item.id}
                          question={item.text}
                          value={responses[item.id]}
                          onChange={(val) => handleResponseChange(item.id, val)}
                          min={1}
                          max={10}
                          required={item.required}
                          leftLabel="Not at all likely"
                          rightLabel="Extremely likely"
                        />
                      );
                    } else if (item.type === 'text') {
                      return (
                        <Box key={item.id}>
                          <Text size="3" weight="medium" mb="2" display="block">
                            {item.text}
                            {item.required && <Text color="red" style={{ display: 'inline' }}> *</Text>}
                          </Text>
                          <TextArea
                            placeholder="Your answer..."
                            value={responses[item.id] || ''}
                            onChange={(e) => handleResponseChange(item.id, e.target.value)}
                            rows={3}
                          />
                        </Box>
                      );
                    }
                    return null;
                  })}
                </Flex>
              </Box>
            ))}

            {/* Follow-up Request Section */}
            <Card style={{ backgroundColor: 'var(--blue-2)', border: '1px solid var(--blue-6)' }}>
              <Flex direction="column" gap="3">
                <Flex align="start" gap="2">
                  <Checkbox
                    checked={requestsFollowup}
                    onCheckedChange={setRequestsFollowup}
                    size="2"
                  />
                  <Flex direction="column" gap="1">
                    <Text size="3" weight="medium">
                      Request follow-up from Art Battle team
                    </Text>
                    <Text size="2" color="gray">
                      Check this if you'd like someone from our team to reach out to you
                    </Text>
                  </Flex>
                </Flex>

                {requestsFollowup && (
                  <Box>
                    <Text size="2" weight="medium" mb="2" display="block">
                      What should we follow up about? *
                    </Text>
                    <TextArea
                      placeholder="Please describe what you'd like us to follow up on..."
                      value={followupMessage}
                      onChange={(e) => setFollowupMessage(e.target.value)}
                      rows={3}
                      style={{ width: '100%' }}
                    />
                  </Box>
                )}
              </Flex>
            </Card>
          </Flex>
        </ScrollArea>

        {/* Action Buttons */}
        <Flex gap="3" mt="4" justify="end">
          <Button
            variant="soft"
            color="gray"
            onClick={handleSkip}
            disabled={submitting || success}
          >
            Skip for Now
          </Button>
          <Button
            variant="solid"
            color="crimson"
            onClick={handleSubmit}
            disabled={submitting || success}
          >
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default FeedbackModal;
