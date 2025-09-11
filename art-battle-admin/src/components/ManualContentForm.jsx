import { useState, useEffect } from 'react';
import { 
  Dialog, 
  Flex, 
  Text, 
  Box, 
  Button, 
  TextField, 
  TextArea, 
  Select,
  Checkbox,
  Badge,
  IconButton
} from '@radix-ui/themes';
import { Cross2Icon, PlusIcon, TrashIcon, UploadIcon, ImageIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { getCloudflareConfig } from '../lib/cloudflare';

const ManualContentForm = ({ isOpen, onClose, onSuccess, editingItem = null }) => {
  const [formData, setFormData] = useState({
    content_type: 'announcement',
    title: '',
    description: '',
    image_url: '',
    image_urls: [],
    thumbnail_url: '',
    thumbnail_urls: [],
    video_url: '',
    tags: [],
    mood_tags: [],
    available_until: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [newTag, setNewTag] = useState('');
  const [newMoodTag, setNewMoodTag] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newThumbnailUrl, setNewThumbnailUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cloudflareConfig, setCloudflareConfig] = useState(null);

  // Load Cloudflare config when modal opens
  useEffect(() => {
    if (isOpen) {
      loadCloudflareConfig();
    }
  }, [isOpen]);

  // Reset/populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingItem) {
        // Populate form with existing data for editing
        setFormData({
          content_type: editingItem.content_type || 'announcement',
          title: editingItem.title || '',
          description: editingItem.description || '',
          image_url: editingItem.image_url || '',
          image_urls: editingItem.image_urls || [],
          thumbnail_url: editingItem.thumbnail_url || '',
          thumbnail_urls: editingItem.thumbnail_urls || [],
          video_url: editingItem.video_url || '',
          tags: editingItem.tags || [],
          mood_tags: editingItem.mood_tags || [],
          available_until: editingItem.available_until ? editingItem.available_until.replace('Z', '').slice(0, -3) : ''
        });
        console.log('Editing item content_type:', editingItem.content_type);
      } else {
        // Reset form for new content
        setFormData({
          content_type: 'announcement',
          title: '',
          description: '',
          image_url: '',
          image_urls: [],
          thumbnail_url: '',
          thumbnail_urls: [],
          video_url: '',
          tags: [],
          mood_tags: [],
          available_until: ''
        });
      }
      setError(null);
    }
  }, [isOpen, editingItem]);

  // Handle form field changes
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle array additions
  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({ 
        ...prev, 
        tags: [...prev.tags, newTag.trim()] 
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({ 
      ...prev, 
      tags: prev.tags.filter(tag => tag !== tagToRemove) 
    }));
  };

  const addMoodTag = () => {
    if (newMoodTag.trim() && !formData.mood_tags.includes(newMoodTag.trim())) {
      setFormData(prev => ({ 
        ...prev, 
        mood_tags: [...prev.mood_tags, newMoodTag.trim()] 
      }));
      setNewMoodTag('');
    }
  };

  const removeMoodTag = (tagToRemove) => {
    setFormData(prev => ({ 
      ...prev, 
      mood_tags: prev.mood_tags.filter(tag => tag !== tagToRemove) 
    }));
  };

  const addImageUrl = () => {
    if (newImageUrl.trim() && !formData.image_urls.includes(newImageUrl.trim())) {
      setFormData(prev => ({ 
        ...prev, 
        image_urls: [...prev.image_urls, newImageUrl.trim()] 
      }));
      setNewImageUrl('');
    }
  };

  const removeImageUrl = (urlToRemove) => {
    setFormData(prev => ({ 
      ...prev, 
      image_urls: prev.image_urls.filter(url => url !== urlToRemove) 
    }));
  };

  const addThumbnailUrl = () => {
    if (newThumbnailUrl.trim() && !formData.thumbnail_urls.includes(newThumbnailUrl.trim())) {
      setFormData(prev => ({ 
        ...prev, 
        thumbnail_urls: [...prev.thumbnail_urls, newThumbnailUrl.trim()] 
      }));
      setNewThumbnailUrl('');
    }
  };

  const removeThumbnailUrl = (urlToRemove) => {
    setFormData(prev => ({ 
      ...prev, 
      thumbnail_urls: prev.thumbnail_urls.filter(url => url !== urlToRemove) 
    }));
  };

  // Load Cloudflare configuration
  const loadCloudflareConfig = async () => {
    try {
      const config = await getCloudflareConfig();
      if (!config) {
        console.warn('Image upload not available - missing configuration');
        return;
      }
      setCloudflareConfig(config);
    } catch (err) {
      console.error('Error loading Cloudflare config:', err);
    }
  };

  // Resize image before upload (adapted from SampleWorksUpload)
  const resizeImage = (file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      const reader = new FileReader();
      reader.onload = (e) => {
        img.onload = () => {
          // Calculate new dimensions
          let { width, height } = img;
          
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
          
          // Draw and resize
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

  // Handle file upload to Cloudflare
  const handleImageUpload = async (file) => {
    if (!cloudflareConfig) {
      throw new Error('Image upload not available - missing configuration');
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // Resize image before upload
      setUploadProgress(20);
      const resizedFile = await resizeImage(file);
      
      setUploadProgress(40);

      // Get user session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      setUploadProgress(60);

      // Upload to Cloudflare Worker
      const formData = new FormData();
      formData.append('file', resizedFile);

      const workerUrl = 'https://art-battle-image-upload-production.simon-867.workers.dev';
      const uploadResponse = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'X-Upload-Source': 'admin_manual_content'
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const uploadResult = await uploadResponse.json();
      setUploadProgress(100);

      // Return the Cloudflare image URL
      const imageUrl = `${cloudflareConfig.deliveryUrl}/${uploadResult.id}/public`;
      return imageUrl;

    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle file input change
  const handleFileInputChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    try {
      const imageUrl = await handleImageUpload(file);
      
      // Add to image URLs list
      setFormData(prev => ({
        ...prev,
        image_urls: [...prev.image_urls, imageUrl],
        image_url: prev.image_url || imageUrl // Set as primary if none exists
      }));
      
      setError('');
    } catch (error) {
      setError(`Upload failed: ${error.message}`);
    }

    // Clear the file input
    event.target.value = '';
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Prepare submission data
      const submissionData = {
        ...formData,
        title: formData.title.trim(),
        description: formData.description.trim(),
        available_until: formData.available_until || null
      };

      const { data, error } = editingItem 
        ? await supabase.functions.invoke(`admin-content-library/${editingItem.id}`, {
            method: 'PUT',
            body: submissionData
          })
        : await supabase.functions.invoke('admin-content-library', {
            method: 'POST',
            body: submissionData
          });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to create content');
      }

      onSuccess();
    } catch (err) {
      console.error('Error creating content:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const contentTypes = [
    { value: 'announcement', label: 'Announcement' },
    { value: 'promotion', label: 'Promotion' },
    { value: 'news', label: 'News' },
    { value: 'featured', label: 'Featured Content' },
    { value: 'tutorial', label: 'Tutorial' },
    { value: 'community', label: 'Community Highlight' },
    // Add existing database types for editing
    { value: 'artist_application', label: 'Artist Application (System)' },
    { value: 'artist_spotlight', label: 'Artist Spotlight (System)' },
    { value: 'event', label: 'Event (System)' },
    { value: 'artwork', label: 'Artwork (System)' }
  ];

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: '600px', maxHeight: '80vh' }}>
        <Dialog.Title>{editingItem ? 'Edit Content' : 'Add Manual Content'}</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          {editingItem ? 'Edit existing content in the curated feed' : 'Create custom content for the curated feed'}
        </Dialog.Description>

        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="4">
            {/* Content Type */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Content Type
              </Text>
              <Select.Root
                value={formData.content_type}
                onValueChange={(value) => handleFieldChange('content_type', value)}
              >
                <Select.Trigger placeholder="Select content type..." />
                <Select.Content>
                  {contentTypes.map(type => (
                    <Select.Item key={type.value} value={type.value}>
                      {type.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>

            {/* Title */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Title *
              </Text>
              <TextField.Root
                value={formData.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                placeholder="Enter content title..."
                required
              />
            </Box>

            {/* Description */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Description
              </Text>
              <TextArea
                value={formData.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="Enter content description..."
                rows={3}
              />
            </Box>

            {/* Main Image URL */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Main Image URL
              </Text>
              <TextField.Root
                value={formData.image_url}
                onChange={(e) => handleFieldChange('image_url', e.target.value)}
                placeholder="https://example.com/image.jpg"
                type="url"
              />
              {formData.image_url && (
                <Box mt="2" style={{ position: 'relative', display: 'inline-block' }}>
                  <img 
                    src={formData.image_url} 
                    alt="Main image preview"
                    style={{ 
                      width: '150px', 
                      height: '100px', 
                      objectFit: 'cover',
                      border: '1px solid var(--gray-6)',
                      borderRadius: '6px'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                  <Box style={{ 
                    display: 'none',
                    width: '150px', 
                    height: '100px', 
                    backgroundColor: 'var(--gray-3)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: 'var(--gray-9)',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '6px'
                  }}>
                    Invalid image URL
                  </Box>
                </Box>
              )}
            </Box>

            {/* Additional Image URLs */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Additional Images
              </Text>
              <Flex gap="2" mb="2">
                <TextField.Root
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="Enter image URL..."
                  style={{ flex: 1 }}
                  type="url"
                />
                <Button type="button" onClick={addImageUrl} disabled={!newImageUrl.trim()}>
                  <PlusIcon />
                </Button>
              </Flex>
              
              {/* Image Upload */}
              <Box mb="2">
                <Text size="1" color="gray" mb="1" style={{ display: 'block' }}>
                  Or upload image file:
                </Text>
                <Flex gap="2" align="center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    disabled={uploading}
                    style={{ display: 'none' }}
                    id="image-upload-input"
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={uploading || !cloudflareConfig}
                    onClick={() => document.getElementById('image-upload-input').click()}
                  >
                    <UploadIcon />
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </Button>
                  {uploading && (
                    <Text size="1" color="gray">
                      {uploadProgress}%
                    </Text>
                  )}
                  {!cloudflareConfig && (
                    <Text size="1" color="red">
                      Upload unavailable
                    </Text>
                  )}
                </Flex>
              </Box>
              {formData.image_urls.length > 0 && (
                <Box>
                  <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                    Current Images (click trash to remove):
                  </Text>
                  <Flex gap="3" wrap="wrap">
                    {formData.image_urls.map((url, index) => (
                      <Box key={index} style={{ position: 'relative', border: '1px solid var(--gray-6)', borderRadius: '8px', overflow: 'hidden' }}>
                        <img 
                          src={url} 
                          alt={`Image ${index + 1}`}
                          style={{ 
                            width: '120px', 
                            height: '80px', 
                            objectFit: 'cover',
                            display: 'block'
                          }}
                          onError={(e) => {
                            // Fallback to thumbnail URL if main image fails
                            if (formData.thumbnail_urls && formData.thumbnail_urls[index]) {
                              e.target.src = formData.thumbnail_urls[index];
                            } else {
                              // Show placeholder if image fails to load
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                        <Box style={{ 
                          display: 'none',
                          width: '120px', 
                          height: '80px', 
                          backgroundColor: 'var(--gray-3)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          color: 'var(--gray-9)'
                        }}>
                          Image {index + 1}
                        </Box>
                        <IconButton
                          type="button"
                          size="1"
                          variant="solid"
                          color="red"
                          onClick={() => removeImageUrl(url)}
                          style={{ 
                            position: 'absolute', 
                            top: '4px', 
                            right: '4px',
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            color: 'red'
                          }}
                        >
                          <TrashIcon />
                        </IconButton>
                        <Text size="1" style={{ 
                          position: 'absolute',
                          bottom: '0',
                          left: '0',
                          right: '0',
                          backgroundColor: 'rgba(0, 0, 0, 0.7)',
                          color: 'white',
                          padding: '2px 4px',
                          fontSize: '10px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {url.split('/').pop()?.substring(0, 20) || `Image ${index + 1}`}
                        </Text>
                      </Box>
                    ))}
                  </Flex>
                </Box>
              )}
            </Box>

            {/* Video URL */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Video URL
              </Text>
              <TextField.Root
                value={formData.video_url}
                onChange={(e) => handleFieldChange('video_url', e.target.value)}
                placeholder="https://example.com/video.mp4"
                type="url"
              />
            </Box>

            {/* Tags */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Tags
              </Text>
              <Flex gap="2" mb="2">
                <TextField.Root
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Enter tag..."
                  style={{ flex: 1 }}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} disabled={!newTag.trim()}>
                  <PlusIcon />
                </Button>
              </Flex>
              {formData.tags.length > 0 && (
                <Flex gap="2" wrap="wrap">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="soft">
                      {tag}
                      <Button
                        type="button"
                        size="1"
                        variant="ghost"
                        onClick={() => removeTag(tag)}
                        style={{ marginLeft: '4px' }}
                      >
                        <TrashIcon />
                      </Button>
                    </Badge>
                  ))}
                </Flex>
              )}
            </Box>

            {/* Mood Tags */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Mood Tags
              </Text>
              <Flex gap="2" mb="2">
                <TextField.Root
                  value={newMoodTag}
                  onChange={(e) => setNewMoodTag(e.target.value)}
                  placeholder="Enter mood tag..."
                  style={{ flex: 1 }}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addMoodTag())}
                />
                <Button type="button" onClick={addMoodTag} disabled={!newMoodTag.trim()}>
                  <PlusIcon />
                </Button>
              </Flex>
              {formData.mood_tags.length > 0 && (
                <Flex gap="2" wrap="wrap">
                  {formData.mood_tags.map((tag) => (
                    <Badge key={tag} variant="soft" color="purple">
                      {tag}
                      <Button
                        type="button"
                        size="1"
                        variant="ghost"
                        onClick={() => removeMoodTag(tag)}
                        style={{ marginLeft: '4px' }}
                      >
                        <TrashIcon />
                      </Button>
                    </Badge>
                  ))}
                </Flex>
              )}
            </Box>

            {/* Available Until */}
            <Box>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Available Until (Optional)
              </Text>
              <TextField.Root
                value={formData.available_until}
                onChange={(e) => handleFieldChange('available_until', e.target.value)}
                type="datetime-local"
              />
              <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                Leave empty for permanent content
              </Text>
            </Box>

            {error && (
              <Box p="3" style={{ backgroundColor: 'var(--red-2)', borderRadius: '8px' }}>
                <Text color="red" size="2">{error}</Text>
              </Box>
            )}

            {/* Form Actions */}
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" type="button">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={loading}>
                {editingItem ? 'Update Content' : 'Create Content'}
              </Button>
            </Flex>
          </Flex>
        </form>

        <Dialog.Close>
          <IconButton
            size="1"
            variant="ghost"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px'
            }}
          >
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ManualContentForm;