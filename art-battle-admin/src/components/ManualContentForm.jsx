import { useState } from 'react';
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
import { Cross2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const ManualContentForm = ({ isOpen, onClose, onSuccess }) => {
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

  // Reset form when modal opens
  useState(() => {
    if (isOpen) {
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
      setError(null);
    }
  }, [isOpen]);

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

      const { data, error } = await supabase.functions.invoke('admin-content-library', {
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
    { value: 'community', label: 'Community Highlight' }
  ];

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: '600px', maxHeight: '80vh' }}>
        <Dialog.Title>Add Manual Content</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Create custom content for the curated feed
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
                <Select.Trigger />
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
              {formData.image_urls.length > 0 && (
                <Flex gap="2" wrap="wrap">
                  {formData.image_urls.map((url, index) => (
                    <Badge key={index} variant="soft">
                      Image {index + 1}
                      <Button
                        type="button"
                        size="1"
                        variant="ghost"
                        onClick={() => removeImageUrl(url)}
                        style={{ marginLeft: '4px' }}
                      >
                        <TrashIcon />
                      </Button>
                    </Badge>
                  ))}
                </Flex>
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
                Create Content
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