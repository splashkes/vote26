import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Text,
  Button,
  TextArea,
  Callout,
  Badge,
  Heading
} from '@radix-ui/themes';
import {
  CrossCircledIcon,
  CheckIcon,
  Pencil1Icon
} from '@radix-ui/react-icons';
import { updateArtistBio } from '../lib/AdminBulkArtistAPI';

const MAX_BIO_LENGTH = 2000;

const BioEditModal = ({ 
  isOpen, 
  onClose, 
  artist, 
  onSave
}) => {
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize bio when artist changes or modal opens
  useEffect(() => {
    if (artist && isOpen) {
      setBio(artist.full_bio || '');
      setHasChanges(false);
      setError('');
    }
  }, [artist, isOpen]);

  const handleBioChange = (value) => {
    setBio(value);
    setHasChanges(value !== (artist?.full_bio || ''));
  };

  const handleSave = async () => {
    if (!artist || !hasChanges) return;

    setSaving(true);
    setError('');

    try {
      const result = await updateArtistBio(artist.artist_profile_id, bio);
      
      if (result.success) {
        onSave?.({
          ...artist,
          full_bio: bio,
          bio_preview: bio.slice(0, 100),
          has_bio: bio.trim() !== ''
        });
        onClose();
      } else {
        setError(result.error || 'Failed to update bio');
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const characterCount = bio.length;
  const isOverLimit = characterCount > MAX_BIO_LENGTH;
  const charactersRemaining = MAX_BIO_LENGTH - characterCount;

  if (!artist) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Content size="4" style={{ maxWidth: '600px' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Pencil1Icon />
            Edit Artist Bio
          </Flex>
        </Dialog.Title>

        <Flex direction="column" gap="4" style={{ marginTop: '1rem' }}>
          {/* Artist Info Header */}
          <Flex direction="column" gap="2" style={{ 
            padding: '1rem', 
            backgroundColor: 'var(--gray-2)', 
            borderRadius: '8px' 
          }}>
            <Heading size="4">{artist.artist_name}</Heading>
            <Flex gap="2" align="center">
              <Badge color="blue">#{artist.artist_number}</Badge>
              <Badge color="green">{artist.event_eid}</Badge>
              <Text size="2" color="gray">{artist.city_name} - {artist.event_date}</Text>
            </Flex>
          </Flex>

          {/* Bio Editor */}
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Text size="3" weight="medium">Artist Bio</Text>
              <Badge 
                color={isOverLimit ? 'red' : charactersRemaining < 100 ? 'orange' : 'gray'}
                size="2"
              >
                {characterCount}/{MAX_BIO_LENGTH} characters
              </Badge>
            </Flex>

            <TextArea
              placeholder="Enter artist bio here..."
              value={bio}
              onChange={(e) => handleBioChange(e.target.value)}
              size="3"
              style={{ minHeight: '200px' }}
              disabled={saving}
            />

            {charactersRemaining < 100 && (
              <Text size="1" color={isOverLimit ? 'red' : 'orange'}>
                {isOverLimit 
                  ? `Bio exceeds maximum length by ${Math.abs(charactersRemaining)} characters`
                  : `${charactersRemaining} characters remaining`
                }
              </Text>
            )}
          </Flex>

          {/* Error Message */}
          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <CrossCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {/* Action Buttons */}
          <Flex justify="end" gap="3" style={{ marginTop: '1rem' }}>
            <Button 
              variant="soft" 
              color="gray" 
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!hasChanges || isOverLimit || saving}
              loading={saving}
            >
              <CheckIcon />
              Save Bio
            </Button>
          </Flex>
        </Flex>

        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="1"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem'
            }}
            disabled={saving}
          >
            <CrossCircledIcon />
          </Button>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default BioEditModal;