import { useState, useEffect } from 'react';
import { Box, Button, Card, Flex, Text, Progress, Callout, Heading, Badge } from '@radix-ui/themes';
import { ImageIcon, UploadIcon, CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { getCloudflareConfig } from '../lib/cloudflare';

const AdminImageUpload = ({ 
  artworkId, 
  eventId,
  eventCode,
  artCode,
  onUploadComplete,
  maxWidth = 2048,
  maxHeight = 2048,
  quality = 0.9
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error' | null
  const [errorMessage, setErrorMessage] = useState('');
  const [cloudflareConfig, setCloudflareConfig] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Load Cloudflare config on mount
  useEffect(() => {
    loadCloudflareConfig();
  }, []);

  const loadCloudflareConfig = async () => {
    const config = await getCloudflareConfig();
    console.log('Cloudflare config loaded:', config);
    if (!config) {
      setErrorMessage('Cloudflare configuration not available. Cannot upload images.');
      return;
    }
    setCloudflareConfig(config);
  };

  // Resize image client-side before upload
  const resizeImage = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              reject(new Error('Failed to resize image'));
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Upload to Cloudflare via Worker
  const uploadToCloudflareWorker = async (file) => {
    // Get the current user's token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('No active session');
    }

    const formData = new FormData();
    formData.append('file', file);

    // Hardcoded worker URL for CDN deployment
    const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'X-Event-ID': eventCode || eventId,
        'X-Art-ID': artCode || artworkId
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    return await response.json();
  };


  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file');
      return;
    }

    // Check for HEIC files specifically
    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      setErrorMessage('HEIC files are not supported. Please convert to JPEG or PNG, or retake the photo in a different format. iOS users: go to Settings → Camera → Formats → "Most Compatible"');
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
    setUploadStatus(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setErrorMessage('');
    setUploadStatus(null);

    try {
      // Resize image
      setUploadProgress(20);
      const resizedFile = await resizeImage(selectedFile, maxWidth, maxHeight, quality);
      
      if (!cloudflareConfig) {
        throw new Error('Cloudflare configuration not available');
      }

      // Use Cloudflare Worker Upload
      setUploadProgress(40);
      
      // Upload via Cloudflare Worker
      const uploadResult = await uploadToCloudflareWorker(resizedFile);
      
      setUploadProgress(60);
      
      const imageId = uploadResult.id;
      // Use the public variant URL
      const imageUrl = uploadResult.variants.find(v => v.includes('/public')) || 
                 `${cloudflareConfig.deliveryUrl}/${uploadResult.id}/public`;

      setUploadProgress(80);

      // First, insert into media_files table
      const { data: mediaFile, error: mediaError } = await supabase
        .from('media_files')
        .insert({
          original_url: imageUrl,
          compressed_url: imageUrl,
          thumbnail_url: cloudflareConfig 
            ? `${cloudflareConfig.deliveryUrl}/${imageId}/thumbnail`
            : imageUrl,
          file_type: 'image',
          file_size: resizedFile.size,
          width: null, // Could be extracted from image
          height: null, // Could be extracted from image
          cloudflare_id: imageId || null,
          metadata: {
            uploaded_via: 'admin_panel',
            original_name: selectedFile.name,
            resized: true
          }
        })
        .select()
        .single();

      if (mediaError) throw mediaError;

      // Then link it to the artwork via art_media
      const { error: linkError } = await supabase
        .from('art_media')
        .insert({
          art_id: artworkId,
          media_id: mediaFile.id,
          media_type: 'image',
          is_primary: false, // Could check if this is the first image
          display_order: 0
        });

      if (linkError) throw linkError;

      setUploadProgress(100);
      setUploadStatus('success');
      
      // Notify parent component with optimistic update data
      if (onUploadComplete) {
        console.log('🔄 Triggering optimistic photo update via onUploadComplete (AdminImageUpload)');
        onUploadComplete({
          type: 'photo_uploaded',
          artworkId: artworkId,
          mediaFile: {
            id: mediaFile.id,
            original_url: imageUrl,
            compressed_url: imageUrl,
            thumbnail_url: cloudflareConfig
              ? `${cloudflareConfig.deliveryUrl}/${imageId}/thumbnail`
              : imageUrl,
            file_type: 'image',
            cloudflare_id: imageId
          }
        });
      }

      // Reset after success
      setTimeout(() => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setUploadStatus(null);
        setUploadProgress(0);
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);
      setErrorMessage(error.message || 'Upload failed');
      setUploadStatus('error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <Heading size="4">
          Admin Image Upload
          {cloudflareConfig && (
            <Badge size="1" color="green" ml="2">Cloudflare Enabled</Badge>
          )}
        </Heading>

        {!selectedFile ? (
          <Box>
            <label htmlFor="image-upload">
              <Card 
                size="2" 
                style={{ 
                  border: '2px dashed var(--gray-6)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  padding: '3rem'
                }}
              >
                <Flex direction="column" align="center" gap="3">
                  <ImageIcon width="48" height="48" color="var(--gray-9)" />
                  <Text size="3" weight="medium">
                    Click to select image
                  </Text>
                  <Text size="2" color="gray">
                    Images will be resized to {maxWidth}x{maxHeight}
                  </Text>
                  <Text size="2" color="blue" style={{ textAlign: 'center', maxWidth: '300px' }}>
                    📱 iOS users: To avoid HEIC files, go to Settings → Camera → Formats → "Most Compatible"
                  </Text>
                </Flex>
              </Card>
            </label>
            <input
              id="image-upload"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </Box>
        ) : (
          <Flex direction="column" gap="4">
            {/* Preview */}
            <Box style={{ position: 'relative', maxHeight: '300px', overflow: 'hidden' }}>
              <img 
                src={previewUrl} 
                alt="Preview" 
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }} 
              />
            </Box>

            {/* Upload Progress */}
            {uploading && (
              <Box>
                <Progress value={uploadProgress} max={100} size="2" />
                <Text size="2" color="gray" mt="2">
                  {uploadProgress < 40 && 'Resizing image...'}
                  {uploadProgress >= 40 && uploadProgress < 60 && 'Getting upload URL...'}
                  {uploadProgress >= 60 && uploadProgress < 80 && 'Uploading to Cloudflare...'}
                  {uploadProgress >= 80 && 'Saving to database...'}
                </Text>
              </Box>
            )}

            {/* Status Messages */}
            {uploadStatus === 'success' && (
              <Callout.Root color="green">
                <Callout.Icon>
                  <CheckCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  Image uploaded successfully!
                </Callout.Text>
              </Callout.Root>
            )}

            {errorMessage && (
              <Callout.Root color="red">
                <Callout.Icon>
                  <CrossCircledIcon />
                </Callout.Icon>
                <Callout.Text>{errorMessage}</Callout.Text>
              </Callout.Root>
            )}

            {/* Actions */}
            <Flex gap="3" justify="end">
              <Button 
                variant="soft" 
                color="gray"
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                  setUploadStatus(null);
                  setErrorMessage('');
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button 
                variant="solid"
                onClick={handleUpload}
                disabled={uploading || uploadStatus === 'success' || !cloudflareConfig}
              >
                <UploadIcon />
                Upload to Cloudflare
              </Button>
            </Flex>
          </Flex>
        )}
      </Flex>
    </Card>
  );
};

export default AdminImageUpload;