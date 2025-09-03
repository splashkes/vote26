import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Text,
  Button,
  Card,
  Callout,
  Badge,
  Heading,
  Progress,
  Box
} from '@radix-ui/themes';
import {
  CrossCircledIcon,
  CheckIcon,
  ImageIcon,
  UploadIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { uploadPromoImage, updateArtistPromoImage } from '../lib/AdminBulkArtistAPI';

const PromoImageUploadModal = ({ 
  isOpen, 
  onClose, 
  artist, 
  onSave
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Initialize preview when artist changes or modal opens
  useEffect(() => {
    if (artist && isOpen) {
      setPreviewImage(artist.promotion_artwork_url || null);
      setSelectedFile(null);
      setError('');
      setUploadProgress(0);
    }
  }, [artist, isOpen]);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError('');
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file');
    }
    // Reset input
    event.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile || !artist) return;

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // Step 1: Upload to Cloudflare
      setUploadProgress(20);
      const uploadResult = await uploadPromoImage(selectedFile, artist.artist_profile_id);
      
      if (!uploadResult.success) {
        setError(uploadResult.error);
        return;
      }

      setUploadProgress(70);

      // Step 2: Update database
      const updateResult = await updateArtistPromoImage(
        artist.artist_profile_id,
        artist.event_eid,
        uploadResult.imageUrl
      );

      if (!updateResult.success) {
        setError(updateResult.error);
        return;
      }

      setUploadProgress(100);

      // Success - update parent
      onSave?.({
        ...artist,
        promotion_artwork_url: uploadResult.imageUrl,
        has_promo_image: true
      });

      // Close modal after brief delay to show completion
      setTimeout(() => {
        onClose();
      }, 500);

    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!artist) return;

    if (!confirm('Are you sure you want to remove the promo image?')) return;

    setUploading(true);
    setError('');

    try {
      const result = await updateArtistPromoImage(
        artist.artist_profile_id,
        artist.event_eid,
        ''
      );

      if (result.success) {
        onSave?.({
          ...artist,
          promotion_artwork_url: '',
          has_promo_image: false
        });
        onClose();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return; // Don't close while uploading
    onClose();
  };

  if (!artist) return null;

  const hasChanges = selectedFile !== null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Content size="4" style={{ maxWidth: '600px' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <ImageIcon />
            Promo Image Management
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

          {/* Upload Progress */}
          {uploading && (
            <Box>
              <Progress value={uploadProgress} />
              <Text size="2" color="gray" style={{ marginTop: '8px' }}>
                {uploadProgress < 30 ? 'Uploading image...' : 
                 uploadProgress < 80 ? 'Processing...' : 
                 'Saving...'}
              </Text>
            </Box>
          )}

          {/* Image Preview/Upload Area */}
          <Card size="2" style={{ padding: '1rem' }}>
            {previewImage ? (
              <Flex direction="column" gap="3">
                <Text size="3" weight="medium">Current Promo Image</Text>
                <Box style={{ position: 'relative', maxWidth: '400px', margin: '0 auto' }}>
                  <img
                    src={previewImage}
                    alt="Promo image preview"
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '300px',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      border: '1px solid var(--gray-6)'
                    }}
                  />
                  {hasChanges && (
                    <Badge 
                      color="orange"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px'
                      }}
                    >
                      New Upload
                    </Badge>
                  )}
                </Box>
              </Flex>
            ) : (
              <Flex direction="column" gap="3" align="center" style={{ padding: '2rem' }}>
                <ImageIcon size="48" color="var(--gray-8)" />
                <Text size="3" color="gray">No promo image uploaded</Text>
              </Flex>
            )}
          </Card>

          {/* File Upload Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          {/* Action Buttons */}
          <Flex gap="2" justify="center">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <UploadIcon />
              {previewImage ? 'Change Image' : 'Upload Image'}
            </Button>
            
            {previewImage && !hasChanges && (
              <Button
                variant="outline"
                color="red"
                onClick={handleRemoveImage}
                disabled={uploading}
              >
                <Cross2Icon />
                Remove Image
              </Button>
            )}
          </Flex>

          {/* File Info */}
          {selectedFile && (
            <Card size="1" style={{ padding: '0.75rem' }}>
              <Flex justify="between" align="center">
                <Text size="2">
                  Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
                </Text>
                <Badge color="orange">Ready to upload</Badge>
              </Flex>
            </Card>
          )}

          {/* Error Message */}
          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <CrossCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {/* Upload Guidelines */}
          <Card size="1" style={{ padding: '0.75rem', backgroundColor: 'var(--blue-2)' }}>
            <Text size="1" color="blue">
              <strong>Guidelines:</strong> Upload high-quality promotional artwork. Images will be resized to 1200px max dimension. 
              Supported formats: JPG, PNG, GIF. Max file size: 10MB.
            </Text>
          </Card>

          {/* Bottom Action Buttons */}
          <Flex justify="end" gap="3" style={{ marginTop: '1rem' }}>
            <Button 
              variant="soft" 
              color="gray" 
              onClick={handleClose}
              disabled={uploading}
            >
              Cancel
            </Button>
            
            {hasChanges && (
              <Button 
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                loading={uploading}
              >
                <CheckIcon />
                Upload & Save
              </Button>
            )}
          </Flex>
        </Flex>

        {/* Close Button */}
        {!uploading && (
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="1"
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem'
              }}
            >
              <CrossCircledIcon />
            </Button>
          </Dialog.Close>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default PromoImageUploadModal;