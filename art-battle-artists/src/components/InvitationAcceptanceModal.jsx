import { useState } from 'react';
import {
  Dialog,
  Box,
  Heading,
  Text,
  Card,
  Flex,
  Button,
  Badge,
  TextField,
  TextArea,
  Select,
  Checkbox,
  Separator,
  Callout,
  RadioGroup,
  Grid,
} from '@radix-ui/themes';
import { 
  CheckCircledIcon,
  InfoCircledIcon,
  UploadIcon,
} from '@radix-ui/react-icons';

const InvitationAcceptanceModal = ({ 
  open, 
  onOpenChange, 
  event, 
  invitation, 
  artistProfile,
  onAccept,
  loading 
}) => {
  // Form state
  const [formData, setFormData] = useState({
    // Basic Info
    publicName: artistProfile?.name || '',
    legalName: '',
    email: artistProfile?.email || '',
    phone: artistProfile?.phone || '',
    
    // Pronouns
    pronouns: artistProfile?.pronouns || '',
    pronounsOther: '',
    
    // Legal Agreements
    legalAgreements: {
      photoVideoRelease: false,
      paintingSales: false,
      liabilityWaiver: false
    }
  });

  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const handleNestedInputChange = (parentField, childField, value) => {
    setFormData(prev => ({
      ...prev,
      [parentField]: {
        ...prev[parentField],
        [childField]: value
      }
    }));
  };

  const handleDeepNestedInputChange = (parentField, childField, grandchildField, value) => {
    setFormData(prev => ({
      ...prev,
      [parentField]: {
        ...prev[parentField],
        [childField]: {
          ...prev[parentField][childField],
          [grandchildField]: value
        }
      }
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${dateStr} at ${timeStr}`;
  };

  const validateStep = (stepNumber) => {
    const newErrors = {};

    switch (stepNumber) {
      case 1: // Basic Info
        if (!formData.publicName.trim()) newErrors.publicName = 'Public name is required';
        if (!formData.legalName.trim()) newErrors.legalName = 'Legal name is required';
        if (!formData.email.trim()) newErrors.email = 'Email is required';
        if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
        if (!formData.pronouns && !formData.pronounsOther.trim()) {
          newErrors.pronouns = 'Please select pronouns';
        }
        break;

      case 2: // Legal Agreements
        if (!formData.legalAgreements.photoVideoRelease) {
          newErrors.photoVideoRelease = 'Photo/Video release agreement is required';
        }
        if (!formData.legalAgreements.paintingSales) {
          newErrors.paintingSales = 'Painting sales agreement is required';
        }
        if (!formData.legalAgreements.liabilityWaiver) {
          newErrors.liabilityWaiver = 'Liability waiver is required';
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handlePrevious = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    const submissionData = {
      artistProfileId: artistProfile.id,
      eventEid: invitation.event_eid,
      artistNumber: invitation.artist_number,
      
      // Update artist profile with pronouns
      profileUpdates: {
        pronouns: formData.pronouns === 'Other' ? formData.pronounsOther : formData.pronouns
      },
      
      // Confirmation entry data
      confirmationData: {
        legalName: formData.legalName,
        socialPromotionConsent: formData.socialPromotion,
        socialUsernames: formData.socialUsernames,
        messageToOrganizers: formData.messageToOrganizers,
        publicMessage: formData.publicMessage,
        paymentMethod: formData.paymentMethod,
        paymentDetails: formData.paymentDetails,
        legalAgreements: formData.legalAgreements,
        promotionArtworkUrl: formData.promotionArtwork // TODO: Handle file upload
      }
    };

    await onAccept(submissionData);
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <Flex direction="column" gap="4">
            <Heading size="4">Basic Information</Heading>
            
            <Grid columns="2" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                  Public Name *
                </Text>
                <TextField.Root
                  value={formData.publicName}
                  onChange={(e) => handleInputChange('publicName', e.target.value)}
                  placeholder="Your artist/stage name"
                />
                {errors.publicName && (
                  <Text size="1" color="red" mt="1">{errors.publicName}</Text>
                )}
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                  Legal Name *
                </Text>
                <TextField.Root
                  value={formData.legalName}
                  onChange={(e) => handleInputChange('legalName', e.target.value)}
                  placeholder="Your legal name"
                />
                {errors.legalName && (
                  <Text size="1" color="red" mt="1">{errors.legalName}</Text>
                )}
              </Box>
            </Grid>

            <Grid columns="2" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                  Email *
                </Text>
                <TextField.Root
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your@email.com"
                />
                {errors.email && (
                  <Text size="1" color="red" mt="1">{errors.email}</Text>
                )}
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                  Mobile Phone *
                </Text>
                <TextField.Root
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
                {errors.phone && (
                  <Text size="1" color="red" mt="1">{errors.phone}</Text>
                )}
              </Box>
            </Grid>

            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                How may we refer to you? *
              </Text>
              <RadioGroup.Root
                value={formData.pronouns}
                onValueChange={(value) => handleInputChange('pronouns', value)}
              >
                <Flex direction="column" gap="2">
                  <RadioGroup.Item value="She/Her/Hers">
                    <Text size="2">She / Her / Hers</Text>
                  </RadioGroup.Item>
                  <RadioGroup.Item value="He/Him/His">
                    <Text size="2">He / Him / His</Text>
                  </RadioGroup.Item>
                  <RadioGroup.Item value="They/Them/Theirs">
                    <Text size="2">They / Them / Theirs</Text>
                  </RadioGroup.Item>
                  <RadioGroup.Item value="Other">
                    <Text size="2">Other</Text>
                  </RadioGroup.Item>
                </Flex>
              </RadioGroup.Root>
              
              {formData.pronouns === 'Other' && (
                <Box mt="2">
                  <TextField.Root
                    value={formData.pronounsOther}
                    onChange={(e) => handleInputChange('pronounsOther', e.target.value)}
                    placeholder="Please specify your pronouns"
                  />
                </Box>
              )}
              {errors.pronouns && (
                <Text size="1" color="red" mt="1">{errors.pronouns}</Text>
              )}
            </Box>
          </Flex>
        );

      case 2:
        return (
          <Flex direction="column" gap="4">
            <Heading size="4">Terms and Conditions</Heading>
            
            <Text size="2" color="gray">
              Please read and accept the following agreements to complete your registration:
            </Text>

            <Flex direction="column" gap="4">
              <Box>
                <Box 
                  style={{ cursor: 'pointer' }}
                  onClick={() => 
                    handleNestedInputChange('legalAgreements', 'photoVideoRelease', !formData.legalAgreements.photoVideoRelease)
                  }
                >
                  <Flex align="start" gap="3">
                    <Checkbox
                      checked={formData.legalAgreements.photoVideoRelease}
                      onCheckedChange={(checked) => 
                        handleNestedInputChange('legalAgreements', 'photoVideoRelease', checked)
                      }
                    />
                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Photo & Video Release *
                      </Text>
                      <Text size="2" color="gray">
                        I agree to be video/photo media captured at the event, to have my work recorded, 
                        and to allow those recordings to be used without restriction for Art Battle purposes.
                      </Text>
                    </Box>
                  </Flex>
                </Box>
                {errors.photoVideoRelease && (
                  <Text size="1" color="red" mt="1" ml="6">{errors.photoVideoRelease}</Text>
                )}
              </Box>

              <Box>
                <Box 
                  style={{ cursor: 'pointer' }}
                  onClick={() => 
                    handleNestedInputChange('legalAgreements', 'paintingSales', !formData.legalAgreements.paintingSales)
                  }
                >
                  <Flex align="start" gap="3">
                    <Checkbox
                      checked={formData.legalAgreements.paintingSales}
                      onCheckedChange={(checked) => 
                        handleNestedInputChange('legalAgreements', 'paintingSales', checked)
                      }
                    />
                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Painting Sales *
                      </Text>
                      <Text size="2" color="gray">
                        I acknowledge that paintings created at Art Battle events are the property of Art Battle International 
                        and if sold, that I will receive 50% of the payment received from the buyer after shipping and discounts.
                      </Text>
                    </Box>
                  </Flex>
                </Box>
                {errors.paintingSales && (
                  <Text size="1" color="red" mt="1" ml="6">{errors.paintingSales}</Text>
                )}
              </Box>

              <Box>
                <Box 
                  style={{ cursor: 'pointer' }}
                  onClick={() => 
                    handleNestedInputChange('legalAgreements', 'liabilityWaiver', !formData.legalAgreements.liabilityWaiver)
                  }
                >
                  <Flex align="start" gap="3">
                    <Checkbox
                      checked={formData.legalAgreements.liabilityWaiver}
                      onCheckedChange={(checked) => 
                        handleNestedInputChange('legalAgreements', 'liabilityWaiver', checked)
                      }
                    />
                    <Box style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                        Waiver of Liability *
                      </Text>
                      <Text size="2" color="gray">
                        I accept that as a condition of participating in the event, I will hold harmless and am prevented 
                        from suing Art Battle International or the local producer or associates for any injury or financial 
                        loss that may occur as a result of participating.
                      </Text>
                    </Box>
                  </Flex>
                </Box>
                {errors.liabilityWaiver && (
                  <Text size="1" color="red" mt="1" ml="6">{errors.liabilityWaiver}</Text>
                )}
              </Box>
            </Flex>
          </Flex>
        );

      default:
        return null;
    }
  };

  if (!event || !invitation || !artistProfile) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
        <Dialog.Title>Accept Event Invitation</Dialog.Title>
        
        {/* Event Info Header */}
        <Card size="2" style={{ backgroundColor: 'var(--green-2)', marginBottom: '1rem' }}>
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Text size="4" weight="bold">{event.name}</Text>
              <Badge color="green" variant="solid">INVITED</Badge>
            </Flex>
            <Text size="2" color="gray">
              📅 {formatDateTime(event.event_start_datetime)}
            </Text>
            {event.venue && (
              <Text size="2" color="gray">
                📍 {event.venue}
                {event.city?.name && `, ${event.city.name}`}
              </Text>
            )}
            <Text size="2" color="gray">
              Artist #{invitation.artist_number}
            </Text>
          </Flex>
        </Card>

        {/* Producer Message */}
        {invitation.message_from_producer && (
          <Box mb="4">
            <Card size="2" style={{ backgroundColor: 'var(--blue-2)', borderLeft: '3px solid var(--blue-9)' }}>
              <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                Message from Producer:
              </Text>
              <Text size="2" style={{ fontStyle: 'italic' }}>
                "{invitation.message_from_producer}"
              </Text>
            </Card>
          </Box>
        )}

        {/* Step Progress */}
        <Flex justify="between" align="center" mb="4">
          <Text size="2" weight="medium">
            Step {step} of {totalSteps}
          </Text>
          <Text size="2" color="gray">
            {step === 1 && 'Basic Information'}
            {step === 2 && 'Terms & Conditions'}
          </Text>
        </Flex>

        {/* Progress Bar */}
        <Box mb="4">
          <Box
            style={{
              width: '100%',
              height: '4px',
              backgroundColor: 'var(--gray-6)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}
          >
            <Box
              style={{
                width: `${(step / totalSteps) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--green-9)',
                transition: 'width 0.3s ease'
              }}
            />
          </Box>
        </Box>

        {/* Step Content */}
        <Box mb="6">
          {renderStepContent()}
        </Box>

        {/* Navigation Buttons */}
        <Flex gap="3" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          
          {step > 1 && (
            <Button variant="soft" onClick={handlePrevious}>
              Previous
            </Button>
          )}
          
          {step < totalSteps ? (
            <Button onClick={handleNext}>
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading}
              loading={loading}
              color="green"
            >
              <CheckCircledIcon width="16" height="16" />
              Accept Invitation & Confirm Attendance
            </Button>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default InvitationAcceptanceModal;