import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  Button,
  Flex,
  Text,
  Dialog,
  TextField,
  TextArea,
  Select,
  Spinner,
  Callout,
  Heading,
  Badge,
  Grid,
  Progress,
  IconButton
} from '@radix-ui/themes';
import {
  PlusIcon,
  TrashIcon,
  Cross2Icon,
  UploadIcon,
  ImageIcon
} from '@radix-ui/react-icons';
import {
  getSponsorshipMedia,
  createSponsorshipMedia,
  updateSponsorshipMedia,
  deleteSponsorshipMedia,
  uploadSponsorshipMediaFile
} from '../../lib/sponsorshipAPI';

const SponsorshipMediaLibrary = () => {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form state
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [formData, setFormData] = useState({
    media_type: 'hero_bg_desktop',
    title: '',
    caption: '',
    display_order: 0
  });

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadMedia();
  }, []);

  // Define required assets for sponsorship SPA
  const requiredAssets = [
    { type: 'hero_bg_desktop', label: 'Hero Background (Desktop)', resolution: '1920×1080', required: true },
    { type: 'hero_bg_mobile', label: 'Hero Background (Mobile)', resolution: '1200×900', required: true },
    { type: 'video_poster', label: 'Video Poster Image', resolution: '1600×900', required: true },
    { type: 'event_photo_packed_venue', label: 'Event Photo: Packed Venue', resolution: '800×600', required: true },
    { type: 'event_photo_live_painting', label: 'Event Photo: Live Painting', resolution: '800×600', required: true },
    { type: 'event_photo_audience_engagement', label: 'Event Photo: Audience Engagement', resolution: '800×600', required: true },
    { type: 'event_photo_sponsor_visibility', label: 'Event Photo: Sponsor Visibility', resolution: '800×600', required: true },
    { type: 'section_bg', label: 'Section Background', resolution: '1920×1080', required: true },
    { type: 'sponsor_logo_1', label: 'Sponsor Logo 1', resolution: 'SVG or PNG', required: false },
    { type: 'sponsor_logo_2', label: 'Sponsor Logo 2', resolution: 'SVG or PNG', required: false },
    { type: 'sponsor_logo_3', label: 'Sponsor Logo 3', resolution: 'SVG or PNG', required: false },
    { type: 'sponsor_logo_4', label: 'Sponsor Logo 4', resolution: 'SVG or PNG', required: false },
    { type: 'sponsor_logo_5', label: 'Sponsor Logo 5', resolution: 'SVG or PNG', required: false },
    { type: 'sponsor_logo_6', label: 'Sponsor Logo 6', resolution: 'SVG or PNG', required: false }
  ];

  const getAssetStatus = (assetType) => {
    return media.find(m => m.media_type === assetType);
  };

  const loadMedia = async () => {
    setLoading(true);
    const { data, error } = await getSponsorshipMedia();
    if (error) {
      setError(error);
    } else {
      setMedia(data);
    }
    setLoading(false);
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError(null);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file');
    }
    event.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setUploadProgress(20);

    try {
      // Upload to CloudFlare
      const uploadResult = await uploadSponsorshipMediaFile(
        selectedFile,
        null, // Global media, not event-specific
        formData.media_type,
        {
          title: formData.title,
          caption: formData.caption
        }
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      setUploadProgress(70);

      // Create database record
      const { error: createError } = await createSponsorshipMedia({
        media_type: formData.media_type,
        title: formData.title,
        caption: formData.caption,
        url: uploadResult.imageUrl,
        cloudflare_id: uploadResult.cloudflareId,
        display_order: formData.display_order,
        active: true
      });

      if (createError) {
        throw new Error(createError);
      }

      setUploadProgress(100);

      // Reload and close
      await loadMedia();
      setTimeout(() => {
        setDialogOpen(false);
        resetForm();
      }, 500);

    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    const { error } = await deleteSponsorshipMedia(id);
    if (error) {
      setError(error);
    } else {
      await loadMedia();
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreview(null);
    setFormData({
      media_type: 'hero_bg_desktop',
      title: '',
      caption: '',
      display_order: 0
    });
    setUploadProgress(0);
  };

  const handleOpenDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const mediaTypes = [
    { value: 'hero_bg_desktop', label: 'Hero Background (Desktop)' },
    { value: 'hero_bg_mobile', label: 'Hero Background (Mobile)' },
    { value: 'video_poster', label: 'Video Poster Image' },
    { value: 'event_photo_packed_venue', label: 'Event Photo: Packed Venue' },
    { value: 'event_photo_live_painting', label: 'Event Photo: Live Painting' },
    { value: 'event_photo_audience_engagement', label: 'Event Photo: Audience Engagement' },
    { value: 'event_photo_sponsor_visibility', label: 'Event Photo: Sponsor Visibility' },
    { value: 'section_bg', label: 'Section Background' },
    { value: 'sponsor_logo_1', label: 'Sponsor Logo 1' },
    { value: 'sponsor_logo_2', label: 'Sponsor Logo 2' },
    { value: 'sponsor_logo_3', label: 'Sponsor Logo 3' },
    { value: 'sponsor_logo_4', label: 'Sponsor Logo 4' },
    { value: 'sponsor_logo_5', label: 'Sponsor Logo 5' },
    { value: 'sponsor_logo_6', label: 'Sponsor Logo 6' },
    { value: 'promo_sample', label: 'Promo Material Sample' },
    { value: 'voting_screenshot', label: 'Voting Screenshot' },
    { value: 'event_photo', label: 'Event Photo (General)' },
    { value: 'testimonial', label: 'Testimonial' }
  ];

  const getMediaTypeLabel = (type) => {
    return mediaTypes.find(t => t.value === type)?.label || type;
  };

  const getMediaTypeColor = (type) => {
    const colors = {
      hero_bg_desktop: 'purple',
      hero_bg_mobile: 'purple',
      video_poster: 'indigo',
      event_photo_packed_venue: 'green',
      event_photo_live_painting: 'green',
      event_photo_audience_engagement: 'green',
      event_photo_sponsor_visibility: 'green',
      section_bg: 'purple',
      sponsor_logo_1: 'orange',
      sponsor_logo_2: 'orange',
      sponsor_logo_3: 'orange',
      sponsor_logo_4: 'orange',
      sponsor_logo_5: 'orange',
      sponsor_logo_6: 'orange',
      promo_sample: 'blue',
      voting_screenshot: 'cyan',
      event_photo: 'green',
      testimonial: 'amber'
    };
    return colors[type] || 'gray';
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ minHeight: '200px' }}>
        <Spinner size="3" />
      </Flex>
    );
  }

  const requiredCount = requiredAssets.filter(a => a.required).length;
  const uploadedCount = requiredAssets.filter(a => a.required && getAssetStatus(a.type)).length;
  const completionPercentage = Math.round((uploadedCount / requiredCount) * 100);

  return (
    <Box>
      {error && (
        <Callout.Root color="red" mb="4">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="between" align="center" mb="4">
        <Box>
          <Heading size="5">Sponsorship SPA Assets</Heading>
          <Text size="2" color="gray">
            Required media for the sponsorship platform
          </Text>
        </Box>
        <Button onClick={handleOpenDialog}>
          <PlusIcon /> Upload Media
        </Button>
      </Flex>

      {/* Required Assets Checklist */}
      <Card mb="6">
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center">
            <Heading size="4">Required Assets ({uploadedCount}/{requiredCount})</Heading>
            <Badge size="2" color={completionPercentage === 100 ? 'green' : 'orange'}>
              {completionPercentage}% Complete
            </Badge>
          </Flex>

          {completionPercentage < 100 && (
            <Progress value={completionPercentage} />
          )}

          <Grid columns={{ initial: '1', md: '2' }} gap="3">
            {requiredAssets.map((asset) => {
              const uploaded = getAssetStatus(asset.type);
              return (
                <Card
                  key={asset.type}
                  style={{
                    background: uploaded ? 'var(--green-3)' : 'var(--gray-3)',
                    border: uploaded ? '1px solid var(--green-6)' : '1px solid var(--gray-6)'
                  }}
                >
                  <Flex gap="3" align="center">
                    {uploaded ? (
                      <Box style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <img
                          src={uploaded.url}
                          alt={asset.label}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Box>
                    ) : (
                      <Flex
                        align="center"
                        justify="center"
                        style={{
                          width: '60px',
                          height: '60px',
                          background: 'var(--gray-5)',
                          borderRadius: '4px'
                        }}
                      >
                        <ImageIcon color="var(--gray-9)" />
                      </Flex>
                    )}
                    <Flex direction="column" gap="1" style={{ flex: 1 }}>
                      <Flex justify="between" align="center">
                        <Text size="2" weight="bold">{asset.label}</Text>
                        {uploaded ? (
                          <Badge size="1" color="green">✓ Uploaded</Badge>
                        ) : (
                          <Badge size="1" color={asset.required ? 'red' : 'gray'}>
                            {asset.required ? 'Required' : 'Optional'}
                          </Badge>
                        )}
                      </Flex>
                      <Text size="1" color="gray">{asset.resolution}</Text>
                      {uploaded && (
                        <Button
                          size="1"
                          variant="soft"
                          color="blue"
                          onClick={() => {
                            navigator.clipboard.writeText(uploaded.url);
                          }}
                        >
                          Copy URL
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                </Card>
              );
            })}
          </Grid>
        </Flex>
      </Card>

      {/* All Media Library */}
      <Flex justify="between" align="center" mb="4">
        <Box>
          <Heading size="5">All Media</Heading>
          <Text size="2" color="gray">
            All uploaded media including additional assets
          </Text>
        </Box>
      </Flex>

      {media.length === 0 ? (
        <Card>
          <Flex direction="column" align="center" gap="3" style={{ padding: '3rem' }}>
            <ImageIcon size="48" color="var(--gray-8)" />
            <Text size="4" color="gray">No media uploaded yet</Text>
            <Button onClick={handleOpenDialog}>
              <UploadIcon /> Upload Your First Media
            </Button>
          </Flex>
        </Card>
      ) : (
        <Grid columns="4" gap="4">
          {media.map((item) => (
            <Card key={item.id}>
              <Box
                style={{
                  width: '100%',
                  height: '200px',
                  overflow: 'hidden',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  position: 'relative'
                }}
              >
                <img
                  src={item.url}
                  alt={item.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
                <IconButton
                  size="1"
                  color="red"
                  variant="soft"
                  onClick={() => handleDelete(item.id)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px'
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </Box>

              <Badge size="1" color={getMediaTypeColor(item.media_type)} mb="2">
                {getMediaTypeLabel(item.media_type)}
              </Badge>

              {item.title && (
                <Text size="2" weight="bold" style={{ display: 'block' }} mb="1">
                  {item.title}
                </Text>
              )}

              {item.caption && (
                <Text size="1" color="gray" style={{ display: 'block' }}>
                  {item.caption.substring(0, 80)}
                  {item.caption.length > 80 ? '...' : ''}
                </Text>
              )}
            </Card>
          ))}
        </Grid>
      )}

      {/* Upload Dialog */}
      <Dialog.Root open={dialogOpen} onOpenChange={(open) => {
        if (!uploading) setDialogOpen(open);
      }}>
        <Dialog.Content style={{ maxWidth: '600px' }}>
          <Dialog.Title>Upload Media</Dialog.Title>

          <Flex direction="column" gap="4" mt="4">
            {uploading && (
              <Box>
                <Progress value={uploadProgress} />
                <Text size="2" color="gray" mt="2">
                  {uploadProgress < 30 ? 'Uploading...' :
                   uploadProgress < 80 ? 'Processing...' :
                   'Saving...'}
                </Text>
              </Box>
            )}

            {/* File Preview */}
            {preview ? (
              <Card>
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '300px',
                    objectFit: 'contain',
                    borderRadius: '8px'
                  }}
                />
                {selectedFile && (
                  <Text size="1" color="gray" mt="2">
                    {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
                  </Text>
                )}
              </Card>
            ) : (
              <Card
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: '2px dashed var(--gray-6)'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Flex direction="column" align="center" gap="2">
                  <ImageIcon size="48" color="var(--gray-8)" />
                  <Text size="3" color="gray">Click to select image</Text>
                  <Text size="1" color="gray">JPG, PNG, GIF up to 10MB</Text>
                </Flex>
              </Card>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />

            <Box>
              <Text size="2" mb="1" weight="bold">Media Type *</Text>
              <Select.Root
                value={formData.media_type}
                onValueChange={(value) => setFormData({ ...formData, media_type: value })}
                disabled={uploading}
              >
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  {mediaTypes.map(type => (
                    <Select.Item key={type.value} value={type.value}>
                      {type.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Title</Text>
              <TextField.Root
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief title for this media"
                disabled={uploading}
              />
            </Box>

            <Box>
              <Text size="2" mb="1" weight="bold">Caption</Text>
              <TextArea
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Optional description"
                rows={3}
                disabled={uploading}
              />
            </Box>

            <Flex gap="3" justify="end">
              <Button
                variant="soft"
                color="gray"
                onClick={() => setDialogOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              {!preview && (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <UploadIcon /> Select File
                </Button>
              )}
              {preview && (
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload & Save'}
                </Button>
              )}
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default SponsorshipMediaLibrary;
