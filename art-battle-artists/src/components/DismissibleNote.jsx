import { useState, useEffect } from 'react';
import {
  Card,
  Flex,
  Text,
  IconButton,
  Callout,
  Box,
} from '@radix-ui/themes';
import {
  Cross2Icon,
  InfoCircledIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * DismissibleNote component
 *
 * Displays informational notes/announcements that users can dismiss
 * Dismissals are tracked in the database and persist across sessions
 *
 * @param {string} noteId - Unique identifier for this note (e.g., 'payment-alternative-info-2025-10')
 * @param {string} variant - Visual variant: 'info', 'warning', 'success' (default: 'info')
 * @param {ReactNode} children - Content of the note
 * @param {string} title - Optional title for the note
 * @param {boolean} showByDefault - If true, shows note even without auth (default: false)
 */
const DismissibleNote = ({
  noteId,
  variant = 'info',
  children,
  title = null,
  showByDefault = false
}) => {
  const { person, loading: authLoading } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isCheckingDismissal, setIsCheckingDismissal] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (person) {
        checkDismissalStatus();
      } else {
        // No auth - check localStorage for anonymous dismissals
        checkLocalDismissal();
      }
    }
  }, [person, authLoading, noteId]);

  const checkDismissalStatus = async () => {
    if (!person?.id || !noteId) {
      setIsCheckingDismissal(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('artist_note_dismissals')
        .select('id, dismissed_at')
        .eq('person_id', person.id)
        .eq('note_id', noteId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking dismissal status:', error);
      }

      setIsDismissed(!!data);
    } catch (err) {
      console.error('Error checking dismissal:', err);
    } finally {
      setIsCheckingDismissal(false);
    }
  };

  const checkLocalDismissal = () => {
    // For non-authenticated users, use localStorage
    try {
      const dismissedNotes = JSON.parse(localStorage.getItem('dismissedNotes') || '{}');
      setIsDismissed(!!dismissedNotes[noteId]);
    } catch (err) {
      console.error('Error checking local dismissal:', err);
    } finally {
      setIsCheckingDismissal(false);
    }
  };

  const handleDismiss = async () => {
    setIsDismissing(true);

    try {
      if (person?.id) {
        // Authenticated user - save to database
        const { error } = await supabase
          .from('artist_note_dismissals')
          .insert({
            person_id: person.id,
            note_id: noteId,
            dismissed_at: new Date().toISOString()
          });

        if (error) {
          console.error('Error dismissing note:', error);
          // Fall back to localStorage on error
          saveLocalDismissal();
        }
      } else {
        // Anonymous user - save to localStorage
        saveLocalDismissal();
      }

      setIsDismissed(true);
    } catch (err) {
      console.error('Error dismissing note:', err);
      // Fall back to localStorage
      saveLocalDismissal();
      setIsDismissed(true);
    } finally {
      setIsDismissing(false);
    }
  };

  const saveLocalDismissal = () => {
    try {
      const dismissedNotes = JSON.parse(localStorage.getItem('dismissedNotes') || '{}');
      dismissedNotes[noteId] = new Date().toISOString();
      localStorage.setItem('dismissedNotes', JSON.stringify(dismissedNotes));
    } catch (err) {
      console.error('Error saving local dismissal:', err);
    }
  };

  const getVariantConfig = () => {
    switch (variant) {
      case 'warning':
        return {
          color: 'orange',
          icon: <ExclamationTriangleIcon width="18" height="18" />,
          borderColor: 'var(--orange-8)',
          bgColor: 'var(--orange-2)'
        };
      case 'success':
        return {
          color: 'green',
          icon: <CheckCircledIcon width="18" height="18" />,
          borderColor: 'var(--green-8)',
          bgColor: 'var(--green-2)'
        };
      case 'info':
      default:
        return {
          color: 'blue',
          icon: <InfoCircledIcon width="18" height="18" />,
          borderColor: 'var(--blue-8)',
          bgColor: 'var(--blue-2)'
        };
    }
  };

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  // Don't render while checking dismissal status (prevents flash)
  if (isCheckingDismissal) {
    return null;
  }

  // Don't render if no person and not showing by default
  if (!showByDefault && !person) {
    return null;
  }

  const variantConfig = getVariantConfig();

  return (
    <Card
      size="3"
      style={{
        marginBottom: '1.5rem',
        border: `2px solid ${variantConfig.borderColor}`,
        backgroundColor: variantConfig.bgColor
      }}
    >
      <Flex justify="between" align="start" gap="3">
        <Flex direction="column" gap="2" style={{ flex: 1 }}>
          {title && (
            <Flex align="center" gap="2">
              {variantConfig.icon}
              <Text size="3" weight="bold">
                {title}
              </Text>
            </Flex>
          )}
          <Box>
            {typeof children === 'string' ? (
              <Text size="2">{children}</Text>
            ) : (
              children
            )}
          </Box>
        </Flex>

        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={handleDismiss}
          disabled={isDismissing}
          style={{ flexShrink: 0 }}
        >
          <Cross2Icon width="14" height="14" />
        </IconButton>
      </Flex>
    </Card>
  );
};

export default DismissibleNote;
