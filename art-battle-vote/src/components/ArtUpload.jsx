import { useState, useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  Flex,
  Text,
  AlertDialog,
  Spinner,
} from '@radix-ui/themes';
import { CameraIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { getCloudflareConfig } from '../lib/cloudflare';

const ArtUpload = ({ artwork, onUploadComplete }) => {
  const [uploadConfirm, setUploadConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedThumbnail, setUploadedThumbnail] = useState(null);
  const fileInputRef = useRef(null);

  const handleCameraClick = (e) => {
    e.stopPropagation();
    setUploadConfirm(true);
  };

  const resizeImage = (file, maxWidth, maxHeight, quality) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions while maintaining aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, { type: 'image/jpeg' }));
              } else {
                reject(new Error('Failed to resize image'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('File selected, starting upload...');
    setUploading(true);
    setUploadError(false);
    setUploadSuccess(false);
    setUploadProgress(0);
    setUploadedThumbnail(null);
    
    try {
      // Check file size (5MB limit)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      let processedFile = file;
      
      setUploadProgress(10);
      
      // Resize image if it's too large or for optimization
      if (file.type.startsWith('image/')) {
        // Resize to max 1920x1920 with 85% quality
        processedFile = await resizeImage(file, 1920, 1920, 0.85);
        
        // If still too large, reduce quality further
        if (processedFile.size > MAX_FILE_SIZE) {
          processedFile = await resizeImage(file, 1200, 1200, 0.7);
        }
      }
      
      setUploadProgress(30);
      
      setUploadProgress(40);
      
      // Get Cloudflare config
      const cloudflareConfig = await getCloudflareConfig();
      if (!cloudflareConfig) {
        throw new Error('Cloudflare configuration not available');
      }
      
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('You must be logged in to upload images');
      }
      
      // Get event code from artwork or event
      const eventCode = artwork.events?.event_code || artwork.event_code || artwork.event_id;
      const artCode = artwork.art_code || `${artwork.event_id}-${artwork.round}-${artwork.easel}`;
      
      // Upload via our Cloudflare Worker
      const formData = new FormData();
      formData.append('file', processedFile);
      
      const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
      
      const uploadResponse = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Event-ID': eventCode,
          'X-Art-ID': artCode
        },
        body: formData
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(errorText || 'Failed to upload image');
      }
      
      const uploadResult = await uploadResponse.json();
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
      setUploadProgress(70);
      
      const imageId = uploadResult.id;
      // Use the public variant URL
      const imageUrl = uploadResult.variants.find(v => v.includes('/public')) || 
                 `${cloudflareConfig.deliveryUrl}/${uploadResult.id}/public`;
      const thumbnailUrl = `${cloudflareConfig.deliveryUrl}/${imageId}/thumbnail`;

      setUploadProgress(80);

      // First, insert into media_files table
      const { data: mediaFile, error: mediaError } = await supabase
        .from('media_files')
        .insert({
          original_url: imageUrl,
          compressed_url: imageUrl,
          thumbnail_url: thumbnailUrl,
          file_type: 'image',
          file_size: processedFile.size,
          cloudflare_id: imageId,
          metadata: {
            uploaded_via: 'art_upload',
            original_name: file.name,
            artwork_id: artwork.id,
            event_id: artwork.event_id
          }
        })
        .select()
        .single();
      
      if (mediaError) throw mediaError;
      
      // Then link it to the artwork via art_media
      const { error: linkError } = await supabase
        .from('art_media')
        .insert({
          art_id: artwork.id,
          media_id: mediaFile.id,
          media_type: 'image',
          is_primary: false,
          display_order: 0
        });
      
      if (linkError) throw linkError;

      setUploadProgress(100);
      setUploading(false); // Important: stop the uploading state
      setUploadSuccess(true);
      setUploadedThumbnail(thumbnailUrl);
      console.log('Upload successful, thumbnail:', thumbnailUrl);

      // Reset file input for next use
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(true);
      setUploading(false); // Stop uploading state
      setUploadProgress(100); // Fill the bar but in red
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      {/* Camera Icon Button */}
      <Box
        as="button"
        onClick={handleCameraClick}
        style={{ 
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <CameraIcon 
          width="24" 
          height="24" 
          color="var(--accent-11)"
        />
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Confirmation Dialog - prevent closing during upload */}
      <AlertDialog.Root 
        open={uploadConfirm} 
        onOpenChange={(open) => {
          // Only allow closing if not uploading
          if (!uploading || !open) {
            setUploadConfirm(open);
          }
        }}
      >
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>Upload Artwork Photo</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="2">
              {!uploading && !uploadSuccess ? (
                <>
                  <Text>Please confirm the artwork details:</Text>
                  <Box style={{ 
                    background: 'var(--gray-3)', 
                    padding: '12px', 
                    borderRadius: '4px',
                    textAlign: 'center'
                  }}>
                    <Text size="5" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                      {artwork.artist_profiles?.name || 'Unknown Artist'}
                    </Text>
                    <Text size="4" weight="medium">
                      Round {artwork.round}, Easel {artwork.easel}
                    </Text>
                  </Box>
                  <Text size="2" color="gray">
                    You can take a new photo or select from your gallery.
                  </Text>
                </>
              ) : uploadSuccess ? (
                // Success state with thumbnail
                <Flex direction="column" align="center" gap="3">
                  <Box style={{
                    width: '200px',
                    height: '200px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '3px solid var(--green-9)',
                    position: 'relative'
                  }}>
                    {uploadedThumbnail && (
                      <img 
                        src={uploadedThumbnail} 
                        alt="Uploaded artwork"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    )}
                    <Box
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: 'var(--green-9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                        <path 
                          d="M7 18L14 25L29 10" 
                          stroke="white" 
                          strokeWidth="4" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Box>
                  </Box>
                  <Text size="4" weight="bold" color="green">Upload Successful!</Text>
                  <Text size="2" color="gray">Photo has been added to the artwork</Text>
                </Flex>
              ) : (
                // Uploading state with progress
                <Flex direction="column" align="center" gap="3">
                  <Box style={{ 
                    width: '200px', 
                    height: '200px', 
                    border: '2px solid var(--gray-6)',
                    borderRadius: '8px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'var(--gray-2)'
                  }}>
                    {/* Progress bar fill */}
                    <Box style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: `${uploadProgress}%`,
                      background: uploadError ? 'var(--red-9)' : 'var(--blue-9)',
                      transition: 'height 0.3s ease'
                    }} />
                    
                    {/* Status text */}
                    <Flex 
                      align="center" 
                      justify="center" 
                      style={{ 
                        position: 'absolute',
                        inset: 0,
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {uploadError ? (
                        <>
                          <Text size="6" weight="bold" color="red">✗</Text>
                          <Text size="3" weight="medium" color="red">Upload Failed</Text>
                          <Text size="2" color="gray">Please try again</Text>
                        </>
                      ) : (
                        <>
                          <CameraIcon width="48" height="48" color="var(--gray-9)" />
                          <Text size="4" weight="bold">{uploadProgress}%</Text>
                          <Text size="2" color="gray">Uploading...</Text>
                        </>
                      )}
                    </Flex>
                  </Box>
                </Flex>
              )}
            </Flex>
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            {!uploadSuccess && (
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
            )}
            {/* Use regular button to prevent auto-close */}
            <Button 
              onClick={(e) => {
                e.preventDefault();
                if (uploadSuccess) {
                  // Reset states and close
                  setUploadConfirm(false);
                  setUploadSuccess(false);
                  setUploadedThumbnail(null);
                  setUploadProgress(0);
                  setUploadError(false);
                  // Trigger callback
                  if (onUploadComplete) {
                    onUploadComplete();
                  }
                } else if (!uploading) {
                  fileInputRef.current?.click();
                }
              }}
              disabled={uploading}
              color={uploadSuccess ? "green" : undefined}
            >
              {uploading ? (
                <>
                  <Spinner size="1" />
                  Uploading...
                </>
              ) : uploadSuccess ? (
                'Done'
              ) : (
                'Select Photo'
              )}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
};

export default ArtUpload;