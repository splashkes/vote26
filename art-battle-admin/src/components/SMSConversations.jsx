import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  Flex,
  Text,
  TextField,
  TextArea,
  Button,
  Badge,
  ScrollArea,
  Separator,
  Avatar,
  IconButton,
  Heading,
  Spinner,
  Tooltip,
  AlertDialog
} from '@radix-ui/themes';
import {
  PaperPlaneIcon,
  MagnifyingGlassIcon,
  PersonIcon,
  LockClosedIcon,
  LockOpen1Icon,
  ReloadIcon,
  EnvelopeClosedIcon,
  MobileIcon,
  CrossCircledIcon,
  CheckCircledIcon
} from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const SMSConversations = () => {
  // State for contacts list
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // State for conversation
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendStatus, setSendStatus] = useState(null); // { type: 'success' | 'error', message: string }

  // State for blocking
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockingInProgress, setBlockingInProgress] = useState(false);
  const [blockStatus, setBlockStatus] = useState(null); // { type: 'success' | 'error', message: string }

  // State for conversation status (done/undone)
  const [conversationStatus, setConversationStatus] = useState(null); // { is_done, marked_by_email, marked_at, notes }
  const [statusHistory, setStatusHistory] = useState([]);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [contactStatuses, setContactStatuses] = useState(new Map()); // Map of phone -> is_done

  // State for resizable panels
  const [leftPanelWidth, setLeftPanelWidth] = useState(400); // pixels
  const [isResizing, setIsResizing] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);

  // Realtime subscription refs
  const realtimeSubscription = useRef(null);
  const contactsSubscription = useRef(null);

  // Load initial contacts on mount
  useEffect(() => {
    loadContacts();
    setupContactsRealtimeSubscription();

    // Cleanup realtime subscriptions on unmount
    return () => {
      if (realtimeSubscription.current) {
        supabase.removeChannel(realtimeSubscription.current);
      }
      if (contactsSubscription.current) {
        supabase.removeChannel(contactsSubscription.current);
      }
    };
  }, []);

  // Setup realtime subscription for selected contact messages
  useEffect(() => {
    setupRealtimeSubscription();
  }, [selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 300 && newWidth <= window.innerWidth - 400) {
        setLeftPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      // Call edge function to get contacts
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-get-contacts',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ days: 30 })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load contacts');
      }

      const result = await response.json();
      setContacts(result.contacts || []);

      // Load status for all contacts
      await loadContactStatuses(result.contacts || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadContactStatuses = async (contactsList) => {
    try {
      if (contactsList.length === 0) return;

      const phoneNumbers = contactsList.map(c => c.phone).filter(Boolean);
      if (phoneNumbers.length === 0) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Use edge function for batch status loading
      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-get-conversation-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ phone_numbers: phoneNumbers })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load conversation statuses');
      }

      const result = await response.json();

      // Convert object to Map
      const statusMap = new Map();
      Object.entries(result.statuses || {}).forEach(([phone, isDone]) => {
        statusMap.set(phone, isDone);
      });

      setContactStatuses(statusMap);
    } catch (error) {
      console.error('Error loading contact statuses:', error);
    }
  };

  const loadConversation = async (contact) => {
    setLoadingMessages(true);
    try {
      // Call edge function to get conversation
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-get-conversation',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            phone_number: contact.phone,
            limit: 100
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load conversation');
      }

      const result = await response.json();

      // Update contact info if we got person data
      if (result.person) {
        setSelectedContact(prev => ({ ...prev, ...result.person }));
      }

      // Set messages from the edge function response - already sorted by the edge function
      const allMessages = result.messages || [];
      setMessages(allMessages);

      // Load conversation status and history
      await loadConversationStatus(contact.phone);
    } catch (error) {
      console.error('Error loading conversation:', error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadConversationStatus = async (phoneNumber) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Use edge function to load status and history
      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-get-conversation-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            phone_number: phoneNumber,
            include_history: true
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load conversation status');
      }

      const result = await response.json();

      setConversationStatus(result.current_status);
      setStatusHistory(result.history || []);
    } catch (error) {
      console.error('Error loading conversation status:', error);
      setConversationStatus(null);
      setStatusHistory([]);
    }
  };

  const toggleConversationStatus = async () => {
    if (!selectedContact || togglingStatus) return;

    setTogglingStatus(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const newStatus = !conversationStatus?.is_done;

      // Insert new status record
      const { error } = await supabase
        .from('sms_conversation_status')
        .insert({
          phone_number: selectedContact.phone,
          is_done: newStatus,
          marked_by_email: user.email,
          marked_at: new Date().toISOString()
        });

      if (error) throw error;

      // Update the contact statuses map
      setContactStatuses(prev => {
        const newMap = new Map(prev);
        newMap.set(selectedContact.phone, newStatus);
        return newMap;
      });

      // Reload status to get updated state
      await loadConversationStatus(selectedContact.phone);
    } catch (error) {
      console.error('Error toggling conversation status:', error);
    } finally {
      setTogglingStatus(false);
    }
  };

  const setupContactsRealtimeSubscription = () => {
    // Subscribe to all inbound and outbound messages to update contacts list
    contactsSubscription.current = supabase
      .channel('sms-all-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_inbound'
        },
        () => {
          // Reload contacts when new inbound message arrives
          loadContacts();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_outbound'
        },
        () => {
          // Reload contacts when new outbound message is sent
          loadContacts();
        }
      )
      .subscribe();
  };


  const setupRealtimeSubscription = () => {
    // Remove existing subscription
    if (realtimeSubscription.current) {
      supabase.removeChannel(realtimeSubscription.current);
    }

    if (!selectedContact) return;

    // Subscribe to new inbound messages for this contact
    realtimeSubscription.current = supabase
      .channel(`sms-${selectedContact.phone}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_inbound',
          filter: `from_phone=eq.${selectedContact.phone}`
        },
        async (payload) => {
          const newMessage = {
            ...payload.new,
            type: 'inbound',
            timestamp: payload.new.created_at
          };
          setMessages(prev => [...prev, newMessage]);

          // Update contact's last message
          setContacts(prev => prev.map(c =>
            c.phone === selectedContact.phone
              ? { ...c, last_message: payload.new.message_body, last_message_at: payload.new.created_at }
              : c
          ));

          // Auto-undone: Mark conversation as not done when inbound message arrives
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Insert new status record with is_done: false
              await supabase
                .from('sms_conversation_status')
                .insert({
                  phone_number: selectedContact.phone,
                  is_done: false,
                  marked_by_email: 'system',
                  notes: 'Auto-undone on inbound message'
                });

              // Update the contact statuses map
              setContactStatuses(prev => {
                const newMap = new Map(prev);
                newMap.set(selectedContact.phone, false);
                return newMap;
              });

              // Reload conversation status to update UI
              await loadConversationStatus(selectedContact.phone);
            }
          } catch (error) {
            console.error('Error auto-undoning conversation:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_outbound',
          filter: `to_phone=eq.${selectedContact.phone}`
        },
        (payload) => {
          console.log('Realtime INSERT on sms_outbound:', payload.new);
          const newMessage = {
            ...payload.new,
            type: 'outbound',
            timestamp: payload.new.created_at || payload.new.sent_at
          };
          setMessages(prev => [...prev, newMessage]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sms_outbound',
          filter: `to_phone=eq.${selectedContact.phone}`
        },
        (payload) => {
          console.log('Realtime UPDATE on sms_outbound:', payload.new);
          // Update existing message with new status
          setMessages(prev => prev.map(msg =>
            msg.id === payload.new.id
              ? {
                  ...payload.new,
                  type: 'outbound',
                  timestamp: payload.new.created_at || payload.new.sent_at || msg.timestamp
                }
              : msg
          ));
        }
      )
      .subscribe();
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedContact || selectedContact.blocked) return;

    setSending(true);
    setSendStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-send-message', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_phone: selectedContact.phone,
          message_body: messageText,
          person_id: selectedContact.person_id || selectedContact.id
        })
      });

      const result = await response.json();

      if (result.success) {
        const savedMessageText = messageText; // Save before clearing

        // Clear input
        setMessageText('');

        // Show success message
        setSendStatus({ type: 'success', message: 'Message sent successfully!' });
        setTimeout(() => setSendStatus(null), 3000);

        // Update contact's last message
        setContacts(prev => prev.map(c =>
          c.phone === selectedContact.phone
            ? { ...c, last_message: savedMessageText, last_message_at: new Date().toISOString() }
            : c
        ));

        // Note: Don't add temporary message - realtime INSERT will handle it
        // The message is already in the database with correct status from Telnyx API
      } else {
        setSendStatus({ type: 'error', message: `Failed to send: ${result.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setSendStatus({ type: 'error', message: 'Failed to send message. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const toggleBlock = async () => {
    if (!selectedContact?.person_id) {
      setBlockStatus({ type: 'error', message: 'Cannot block/unblock: No person record found' });
      setTimeout(() => setBlockStatus(null), 3000);
      return;
    }

    setBlockingInProgress(true);
    setBlockStatus(null);
    try {
      const newBlockedStatus = selectedContact.blocked ? 0 : 1;

      const { error } = await supabase
        .from('people')
        .update({ message_blocked: newBlockedStatus })
        .eq('id', selectedContact.person_id);

      if (error) throw error;

      // Update local state
      setSelectedContact(prev => ({ ...prev, blocked: newBlockedStatus === 1 }));
      setContacts(prev => prev.map(c =>
        c.phone === selectedContact.phone
          ? { ...c, blocked: newBlockedStatus === 1 }
          : c
      ));

      setBlockDialogOpen(false);
      setBlockStatus({
        type: 'success',
        message: `Contact ${newBlockedStatus === 1 ? 'blocked' : 'unblocked'} successfully!`
      });
      setTimeout(() => setBlockStatus(null), 3000);
    } catch (error) {
      console.error('Error toggling block status:', error);
      setBlockStatus({ type: 'error', message: 'Failed to update block status. Please try again.' });
    } finally {
      setBlockingInProgress(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Generate 2-character avatar from name or phone
  const getAvatarText = (contact) => {
    if (contact.blocked) return <LockClosedIcon />;

    if (contact.name && contact.name.length >= 2) {
      // Get first 2 letters of name
      return contact.name.substring(0, 2).toUpperCase();
    } else if (contact.phone) {
      // Get last 2 digits of phone number
      const digits = contact.phone.replace(/\D/g, '');
      return digits.slice(-2);
    }
    return <PersonIcon />;
  };

  // Generate color from 2-character string
  const getAvatarColor = (contact) => {
    if (contact.blocked) return 'red';

    const text = contact.name ? contact.name.substring(0, 2) : contact.phone?.slice(-2) || '';

    // Hash the text to a number
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Map to Radix UI colors
    const colors = ['tomato', 'red', 'ruby', 'crimson', 'pink', 'plum', 'purple', 'violet',
                   'iris', 'indigo', 'blue', 'cyan', 'teal', 'jade', 'green', 'grass',
                   'bronze', 'gold', 'brown', 'orange'];
    return colors[Math.abs(hash) % colors.length];
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Combine messages and status history into a single timeline
  const getCombinedTimeline = () => {
    const timeline = [];

    // Add messages
    messages.forEach(msg => {
      timeline.push({
        type: 'message',
        timestamp: msg.timestamp,
        data: msg
      });
    });

    // Add status changes
    statusHistory.forEach(status => {
      timeline.push({
        type: 'status',
        timestamp: status.marked_at,
        data: status
      });
    });

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return timeline;
  };

  // Group contacts by time range
  const groupContactsByTime = (contactsList) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Last Week': [],
      'Older': []
    };

    contactsList.forEach(contact => {
      const messageDate = new Date(contact.last_message_at);
      const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

      if (messageDay.getTime() === today.getTime()) {
        groups['Today'].push(contact);
      } else if (messageDay.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(contact);
      } else if (messageDate >= lastWeek && messageDate < yesterday) {
        const dayName = messageDate.toLocaleDateString('en-US', { weekday: 'long' });
        groups['This Week'].push(contact);
      } else if (messageDate >= new Date(lastWeek.getTime() - 7 * 24 * 60 * 60 * 1000) && messageDate < lastWeek) {
        groups['Last Week'].push(contact);
      } else {
        groups['Older'].push(contact);
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, contacts]) => contacts.length > 0);
  };

  // Filter contacts based on search and engagement
  const filteredContacts = contacts.filter(contact => {
    // Only show conversations with engagement:
    // - At least one inbound message (they replied), OR
    // - More than one message total (conversation exists)
    const inboundCount = contact.inbound_count || 0;
    const totalMessages = contact.total_messages || 0;
    const hasEngagement = (inboundCount > 0) || (totalMessages > 1);

    if (!hasEngagement) return false;

    // Then apply search filter
    const query = searchQuery.toLowerCase();
    if (!query) return true;

    return (
      contact.phone?.toLowerCase().includes(query) ||
      contact.name?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query) ||
      contact.last_message?.toLowerCase().includes(query)
    );
  });

  // Group filtered contacts by time
  const groupedContacts = groupContactsByTime(filteredContacts);

  return (
    <Flex style={{ height: 'calc(100vh - 100px)', width: '100%', position: 'relative' }}>
      {/* Left Panel - Contact List */}
      <Card style={{ width: `${leftPanelWidth}px`, margin: 0, borderRadius: 0, flexShrink: 0 }}>
        <Flex direction="column" style={{ height: '100%' }}>
          {/* Search Bar */}
          <Box p="4" style={{ borderBottom: '1px solid var(--gray-4)' }}>
            <TextField.Root
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            >
              <TextField.Slot>
                <MagnifyingGlassIcon />
              </TextField.Slot>
              <TextField.Slot side="right">
                <IconButton
                  size="1"
                  variant="ghost"
                  onClick={loadContacts}
                  disabled={loadingContacts}
                >
                  <ReloadIcon />
                </IconButton>
              </TextField.Slot>
            </TextField.Root>
          </Box>

          {/* Contacts List */}
          <ScrollArea style={{ flex: 1 }}>
            {loadingContacts ? (
              <Flex justify="center" align="center" p="4">
                <Spinner />
              </Flex>
            ) : filteredContacts.length === 0 ? (
              <Text size="2" color="gray" style={{ padding: '2rem', textAlign: 'center' }}>
                No conversations found
              </Text>
            ) : (
              <Box>
                {groupedContacts.map(([groupName, groupContacts]) => (
                  <Box key={groupName}>
                    {/* Group Header */}
                    <Box px="3" py="2" style={{ backgroundColor: 'var(--gray-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                      <Text size="1" weight="bold" color="gray">
                        {groupName}
                      </Text>
                    </Box>

                    {/* Contacts in this group */}
                    {groupContacts.map(contact => (
                      <Box
                        key={contact.phone}
                        p="3"
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedContact?.phone === contact.phone ? 'var(--accent-3)' : 'transparent',
                          borderBottom: '1px solid var(--gray-3)',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => {
                          setSelectedContact(contact);
                          loadConversation(contact);
                        }}
                      >
                        <Flex justify="between" align="start" gap="3">
                          <Avatar
                            size="3"
                            fallback={getAvatarText(contact)}
                            color={getAvatarColor(contact)}
                          />

                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Flex justify="between" align="center" gap="2">
                              <Flex align="center" gap="2" style={{ minWidth: 0, flex: 1 }}>
                                <Text
                                  size="2"
                                  weight="bold"
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {contact.name || 'Unknown'}
                                  {contact.blocked && (
                                    <Badge color="red" size="1" ml="2">Blocked</Badge>
                                  )}
                                </Text>
                                {contactStatuses.has(contact.phone) && (
                                  <Tooltip content={contactStatuses.get(contact.phone) ? "Marked as Done" : "Not Done"}>
                                    <CheckCircledIcon
                                      color={contactStatuses.get(contact.phone) ? "green" : "gray"}
                                      style={{
                                        opacity: contactStatuses.get(contact.phone) ? 1 : 0.3,
                                        width: '16px',
                                        height: '16px',
                                        flexShrink: 0
                                      }}
                                    />
                                  </Tooltip>
                                )}
                              </Flex>
                              <Text size="1" color="gray" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                                {formatTime(contact.last_message_at)}
                              </Text>
                            </Flex>

                            <Text
                              size="1"
                              color="gray"
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: '4px'
                              }}
                            >
                              {contact.last_message}
                            </Text>
                          </Box>

                          {contact.unread_count > 0 && (
                            <Badge color="red" size="2" variant="solid">
                              {contact.unread_count}
                            </Badge>
                          )}
                        </Flex>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            )}
          </ScrollArea>
        </Flex>
      </Card>

      {/* Resize Handle */}
      <Box
        onMouseDown={() => setIsResizing(true)}
        style={{
          width: '4px',
          cursor: 'col-resize',
          backgroundColor: 'var(--gray-4)',
          flexShrink: 0,
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: 'var(--accent-9)'
          }
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-9)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-4)'}
      />

      {/* Right Panel - Conversation */}
      <Box style={{ flex: 1 }}>
        {selectedContact ? (
          <Flex direction="column" style={{ height: '100%' }}>
            {/* Contact Header */}
            <Card style={{ margin: 0, borderRadius: 0 }}>
              <Flex justify="between" align="center" p="3">
                <Box>
                  <Flex align="center" gap="2">
                    <Text size="3" weight="bold">
                      {selectedContact.name || 'Unknown Contact'}
                    </Text>
                    {selectedContact.blocked && (
                      <Badge color="red" size="2">Blocked</Badge>
                    )}
                  </Flex>
                  <Flex gap="3" mt="1">
                    <Text size="2" color="gray">
                      <MobileIcon style={{ display: 'inline', marginRight: '4px' }} />
                      {selectedContact.phone}
                    </Text>
                    {selectedContact.email && (
                      <Text size="2" color="gray">
                        <EnvelopeClosedIcon style={{ display: 'inline', marginRight: '4px' }} />
                        {selectedContact.email}
                      </Text>
                    )}
                  </Flex>
                </Box>

                <Flex direction="column" align="end" gap="2">
                  <Flex gap="2">
                    <Tooltip content={conversationStatus?.is_done ? "Mark as Not Done" : "Mark as Done"}>
                      <IconButton
                        size="2"
                        color={conversationStatus?.is_done ? "green" : "gray"}
                        variant={conversationStatus?.is_done ? "solid" : "soft"}
                        onClick={toggleConversationStatus}
                        disabled={togglingStatus}
                      >
                        {conversationStatus?.is_done ? <CheckCircledIcon /> : <CheckCircledIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip content={selectedContact.blocked ? "Unblock Contact" : "Block Contact"}>
                      <IconButton
                        size="2"
                        color={selectedContact.blocked ? "green" : "red"}
                        variant="soft"
                        onClick={() => setBlockDialogOpen(true)}
                      >
                        {selectedContact.blocked ? <LockOpen1Icon /> : <LockClosedIcon />}
                      </IconButton>
                    </Tooltip>
                  </Flex>
                  {blockStatus && (
                    <Flex align="center" gap="1" style={{ fontSize: '12px' }}>
                      {blockStatus.type === 'success' ? (
                        <CheckCircledIcon color="green" />
                      ) : (
                        <CrossCircledIcon color="red" />
                      )}
                      <Text size="1" color={blockStatus.type === 'success' ? 'green' : 'red'}>
                        {blockStatus.message}
                      </Text>
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Card>

            {/* Messages Area */}
            <ScrollArea style={{ flex: 1, padding: '1rem' }}>
              {loadingMessages ? (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                  <Spinner />
                </Flex>
              ) : messages.length === 0 && statusHistory.length === 0 ? (
                <Text size="2" color="gray" style={{ textAlign: 'center' }}>
                  No messages yet. Start a conversation!
                </Text>
              ) : (
                <Flex direction="column" gap="3">
                  {getCombinedTimeline().map((item, index) => {
                    if (item.type === 'status') {
                      // Render status change
                      const status = item.data;
                      return (
                        <Flex key={`status-${status.id || index}`} justify="center">
                          <Card
                            style={{
                              backgroundColor: 'var(--amber-2)',
                              borderLeft: `3px solid var(--amber-9)`,
                              padding: '0.5rem 1rem',
                              margin: '0.5rem 0',
                              maxWidth: '80%'
                            }}
                          >
                            <Flex direction="column" gap="1">
                              <Flex align="center" gap="2">
                                {status.is_done ? (
                                  <CheckCircledIcon color="green" />
                                ) : (
                                  <CrossCircledIcon color="orange" />
                                )}
                                <Text size="2" weight="bold">
                                  {status.is_done ? 'Marked as Done' : 'Marked as Not Done'}
                                </Text>
                              </Flex>
                              <Text size="1" color="gray">
                                by {status.marked_by_email === 'system' ? 'System' : status.marked_by_email}
                                {' at '}{formatMessageTime(status.marked_at)}
                              </Text>
                              {status.notes && (
                                <Text size="1" style={{ fontStyle: 'italic' }}>
                                  {status.notes}
                                </Text>
                              )}
                            </Flex>
                          </Card>
                        </Flex>
                      );
                    } else {
                      // Render message
                      const message = item.data;
                      return (
                        <Flex
                          key={`message-${message.id || index}`}
                          justify={message.type === 'outbound' ? 'end' : 'start'}
                        >
                          <Card
                            style={{
                              maxWidth: '70%',
                              backgroundColor: message.type === 'outbound'
                                ? 'var(--accent-3)'
                                : 'var(--gray-3)',
                              padding: '0.75rem',
                              margin: 0
                            }}
                          >
                            <Text size="2" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {message.message_body}
                            </Text>
                            <Flex justify="between" align="center" mt="2" gap="2">
                              <Text size="1" color="gray">
                                {formatMessageTime(message.timestamp)}
                              </Text>
                              {message.type === 'outbound' && (
                                <Badge
                                  size="1"
                                  color={
                                    message.status === 'delivered' ? 'green' :
                                    message.status === 'sent' ? 'blue' :
                                    message.status === 'failed' ? 'red' : 'gray'
                                  }
                                >
                                  {message.status || 'sending'}
                                </Badge>
                              )}
                            </Flex>
                          </Card>
                        </Flex>
                      );
                    }
                  })}
                  <div ref={messagesEndRef} />
                </Flex>
              )}
            </ScrollArea>

            {/* Message Input */}
            <Box p="3" style={{ borderTop: '1px solid var(--gray-4)' }}>
              {selectedContact.blocked ? (
                <Card variant="surface">
                  <Flex align="center" gap="2" p="2">
                    <CrossCircledIcon color="red" />
                    <Text size="2" color="gray">
                      This contact is blocked. Unblock to send messages.
                    </Text>
                  </Flex>
                </Card>
              ) : (
                <Flex direction="column" gap="2">
                  <Flex gap="2">
                    <TextArea
                      ref={messageInputRef}
                      placeholder="Type a message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      style={{ flex: 1, minHeight: '40px', maxHeight: '120px' }}
                      disabled={sending}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!messageText.trim() || sending}
                      loading={sending}
                    >
                      <PaperPlaneIcon />
                      Send
                    </Button>
                  </Flex>
                  {sendStatus && (
                    <Flex align="center" gap="1" p="1" style={{
                      backgroundColor: sendStatus.type === 'success' ? 'var(--green-2)' : 'var(--red-2)',
                      borderRadius: '4px'
                    }}>
                      {sendStatus.type === 'success' ? (
                        <CheckCircledIcon color="green" />
                      ) : (
                        <CrossCircledIcon color="red" />
                      )}
                      <Text size="1" color={sendStatus.type === 'success' ? 'green' : 'red'}>
                        {sendStatus.message}
                      </Text>
                    </Flex>
                  )}
                </Flex>
              )}
            </Box>
          </Flex>
        ) : (
          <Flex justify="center" align="center" style={{ height: '100%' }}>
            <Text size="3" color="gray">
              Select a conversation to start messaging
            </Text>
          </Flex>
        )}
      </Box>

      {/* Block/Unblock Confirmation Dialog */}
      <AlertDialog.Root open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <AlertDialog.Content style={{ maxWidth: 450 }}>
          <AlertDialog.Title>
            {selectedContact?.blocked ? 'Unblock' : 'Block'} Contact
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to {selectedContact?.blocked ? 'unblock' : 'block'}{' '}
            <strong>{selectedContact?.name || selectedContact?.phone}</strong>?
            {!selectedContact?.blocked && (
              <> This will prevent them from receiving any marketing messages.</>
            )}
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color={selectedContact?.blocked ? "green" : "red"}
                onClick={toggleBlock}
                disabled={blockingInProgress}
              >
                {blockingInProgress ? 'Processing...' : selectedContact?.blocked ? 'Unblock' : 'Block'}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
};

export default SMSConversations;