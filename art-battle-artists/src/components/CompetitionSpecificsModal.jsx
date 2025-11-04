import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Text,
  Button,
  Box,
  Card,
  Separator,
  Callout,
  Skeleton,
} from '@radix-ui/themes';
import { InfoCircledIcon, FileTextIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import MarkdownRenderer from './MarkdownRenderer';

const CompetitionSpecificsModal = ({ open, onOpenChange, eventId, eventEid, eventName }) => {
  const [specifics, setSpecifics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && (eventId || eventEid)) {
      loadSpecifics();
    }
  }, [open, eventId, eventEid]);

  const loadSpecifics = async () => {
    setLoading(true);
    setError('');

    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error: funcError } = await supabase.functions.invoke('artist-get-event-competition-specifics', {
        body: { event_id: eventId, event_eid: eventEid },
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : {}
      });

      if (funcError) throw funcError;

      if (!data.success) {
        throw new Error(data.error || 'Failed to load competition specifics');
      }

      // Filter to show both public and artists_only specifics (authenticated artists can see both)
      const artistSpecifics = (data.specifics || []).filter(s =>
        s.visibility === 'public' || s.visibility === 'artists_only'
      );

      setSpecifics(artistSpecifics);
    } catch (err) {
      console.error('Error loading competition specifics:', err);
      setError(err.message || 'Failed to load competition specifics');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (name) => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('venue') || nameLower.includes('arrival') || nameLower.includes('location')) {
      return '📍';
    }
    if (nameLower.includes('timing') || nameLower.includes('schedule') || nameLower.includes('format')) {
      return '⏱️';
    }
    if (nameLower.includes('rules') || nameLower.includes('materials')) {
      return '🎨';
    }
    return '📋';
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="700px" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <FileTextIcon width="20" height="20" />
            Competition Specifics
          </Flex>
        </Dialog.Title>

        {eventName && (
          <Dialog.Description size="2" mb="3">
            {eventName}
          </Dialog.Description>
        )}

        {loading && (
          <Flex direction="column" gap="3" mt="4">
            <Skeleton height="100px" />
            <Skeleton height="150px" />
            <Skeleton height="200px" />
          </Flex>
        )}

        {error && (
          <Callout.Root color="red" mt="3">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {!loading && !error && specifics.length === 0 && (
          <Callout.Root color="gray" mt="3">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              No competition specifics have been set for this event yet.
            </Callout.Text>
          </Callout.Root>
        )}

        {!loading && !error && specifics.length > 0 && (
          <Flex direction="column" gap="4" mt="4">
            {specifics.map((specific, index) => (
              <Box key={specific.id}>
                {index > 0 && <Separator size="4" my="3" />}

                <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                  <Flex direction="column" gap="3">
                    <Flex align="center" gap="2">
                      <Text size="4" weight="bold">
                        {getIcon(specific.name)} {specific.name}
                      </Text>
                    </Flex>

                    <Box>
                      <MarkdownRenderer content={specific.content} />
                    </Box>

                    {specific.updated_at && (
                      <Text size="1" color="gray">
                        Version {specific.version} • Last updated: {new Date(specific.updated_at).toLocaleDateString()}
                      </Text>
                    )}
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
  );
};

export default CompetitionSpecificsModal;
