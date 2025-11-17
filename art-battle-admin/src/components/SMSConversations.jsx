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
  const [contactsPage, setContactsPage] = useState(1);
  const [hasMoreContacts, setHasMoreContacts] = useState(true);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);

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

  // Refs
  const messagesEndRef = useRef(null);
  const messageInputRef = useRef(null);
  const contactsListRef = useRef(null);

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
    } catch (error) {
      console.error('Error loading contacts:', error);
      // Fallback to direct query if edge function fails
      await loadContactsFallback();
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadContactsFallback = async () => {
    try {
      // Get recent conversations by combining inbound and outbound messages
      const [inboundResult, outboundResult] = await Promise.all([
        supabase
          .from('sms_inbound')
          .select('from_phone, message_body, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('sms_outbound')
          .select('to_phone, message_body, created_at')
          .order('created_at', { ascending: false })
          .limit(100)
      ]);

      // Combine and dedupe phone numbers
      const phoneMap = new Map();

      // Process inbound messages
      inboundResult.data?.forEach(msg => {
        const existing = phoneMap.get(msg.from_phone);
        if (!existing || new Date(msg.created_at) > new Date(existing.last_message_at)) {
          phoneMap.set(msg.from_phone, {
            phone: msg.from_phone,
            last_message: msg.message_body,
            last_message_at: msg.created_at,
            unread_count: existing ? existing.unread_count + 1 : 1
          });
        }
      });

      // Process outbound messages
      outboundResult.data?.forEach(msg => {
        const existing = phoneMap.get(msg.to_phone);
        if (!existing || new Date(msg.created_at) > new Date(existing.last_message_at)) {
          phoneMap.set(msg.to_phone, {
            phone: msg.to_phone,
            last_message: msg.message_body,
            last_message_at: msg.created_at,
            unread_count: 0 // Outbound messages don't count as unread
          });
        }
      });

      // Convert to array and enrich with people data
      const phoneNumbers = Array.from(phoneMap.keys());
      const { data: peopleData } = await supabase
        .from('people')
        .select('id, phone, phone_number, first_name, last_name, email, message_blocked')
        .or(`phone.in.(${phoneNumbers.join(',')}),phone_number.in.(${phoneNumbers.join(',')})`);

      // Merge people data with phone map
      const contactsList = Array.from(phoneMap.values()).map(contact => {
        const person = peopleData?.find(p =>
          p.phone === contact.phone || p.phone_number === contact.phone
        );
        return {
          ...contact,
          person_id: person?.id,
          name: person ? `${person.first_name || ''} ${person.last_name || ''}`.trim() : null,
          email: person?.email,
          blocked: person?.message_blocked === 1
        };
      });

      // Sort by most recent
      contactsList.sort((a, b) =>
        new Date(b.last_message_at) - new Date(a.last_message_at)
      );

      setContacts(contactsList);
    } catch (error) {
      console.error('Error in fallback contact loading:', error);
      setContacts([]);
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
    } catch (error) {
      console.error('Error loading conversation:', error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
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

  const loadMoreContacts = async () => {
    if (!hasMoreContacts || loadingMoreContacts) return;

    setLoadingMoreContacts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        'https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-sms-get-contacts',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            days: 90, // Load older messages
            offset: contacts.length // Pagination offset
          })
        }
      );

      if (!response.ok) return;

      const result = await response.json();
      const newContacts = result.contacts || [];

      if (newContacts.length === 0) {
        setHasMoreContacts(false);
      } else {
        setContacts(prev => [...prev, ...newContacts]);
      }
    } catch (error) {
      console.error('Error loading more contacts:', error);
    } finally {
      setLoadingMoreContacts(false);
    }
  };

  const handleContactsScroll = (e) => {
    const element = e.target;
    const scrolledToBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;

    if (scrolledToBottom && hasMoreContacts && !loadingMoreContacts) {
      loadMoreContacts();
    }
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
        (payload) => {
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

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    const query = searchQuery.toLowerCase();
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
    <Flex style={{ height: 'calc(100vh - 100px)', width: '100%' }}>
      {/* Left Panel - Contact List */}
      <Card style={{ width: '40%', margin: 0, borderRadius: 0 }}>
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
                {filteredContacts.map(contact => (
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

                      <Box style={{ flex: 1 }}>
                        <Flex justify="between" align="center">
                          <Text size="2" weight="bold">
                            {contact.name || 'Unknown'}
                            {contact.blocked && (
                              <Badge color="red" size="1" ml="2">Blocked</Badge>
                            )}
                          </Text>
                          <Text size="1" color="gray">
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
            )}
          </ScrollArea>
        </Flex>
      </Card>

      {/* Right Panel - Conversation */}
      <Box style={{ flex: 1, borderLeft: '1px solid var(--gray-4)' }}>
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
              ) : messages.length === 0 ? (
                <Text size="2" color="gray" style={{ textAlign: 'center' }}>
                  No messages yet. Start a conversation!
                </Text>
              ) : (
                <Flex direction="column" gap="3">
                  {messages.map((message, index) => (
                    <Flex
                      key={message.id || index}
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
                  ))}
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