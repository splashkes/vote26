import { useState, useEffect } from 'react';
import {
  Dialog,
  Flex,
  Box,
  Heading,
  Text,
  Button,
  Separator,
  Badge,
  Card,
  VisuallyHidden
} from '@radix-ui/themes';
import { Cross2Icon, InfoCircledIcon } from '@radix-ui/react-icons';

const RELEASE_NOTES_VERSION = '2025.09.04'; // Update this when adding new notes

const releaseNotes = {
  version: '2025.09.04',
  date: 'September 4, 2025',
  title: 'Enhanced Security & Monitoring Updates',
  sections: [
    {
      date: 'September 4, 2025',
      time: 'Latest Updates - Enhanced Security & Reliability',
      items: [
        '🛡️ Enhanced artist profile security - artists now always see their correct information',
        '🔍 New automated monitoring system continuously watches for system health',
        '📧 Improved email delivery tracking ensures artists receive invitations',
        '⏰ Better timezone handling for international events and date management',
        '🎯 Streamlined artist profile access eliminates confusion issues',
        '📊 Real-time system monitoring with automatic alerts for any issues',
        '✨ Enhanced authentication system for more reliable logins',
        '🌍 Better support for international artists and producers'
      ]
    },
    {
      date: 'August 27, 2025',
      time: 'Previous Updates - Workflow Improvements',
      items: [
        '🔄 Artist workflow deduplication with Show All toggle',
        '✨ Real-time voting updates every 10 seconds for admin users',
        '📱 Working SMS reminder system for artist invitations',
        '🎨 Producer message display in artist profiles',
        '📱 Mobile-responsive admin interface'
      ]
    },
    {
      date: 'August 26-27, 2025',
      time: 'UI & UX Improvements',
      items: [
        '🎯 Admin user management with delete & password setting',
        '✨ Cleaner artist profile modals with better close button placement',
        '🗑️ Removed unnecessary UI elements (forgot password, decline buttons)',
        '↩️ Simplified invitation workflow with withdraw functionality',
        '❌ Fixed modal close button alignment issues',
        '📝 Improved invitation error messages for duplicates',
        '🔍 Enhanced debugging for edge functions'
      ]
    },
    {
      date: 'August 20-25, 2025',
      time: 'Core System Updates',
      items: [
        '🌍 International user auth system improvements',
        '📊 Real-time vote analytics implementation',
        '💰 Payment system bug fixes and currency cleanup',
        '📧 Better SMS delivery with proper queue processing',
        '🛠️ Improved error handling throughout the system'
      ]
    }
  ],
  knownIssues: [
    'Automated monitoring alerts may take a few minutes to process',
    'Some older admin accounts may need password reset',
    'Email delivery improvements are still being rolled out gradually'
  ]
};

const ReleaseNotesModal = ({ isOpen, onClose }) => {

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ 
        maxWidth: '90vw', 
        width: '600px',
        maxHeight: '85vh',
        padding: '0'
      }}>
        <VisuallyHidden>
          <Dialog.Title>Release Notes - What's New in Admin</Dialog.Title>
        </VisuallyHidden>
        <Flex direction="column" style={{ height: '100%' }}>
          {/* Header */}
          <Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
            <Flex align="center" justify="between">
              <Flex align="center" gap="3">
                <InfoCircledIcon size={24} color="blue" />
                <Box>
                  <Heading size="5" mb="1">
                    What's New in Admin
                  </Heading>
                  <Text size="2" color="gray">
                    Version {releaseNotes.version} • {releaseNotes.date}
                  </Text>
                </Box>
              </Flex>
              <Dialog.Close>
                <Button variant="ghost" size="2">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Box>

          {/* Content */}
          <Box p="4" style={{ 
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}>
            <Flex direction="column" gap="4">
              {/* Release sections */}
              {releaseNotes.sections.map((section, index) => (
                <Card key={index} style={{ padding: '16px' }}>
                  <Box mb="3">
                    <Text size="3" weight="bold" style={{ display: 'block', marginBottom: '4px' }}>
                      {section.time}
                    </Text>
                    <Text size="1" color="gray">
                      {section.date}
                    </Text>
                  </Box>
                  <Flex direction="column" gap="2">
                    {section.items.map((item, itemIndex) => (
                      <Text key={itemIndex} size="2" style={{ 
                        lineHeight: '1.5'
                      }}>
                        {item}
                      </Text>
                    ))}
                  </Flex>
                </Card>
              ))}

              {/* Known Issues */}
              {releaseNotes.knownIssues.length > 0 && (
                <>
                  <Separator size="4" />
                  <Card style={{ padding: '16px', backgroundColor: 'var(--yellow-2)' }}>
                    <Flex align="center" gap="2" mb="3">
                      <Badge color="yellow" size="2">
                        ⚠️ Known Issues
                      </Badge>
                    </Flex>
                    <Flex direction="column" gap="2">
                      {releaseNotes.knownIssues.map((issue, index) => (
                        <Text key={index} size="2" style={{ 
                          lineHeight: '1.5',
                          paddingLeft: '8px',
                          position: 'relative'
                        }}>
                          <span style={{
                            position: 'absolute',
                            left: '0',
                            color: 'var(--yellow-9)'
                          }}>•</span>
                          {issue}
                        </Text>
                      ))}
                    </Flex>
                  </Card>
                </>
              )}
            </Flex>
          </Box>

          {/* Footer */}
          <Box p="4" style={{ borderTop: '1px solid var(--gray-6)' }}>
            <Flex justify="center">
              <Dialog.Close>
                <Button size="3" style={{ minWidth: '120px' }}>
                  Got it!
                </Button>
              </Dialog.Close>
            </Flex>
          </Box>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

// Hook to manage release notes modal state
export const useReleaseNotes = () => {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  useEffect(() => {
    // Show modal after a short delay for better UX on every login
    const timer = setTimeout(() => {
      setShowReleaseNotes(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const closeReleaseNotes = () => {
    setShowReleaseNotes(false);
  };

  return {
    showReleaseNotes,
    closeReleaseNotes
  };
};

export default ReleaseNotesModal;