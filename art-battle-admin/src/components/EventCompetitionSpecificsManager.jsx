import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Text,
  Button,
  Box,
  Badge,
  IconButton,
  Callout,
  Select,
  Skeleton,
  Dialog,
  Separator,
} from '@radix-ui/themes';
import {
  PlusIcon,
  Cross2Icon,
  DragHandleHorizontalIcon,
  EyeOpenIcon,
  Pencil1Icon,
  InfoCircledIcon,
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import CompetitionSpecificEditor from './CompetitionSpecificEditor';
import MarkdownRenderer from './MarkdownRenderer';

const EventCompetitionSpecificsManager = ({ eventId }) => {
  const [allSpecifics, setAllSpecifics] = useState([]);
  const [eventSpecifics, setEventSpecifics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingSpecific, setEditingSpecific] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => {
    if (eventId) {
      loadData();
    }
  }, [eventId]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers = sessionData?.session?.access_token
        ? { Authorization: `Bearer ${sessionData.session.access_token}` }
        : {};

      // Load all available specifics
      const { data: allData, error: allError } = await supabase.functions.invoke(
        'get-competition-specifics',
        { headers }
      );

      if (allError) throw allError;
      if (!allData.success) throw new Error(allData.error);

      setAllSpecifics(allData.specifics || []);

      // Load event's current specifics
      const { data: eventData, error: eventError } = await supabase.functions.invoke(
        'get-event-competition-specifics',
        { body: { event_id: eventId } }
      );

      if (eventError) throw eventError;
      if (!eventData.success) throw new Error(eventData.error);

      setEventSpecifics(eventData.specifics || []);
    } catch (err) {
      console.error('Error loading competition specifics:', err);
      setError(err.message || 'Failed to load competition specifics');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSpecific = async (specificId) => {
    const specific = allSpecifics.find(s => s.id === specificId);
    if (!specific) return;

    const newEventSpecifics = [
      ...eventSpecifics,
      {
        ...specific,
        display_order: eventSpecifics.length + 1
      }
    ];

    setEventSpecifics(newEventSpecifics);
    await saveEventSpecifics(newEventSpecifics);
  };

  const handleRemoveSpecific = async (specificId) => {
    const newEventSpecifics = eventSpecifics
      .filter(s => s.id !== specificId)
      .map((s, index) => ({ ...s, display_order: index + 1 }));

    setEventSpecifics(newEventSpecifics);
    await saveEventSpecifics(newEventSpecifics);
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === index) return;

    const newEventSpecifics = [...eventSpecifics];
    const draggedItem = newEventSpecifics[draggedIndex];
    newEventSpecifics.splice(draggedIndex, 1);
    newEventSpecifics.splice(index, 0, draggedItem);

    // Update display orders
    newEventSpecifics.forEach((s, i) => {
      s.display_order = i + 1;
    });

    setEventSpecifics(newEventSpecifics);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null) {
      await saveEventSpecifics(eventSpecifics);
    }
    setDraggedIndex(null);
  };

  const saveEventSpecifics = async (specifics) => {
    setSaving(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();

      const payload = {
        event_id: eventId,
        specifics: specifics.map(s => ({
          competition_specific_id: s.id,
          display_order: s.display_order
        }))
      };

      console.log('Saving event specifics:', payload);

      const { data, error: funcError } = await supabase.functions.invoke(
        'set-event-competition-specifics',
        {
          body: payload,
          headers: sessionData?.session?.access_token
            ? { Authorization: `Bearer ${sessionData.session.access_token}` }
            : {}
        }
      );

      if (funcError) throw funcError;
      if (!data) throw new Error('No response data from server');
      if (!data.success) throw new Error(data.error || 'Unknown error');

      // Update the state with the returned specifics
      if (data.specifics) {
        setEventSpecifics(data.specifics);
      }

      console.log('Event specifics saved successfully:', data);

    } catch (err) {
      console.error('Error saving event specifics:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        response: err.response,
        data: err.data
      });
      setError(err.message || 'Failed to save event specifics');
      // Don't reload data on error - keep the UI state
      // await loadData(); // Commenting out to prevent state loss
    } finally {
      setSaving(false);
    }
  };

  const handleEditSpecific = (specific) => {
    setEditingSpecific(specific);
    setShowEditor(true);
  };

  const handleCreateNew = () => {
    setEditingSpecific(null);
    setShowEditor(true);
  };

  const handleEditorSave = async (savedSpecific) => {
    await loadData(); // Reload all data
  };

  const availableSpecifics = allSpecifics.filter(
    s => !eventSpecifics.some(es => es.id === s.id)
  );

  const getVisibilityBadge = (visibility) => {
    return visibility === 'public' ? (
      <Badge color="blue" size="1">🌐 Public</Badge>
    ) : (
      <Badge color="gray" size="1">👤 Artists Only</Badge>
    );
  };

  if (loading) {
    return (
      <Card size="3">
        <Flex direction="column" gap="3">
          <Skeleton height="40px" />
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </Flex>
      </Card>
    );
  }

  return (
    <>
      <Card size="3">
        <Flex direction="column" gap="4">
          <Flex justify="between" align="center">
            <Text size="5" weight="bold">Competition Specifics</Text>
            <Flex gap="2">
              <Button size="2" variant="soft" onClick={() => setShowPreview(true)}>
                <EyeOpenIcon width="16" height="16" />
                Preview
              </Button>
              <Button size="2" onClick={handleCreateNew}>
                <PlusIcon width="16" height="16" />
                Create New
              </Button>
            </Flex>
          </Flex>

          {error && (
            <Callout.Root color="red">
              <Callout.Icon><InfoCircledIcon /></Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          {/* Add Specific Dropdown */}
          {availableSpecifics.length > 0 && (
            <Box>
              <Select.Root onValueChange={handleAddSpecific}>
                <Select.Trigger placeholder="+ Add existing specific to event" style={{ width: '100%' }} />
                <Select.Content>
                  {availableSpecifics.map(specific => (
                    <Select.Item key={specific.id} value={specific.id}>
                      {specific.name} {getVisibilityBadge(specific.visibility)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          )}

          {/* Event Specifics List */}
          {eventSpecifics.length === 0 ? (
            <Callout.Root color="gray">
              <Callout.Icon><InfoCircledIcon /></Callout.Icon>
              <Callout.Text>
                No competition specifics added to this event yet. Add existing ones or create new ones.
              </Callout.Text>
            </Callout.Root>
          ) : (
            <Flex direction="column" gap="2">
              {eventSpecifics.map((specific, index) => (
                <Card
                  key={specific.id}
                  size="2"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    cursor: 'move',
                    opacity: draggedIndex === index ? 0.5 : 1,
                    backgroundColor: 'var(--gray-2)',
                    border: draggedIndex === index ? '2px dashed var(--blue-8)' : undefined
                  }}
                >
                  <Flex align="center" gap="3">
                    <DragHandleHorizontalIcon width="20" height="20" style={{ color: 'var(--gray-9)' }} />

                    <Text weight="medium" style={{ color: 'var(--gray-11)' }}>
                      {index + 1}.
                    </Text>

                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="2">
                        <Text weight="medium">{specific.name}</Text>
                        {getVisibilityBadge(specific.visibility)}
                      </Flex>
                    </Box>

                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => handleEditSpecific(specific)}
                    >
                      <Pencil1Icon width="14" height="14" />
                    </IconButton>

                    <IconButton
                      size="1"
                      variant="ghost"
                      color="red"
                      onClick={() => handleRemoveSpecific(specific.id)}
                    >
                      <Cross2Icon width="14" height="14" />
                    </IconButton>
                  </Flex>
                </Card>
              ))}
            </Flex>
          )}

          {saving && (
            <Text size="1" color="gray">
              💾 Saving changes...
            </Text>
          )}
        </Flex>
      </Card>

      {/* Editor Modal */}
      <CompetitionSpecificEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        specific={editingSpecific}
        onSave={handleEditorSave}
      />

      {/* Preview Modal */}
      <Dialog.Root open={showPreview} onOpenChange={setShowPreview}>
        <Dialog.Content maxWidth="700px" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
          <Dialog.Title>
            Preview: How Artists Will See This
          </Dialog.Title>

          {eventSpecifics.length === 0 ? (
            <Callout.Root color="gray" mt="3">
              <Callout.Icon><InfoCircledIcon /></Callout.Icon>
              <Callout.Text>No specifics to preview</Callout.Text>
            </Callout.Root>
          ) : (
            <Flex direction="column" gap="4" mt="4">
              {eventSpecifics.map((specific, index) => (
                <Box key={specific.id}>
                  {index > 0 && <Separator size="4" my="3" />}
                  <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                    <Flex direction="column" gap="3">
                      <Flex align="center" gap="2">
                        <Text size="4" weight="bold">{specific.name}</Text>
                        {getVisibilityBadge(specific.visibility)}
                      </Flex>
                      <MarkdownRenderer content={specific.content} />
                    </Flex>
                  </Card>
                </Box>
              ))}
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};

export default EventCompetitionSpecificsManager;
