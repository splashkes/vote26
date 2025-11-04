import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Flex,
  Text,
  Heading,
  Separator,
  Callout,
  Skeleton,
} from '@radix-ui/themes';
import { InfoCircledIcon, FileTextIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import MarkdownRenderer from './MarkdownRenderer';

const RulesTab = ({ eventId, eventEid }) => {
  const [specifics, setSpecifics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (eventId || eventEid) {
      loadSpecifics();
    } else {
      console.log('[RulesTab] No eventId or eventEid provided, skipping load');
      setLoading(false);
    }
  }, [eventId, eventEid]);

  const loadSpecifics = async () => {
    setLoading(true);
    setError('');

    // Use eventEid if available, otherwise use eventId (which might be an EID in broadcast app)
    const eid = eventEid || eventId;

    console.log('[RulesTab] Loading specifics for EID:', eid);

    try {
      const { data, error: funcError } = await supabase.functions.invoke('public-get-event-competition-specifics', {
        body: { eid }
      });

      console.log('[RulesTab] Function response:', { data, error: funcError });

      if (funcError) throw funcError;

      if (!data) {
        throw new Error('No data returned from function');
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Failed to load competition specifics');
      }

      // Public function already filters to only public specifics
      setSpecifics(data.specifics || []);
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

  if (loading) {
    return (
      <Card>
        <Flex direction="column" gap="3">
          <Skeleton height="100px" />
          <Skeleton height="150px" />
          <Skeleton height="200px" />
        </Flex>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Callout.Root color="red">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      </Card>
    );
  }

  if (specifics.length === 0) {
    return (
      <Card>
        <Callout.Root color="gray">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            No competition rules have been published for this event yet.
          </Callout.Text>
        </Callout.Root>
      </Card>
    );
  }

  return (
    <Card>
      <Heading size="4" mb="4">
        <FileTextIcon width="20" height="20" style={{ display: 'inline', marginRight: '8px' }} />
        Competition Rules & Information
      </Heading>

      <Flex direction="column" gap="4">
        {specifics.map((specific, index) => (
          <Box key={specific.id}>
            {index > 0 && <Separator size="4" my="4" />}

            <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
              <Flex direction="column" gap="3">
                <Flex align="center" gap="2">
                  <Text size="5" weight="bold">
                    {getIcon(specific.name)} {specific.name}
                  </Text>
                </Flex>

                <Box>
                  <MarkdownRenderer content={specific.content} />
                </Box>

                {specific.updated_at && (
                  <Text size="1" color="gray">
                    Last updated: {new Date(specific.updated_at).toLocaleDateString()}
                  </Text>
                )}
              </Flex>
            </Card>
          </Box>
        ))}
      </Flex>
    </Card>
  );
};

export default RulesTab;
