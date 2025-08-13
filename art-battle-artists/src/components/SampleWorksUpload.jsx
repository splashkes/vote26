import { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Card, 
  Flex, 
  Text, 
  Progress, 
  Callout, 
  Heading, 
  Badge,
  Grid,
  IconButton
} from '@radix-ui/themes';
import { 
  ImageIcon, 
  UploadIcon, 
  CheckCircledIcon, 
  CrossCircledIcon,
  Cross2Icon,
  PlusIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { getCloudflareConfig } from '../lib/cloudflare';

const MAX_SAMPLE_WORKS = 10;

const SampleWorksUpload = ({ artistProfileId, onWorksChange }) => {
  const [sampleWorks, setSampleWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [cloudflareConfig, setCloudflareConfig] = useState(null);

  useEffect(() => {
    if (artistProfileId) {
      loadSampleWorks();
      loadCloudflareConfig();
    }
  }, [artistProfileId]);

  const loadCloudflareConfig = async () => {
    const config = await getCloudflareConfig();
    if (!config) {
      setError('Image upload not available - missing configuration');
      return;
    }
    setCloudflareConfig(config);
  };

  const loadSampleWorks = async () => {
    try {
      // Use the unified function to get all sample works (modern + legacy)
      const { data, error } = await supabase
        .rpc('get_unified_sample_works', { profile_id: artistProfileId });

      if (error) throw error;
      setSampleWorks(data || []);
      onWorksChange?.(data || []);
    } catch (err) {
      setError('Failed to load sample works: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Resize image client-side before upload
  const resizeImage = (file, maxWidth = 2048, maxHeight = 2048, quality = 0.9) => {
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

  const handleFileUpload = async (file) => {
    if (!cloudflareConfig) {
      throw new Error('Cloudflare configuration not available');
    }

    if (sampleWorks.length >= MAX_SAMPLE_WORKS) {
      throw new Error(`You can only have up to ${MAX_SAMPLE_WORKS} sample works`);
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // Resize image before upload
      setUploadProgress(10);
      const resizedFile = await resizeImage(file);
      
      setUploadProgress(20);

      // Get user session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      setUploadProgress(30);

      // Upload directly to Cloudflare Worker
      const formData = new FormData();
      formData.append('file', resizedFile);

      const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
      const uploadResponse = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Artist-Profile-ID': artistProfileId,
          'X-Upload-Source': 'artist_portfolio'
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const uploadResult = await uploadResponse.json();
      setUploadProgress(70);

      // Create media file record
      const { data: mediaFile, error: mediaError } = await supabase
        .from('media_files')
        .insert({
          cloudflare_id: uploadResult.id,
          file_type: 'image',
          metadata: {
            artist_profile_id: artistProfileId,
            original_filename: file.name
          }
        })
        .select()
        .single();

      if (mediaError) throw mediaError;

      setUploadProgress(90);

      // Create simple sample work record
      const { error: sampleWorkError } = await supabase
        .from('artist_sample_works')
        .insert({
          artist_profile_id: artistProfileId,
          media_file_id: mediaFile.id,
          display_order: sampleWorks.length
        });

      if (sampleWorkError) throw sampleWorkError;

      setUploadProgress(100);
      
      // Reload works
      await loadSampleWorks();

    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveWork = async (workId) => {
    try {
      const { error } = await supabase
        .from('artist_sample_works')
        .delete()
        .eq('id', workId);

      if (error) throw error;

      await loadSampleWorks();
    } catch (err) {
      setError('Failed to remove work: ' + err.message);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file);
    }
    // Reset the input
    event.target.value = '';
  };

  if (loading) {
    return (
      <Card size="3">
        <Flex direction="column" gap="3" align="center">
          <Text>Loading sample works...</Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Heading size="5">Sample Works</Heading>
          <Badge color="gray">{sampleWorks.length}/{MAX_SAMPLE_WORKS}</Badge>
        </Flex>

        <Text size="2" color="gray">
          Showcase your best artwork. Upload up to {MAX_SAMPLE_WORKS} pieces to your portfolio.
        </Text>

        {error && (
          <Callout.Root color="red">
            <Callout.Icon>
              <CrossCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {uploading && (
          <Box>
            <Progress value={uploadProgress} />
            <Text size="2" color="gray" style={{ marginTop: '8px' }}>
              Uploading... {uploadProgress}%
            </Text>
          </Box>
        )}

        {/* Sample Works Grid */}
        {sampleWorks.length > 0 && (
          <Grid columns="3" gap="3" style={{ marginTop: '1rem' }}>
            {sampleWorks.map((work) => {
              return (
                <Box key={work.id || work.sample_work_id} style={{ position: 'relative' }}>
                  <Card size="1">
                    <Box style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', borderRadius: '8px' }}>
                      <img
                        src={work.image_url}
                        alt="Sample work"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                      <IconButton
                        size="1"
                        color="red"
                        variant="solid"
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px'
                        }}
                        onClick={() => handleRemoveWork(work.id || work.sample_work_id)}
                      >
                        <Cross2Icon width="12" height="12" />
                      </IconButton>
                    </Box>
                  </Card>
                </Box>
              );
            })}
          </Grid>
        )}

        {/* Add New Work Button */}
        {sampleWorks.length < MAX_SAMPLE_WORKS && (
          <>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="sample-work-upload"
              disabled={uploading || !cloudflareConfig}
            />
            <Button
              asChild
              size="3"
              disabled={uploading || !cloudflareConfig}
            >
              <label htmlFor="sample-work-upload" style={{ cursor: 'pointer' }}>
                <PlusIcon width="16" height="16" />
                Add Sample Work
              </label>
            </Button>
          </>
        )}
      </Flex>
    </Card>
  );
};

export default SampleWorksUpload;