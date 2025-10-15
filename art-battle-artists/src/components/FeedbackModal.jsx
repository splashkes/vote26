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
  RadioGroup,
  Box,
  Card,
  ScrollArea
} from '@radix-ui/themes';
import { InfoCircledIcon, CheckCircledIcon, ChatBubbleIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

/**
 * Custom Slider Component for NPS Rating
 */
const RatingSlider = ({ question, value, onChange, min = 1, max = 5, required = false }) => {
  const labels = {
    1: 'Would not recommend',
    2: 'Unlikely',
    3: 'Neutral',
    4: 'Likely',
    5: 'Very Likely'
  };

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

      <Flex justify="between" px="2">
        <Text size="1" color="gray">1 - Not at all likely</Text>
        <Text size="1" color="gray">5 - Extremely likely</Text>
      </Flex>

      {value && labels[value] && (
        <Text size="2" align="center" weight="medium" style={{ color: 'var(--crimson-11)' }}>
          {labels[value]}
        </Text>
      )}
    </Flex>
  );
};

/**
 * Multiple Choice Component
 */
const MultipleChoice = ({ question, options, value, onChange, required = false }) => {
  return (
    <Flex direction="column" gap="2" style={{ width: '100%' }}>
      <Text size="3" weight="medium">
        {question}
        {required && <Text color="red" style={{ display: 'inline' }}> *</Text>}
      </Text>

      <RadioGroup.Root value={value || ''} onValueChange={onChange}>
        <Flex direction="column" gap="2">
          {options.map((option, idx) => (
            <Text as="label" key={idx} size="2">
              <Flex gap="2" align="center">
                <RadioGroup.Item value={option} />
                <Text>{option}</Text>
              </Flex>
            </Text>
          ))}
        </Flex>
      </RadioGroup.Root>
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

  // Question template structure
  const questions = [
    // Communication & Preparation
    {
      section: 'Communication & Preparation',
      items: [
        {
          id: 'artist_communication_satisfaction',
          text: 'How satisfied were you with communication from Art Battle before the event?',
          type: 'multiple_choice',
          options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very Unsatisfied'],
          required: false
        },
        {
          id: 'artist_preparation_quality',
          text: 'How well did the team prepare you for the event? (rules, timing, expectations, etc.)',
          type: 'multiple_choice',
          options: ['Totally prepared', 'Well prepared', 'Somewhat prepared', 'Unprepared', 'Not at all prepared'],
          required: false
        },
        {
          id: 'artist_communication_improvements',
          text: 'If communication or preparation wasn\'t perfect, how can we improve?',
          type: 'text',
          required: false
        }
      ]
    },
    // The Experience
    {
      section: 'The Experience',
      items: [
        {
          id: 'artist_overall_satisfaction',
          text: 'How satisfied were you with your overall Art Battle experience?',
          type: 'multiple_choice',
          options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very Unsatisfied'],
          required: false
        },
        {
          id: 'artist_materials_satisfaction',
          text: 'How satisfied were you with the art materials provided? (canvas, paint, easel, etc.)',
          type: 'multiple_choice',
          options: ['Very Satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very Unsatisfied'],
          required: false
        },
        {
          id: 'artist_competition_fairness',
          text: 'How fair did you feel the competition was?',
          type: 'multiple_choice',
          options: ['Very fair', 'Mostly fair', 'Somewhat fair', 'Somewhat unfair', 'Not fair at all'],
          required: false
        },
        {
          id: 'artist_experience_comments',
          text: 'Do you have any comments about your experience, the materials, or the fairness of the event?',
          type: 'text',
          required: false
        }
      ]
    },
    // Auction & Payment
    {
      section: 'Auction & Payment',
      items: [
        {
          id: 'artist_auction_process',
          text: 'If your artwork sold in the auction, did you feel the process was smooth and fair?',
          type: 'multiple_choice',
          options: ['Yes', 'Mostly', 'Somewhat', 'No', 'My work was not in the auction'],
          required: false
        },
        {
          id: 'artist_payment_status',
          text: 'Have you received your artist payment (or are you aware of the process and timeline)?',
          type: 'multiple_choice',
          options: [
            'Yes, I\'ve been paid',
            'Yes, I know when to expect it',
            'No, I haven\'t been paid or heard anything',
            'Not applicable (I didn\'t sell or am not owed payment)'
          ],
          required: false
        },
        {
          id: 'artist_auction_payment_comments',
          text: 'Any comments or suggestions about the auction or payment process?',
          type: 'text',
          required: false
        }
      ]
    },
    // Final Thoughts
    {
      section: 'Final Thoughts',
      items: [
        {
          id: 'artist_nps_recommendation',
          text: 'How likely are you to recommend Art Battle to other artists and friends?',
          type: 'slider_1_5',
          required: true
        },
        {
          id: 'artist_final_comments',
          text: 'Any final comments or suggestions?',
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
          Thank you for participating in Art Battle! This short survey (2-3 minutes) helps us understand what's working and what can be better.
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
                        />
                      );
                    } else if (item.type === 'multiple_choice') {
                      return (
                        <MultipleChoice
                          key={item.id}
                          question={item.text}
                          options={item.options}
                          value={responses[item.id]}
                          onChange={(val) => handleResponseChange(item.id, val)}
                          required={item.required}
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
