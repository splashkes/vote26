import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Text,
  Button,
  TextField,
  TextArea,
  Select,
  Tabs,
  Box,
  Callout,
  Card,
} from '@radix-ui/themes';
import { InfoCircledIcon, FileTextIcon, EyeOpenIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import MarkdownRenderer from './MarkdownRenderer';

const CompetitionSpecificEditor = ({ open, onOpenChange, specific = null, onSave }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!specific;

  useEffect(() => {
    if (specific) {
      setName(specific.name || '');
      setContent(specific.content || '');
      setVisibility(specific.visibility || 'public');
    } else {
      setName('');
      setContent('');
      setVisibility('public');
    }
    setError('');
  }, [specific, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!content.trim()) {
      setError('Content is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const functionName = isEditing ? 'update-competition-specific' : 'create-competition-specific';
      const payload = isEditing
        ? { id: specific.id, name, content, visibility }
        : { name, content, visibility };

      const { data: sessionData } = await supabase.auth.getSession();

      const { data, error: funcError } = await supabase.functions.invoke(functionName, {
        body: payload,
        headers: sessionData?.session?.access_token
          ? { Authorization: `Bearer ${sessionData.session.access_token}` }
          : {}
      });

      if (funcError) throw funcError;

      if (!data.success) {
        throw new Error(data.error || 'Failed to save competition specific');
      }

      if (onSave) {
        onSave(data.specific);
      }

      onOpenChange(false);
    } catch (err) {
      console.error('Error saving competition specific:', err);
      setError(err.message || 'Failed to save competition specific');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="900px" style={{ maxHeight: '90vh' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <FileTextIcon width="20" height="20" />
            {isEditing ? 'Edit' : 'Create'} Competition Specific
          </Flex>
        </Dialog.Title>

        {error && (
          <Callout.Root color="red" mb="3">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex direction="column" gap="4" mt="3">
          <Flex gap="3">
            <Box style={{ flex: 1 }}>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Name *
              </Text>
              <TextField.Root
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Open Materials Rules"
              />
            </Box>

            <Box style={{ width: '200px' }}>
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Visibility
              </Text>
              <Select.Root value={visibility} onValueChange={setVisibility}>
                <Select.Trigger placeholder="Select visibility" />
                <Select.Content>
                  <Select.Item value="public">🌐 Public</Select.Item>
                  <Select.Item value="artists_only">👤 Artists Only</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
          </Flex>

          <Box>
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              Content * (Markdown supported)
            </Text>

            <Tabs.Root defaultValue="edit">
              <Tabs.List>
                <Tabs.Trigger value="edit">
                  <Pencil1Icon width="14" height="14" />
                  Edit
                </Tabs.Trigger>
                <Tabs.Trigger value="preview">
                  <EyeOpenIcon width="14" height="14" />
                  Preview
                </Tabs.Trigger>
              </Tabs.List>

              <Box mt="3">
                <Tabs.Content value="edit">
                  <TextArea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter markdown content..."
                    rows={20}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '14px' }}
                  />
                  <Text size="1" color="gray" mt="2" style={{ display: 'block' }}>
                    Markdown tips: Use # for headings, ** for bold, * for italic, - for lists, *** for horizontal rules
                  </Text>
                </Tabs.Content>

                <Tabs.Content value="preview">
                  <Card size="2" style={{ minHeight: '400px', backgroundColor: 'var(--gray-2)' }}>
                    {content ? (
                      <MarkdownRenderer content={content} />
                    ) : (
                      <Text color="gray" size="2">
                        No content to preview yet
                      </Text>
                    )}
                  </Card>
                </Tabs.Content>
              </Box>
            </Tabs.Root>
          </Box>

          {isEditing && specific && (
            <Text size="1" color="gray">
              Version {specific.version} • Last updated: {new Date(specific.updated_at).toLocaleDateString()}
            </Text>
          )}
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" disabled={saving}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave} disabled={saving} loading={saving}>
            {isEditing ? 'Save Changes' : 'Create'}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default CompetitionSpecificEditor;
