import { useState, useRef } from 'react';
import {
  Flex,
  Text,
  Button,
  Card,
  Callout,
  Badge,
  Progress,
  Box
} from '@radix-ui/themes';
import {
  CrossCircledIcon,
  ImageIcon,
  UploadIcon,
  Cross2Icon
} from '@radix-ui/react-icons';
import { uploadOfferImage } from '../lib/OffersAPI';

const OfferImageUpload = ({
  currentImageUrl,
  offerId,
  onImageChange,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState(currentImageUrl || null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be under 5MB');
        return;
      }

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
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      setUploadProgress(20);
      const uploadResult = await uploadOfferImage(selectedFile, offerId);

      if (!uploadResult.success) {
        setError(uploadResult.error);
        return;
      }

      setUploadProgress(100);

      // Notify parent component
      onImageChange?.(uploadResult.imageUrl);

      // Reset selection
      setSelectedFile(null);

    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    if (!confirm('Are you sure you want to remove the offer image?')) return;

    setPreviewImage(null);
    setSelectedFile(null);
    onImageChange?.('');
  };

  const hasChanges = selectedFile !== null;

  return (
    <Flex direction="column" gap="3">
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
            <Text size="2" weight="medium">Offer Image</Text>
            <Box style={{ position: 'relative', maxWidth: '400px', margin: '0 auto' }}>
              <img
                src={previewImage}
                alt="Offer image preview"
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
            <Text size="2" color="gray">No offer image uploaded</Text>
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
        disabled={uploading || disabled}
      />

      {/* Action Buttons */}
      <Flex gap="2" justify="center">
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || disabled}
        >
          <UploadIcon />
          {previewImage ? 'Change Image' : 'Upload Image'}
        </Button>

        {previewImage && !hasChanges && (
          <Button
            variant="outline"
            color="red"
            onClick={handleRemoveImage}
            disabled={uploading || disabled}
          >
            <Cross2Icon />
            Remove
          </Button>
        )}

        {hasChanges && (
          <Button
            onClick={handleUpload}
            disabled={uploading || disabled}
          >
            <UploadIcon />
            Upload Now
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
          <strong>Guidelines:</strong> Upload offer tile image. Images will be resized to 800px max.
          Supported formats: JPG, PNG, GIF. Max file size: 5MB.
        </Text>
      </Card>
    </Flex>
  );
};

export default OfferImageUpload;
