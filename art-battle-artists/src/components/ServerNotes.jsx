import { useState, useEffect } from 'react';
import { Flex, Text, Box, Button, Callout } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import DismissibleNote from './DismissibleNote';
import ManualPaymentRequest from './ManualPaymentRequest';

/**
 * ServerNotes component
 * Fetches notes from server-side function and renders them
 * Note content and eligibility logic is handled server-side
 */
const ServerNotes = ({ artistProfile, onNavigateToTab }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchNotes();
    } else {
      setLoading(false);
    }
  }, [user, artistProfile]);

  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('artist-get-notes');

      if (error) {
        console.error('Error fetching notes:', error);
        setNotes([]);
        return;
      }

      setNotes(data.notes || []);
    } catch (err) {
      console.error('Error fetching notes:', err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const renderNoteContent = (note) => {
    if (note.content.type === 'structured') {
      return (
        <Flex direction="column" gap="3">
          {note.content.sections.map((section, idx) => {
            if (section.text) {
              return (
                <Text key={idx} size="2">
                  {section.text}
                </Text>
              );
            }

            if (section.type === 'timeline') {
              return (
                <Flex key={idx} direction="column" gap="2">
                  {section.items.map((item, itemIdx) => (
                    <Box key={itemIdx}>
                      <Text size="2" weight="bold" style={{ color: `var(--${item.color || 'gray'}-11)` }}>
                        {item.emoji} {item.title}
                      </Text>
                      <Text size="2" style={{ display: 'block', marginLeft: '1rem' }}>
                        {item.description}
                        {item.action && (
                          <>
                            {' '}
                            <Text
                              weight="bold"
                              style={{ cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => onNavigateToTab(item.action.tab)}
                            >
                              {item.action.label}
                            </Text>
                          </>
                        )}
                      </Text>
                    </Box>
                  ))}
                </Flex>
              );
            }

            if (section.type === 'callout') {
              return (
                <Callout.Root key={idx} color={section.color} size="1">
                  <Callout.Text>
                    <Text size="1">
                      <strong>{section.title}</strong> {section.text}
                    </Text>
                  </Callout.Text>
                </Callout.Root>
              );
            }

            return null;
          })}
        </Flex>
      );
    }

    if (note.content.type === 'manual-payment-request') {
      // Render using ManualPaymentRequest component with server data
      return (
        <ManualPaymentRequest
          artistProfile={artistProfile}
          serverEligibility={{
            balance: note.content.balance,
            currency: note.content.currency,
            events: note.content.events
          }}
        />
      );
    }

    // Fallback for simple text content
    if (typeof note.content === 'string') {
      return <Text size="2">{note.content}</Text>;
    }

    return null;
  };

  if (loading || !notes.length) {
    return null;
  }

  return (
    <>
      {notes.map(note => {
        // For manual payment requests, use the component directly
        if (note.content.type === 'manual-payment-request') {
          return (
            <ManualPaymentRequest
              key={note.id}
              noteId={note.id}
              artistProfile={artistProfile}
              serverEligibility={{
                balance: note.content.balance,
                currency: note.content.currency,
                events: note.content.events
              }}
            />
          );
        }

        // For other notes, use DismissibleNote
        return (
          <DismissibleNote
            key={note.id}
            noteId={note.id}
            variant={note.variant || 'info'}
            title={note.title}
          >
            {renderNoteContent(note)}
          </DismissibleNote>
        );
      })}
    </>
  );
};

export default ServerNotes;
