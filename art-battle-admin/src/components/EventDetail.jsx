import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Heading,
  Card,
  Flex,
  Text,
  Badge,
  Tabs,
  Button,
  Spinner,
  Grid,
  Dialog,
  ScrollArea,
  Separator,
  Table,
  Tooltip,
  TextArea,
  Select,
  AlertDialog,
  Callout,
  IconButton,
  Skeleton,
  TextField
} from '@radix-ui/themes';
import { supabase } from '../lib/supabase';
import { DebugField, DebugObjectViewer } from './DebugComponents';
import { debugObject } from '../lib/debugHelpers';
import {
  PersonIcon,
  EnvelopeClosedIcon,
  ChatBubbleIcon,
  Cross2Icon,
  CalendarIcon,
  HeartIcon,
  CardStackIcon,
  EyeOpenIcon,
  ImageIcon,
  ExternalLinkIcon,
  StarIcon,
  ActivityLogIcon,
  InfoCircledIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  HandIcon,
  CrossCircledIcon,
  Share1Icon,
  PaperPlaneIcon,
  ClockIcon,
  EyeNoneIcon,
  EyeOpenIcon as ViewedIcon,
  DotFilledIcon,
  BadgeIcon,
  ReloadIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UpdateIcon,
  PlusIcon
} from '@radix-ui/react-icons';
import { getRFMScore, getBatchRFMScores, getSegmentColor, getSegmentTier } from '../lib/rfmScoring';
import PersonTile from './PersonTile';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import EventDeleteModal from './EventDeleteModal';
import EventPaymentWrapper from './EventPaymentWrapper';
import { useAdmin } from '../contexts/AdminContext';
import { checkEventAdminPermission } from '../lib/adminHelpers';
import { formatDateForDisplay, sortByNewestFirst, getRecentActivityColor } from '../lib/dateUtils';

const EventDetail = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { userLevel } = useAdmin();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [eventPeople, setEventPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [editingProducerTickets, setEditingProducerTickets] = useState(false);
  const [producerTicketsValue, setProducerTicketsValue] = useState('');
  const [producerTicketsCurrency, setProducerTicketsCurrency] = useState('USD');
  const [updatingProducerTickets, setUpdatingProducerTickets] = useState(false);

  const [editingFoodBeverage, setEditingFoodBeverage] = useState(false);
  const [foodBeverageValue, setFoodBeverageValue] = useState('');
  const [foodBeverageCurrency, setFoodBeverageCurrency] = useState('USD');
  const [updatingFoodBeverage, setUpdatingFoodBeverage] = useState(false);

  const [editingOtherRevenue, setEditingOtherRevenue] = useState(false);
  const [otherRevenueValue, setOtherRevenueValue] = useState('');
  const [otherRevenueCurrency, setOtherRevenueCurrency] = useState('USD');
  const [updatingOtherRevenue, setUpdatingOtherRevenue] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personHistory, setPersonHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rfmScores, setRfmScores] = useState(new Map());
  const [healthData, setHealthData] = useState(null);
  const [marketingRecommendations, setMarketingRecommendations] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [slackModalOpen, setSlackModalOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [feedbackType, setFeedbackType] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [sendingToSlack, setSendingToSlack] = useState(false);
  const [eventAdmins, setEventAdmins] = useState([]);
  const [adminPhoneSearch, setAdminPhoneSearch] = useState('');
  const [peopleSearchResults, setPeopleSearchResults] = useState([]);
  const [selectedAdminLevel, setSelectedAdminLevel] = useState('voting');
  const [adminMessage, setAdminMessage] = useState(null);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [phoneValidationError, setPhoneValidationError] = useState(null);
  const [validatedPhone, setValidatedPhone] = useState(null);
  const [artistApplications, setArtistApplications] = useState([]);
  const [artistInvites, setArtistInvites] = useState([]);
  const [artistConfirmations, setArtistConfirmations] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [preEventCollapsed, setPreEventCollapsed] = useState(false);
  const [postEventCollapsed, setPostEventCollapsed] = useState(false);
  const [artistPaymentsCollapsed, setArtistPaymentsCollapsed] = useState(false);
  const [artistPaymentsData, setArtistPaymentsData] = useState([]);
  const [artistPaymentsLoading, setArtistPaymentsLoading] = useState(false);
  const [postEventData, setPostEventData] = useState(null);
  const [postEventLoading, setPostEventLoading] = useState(false);
  const [unpaidModalOpen, setUnpaidModalOpen] = useState(false);
  const [noBidModalOpen, setNoBidModalOpen] = useState(false);
  const [selectedNoBidPainting, setSelectedNoBidPainting] = useState(null);
  const [metaAdsData, setMetaAdsData] = useState(null);
  const [metaAdsLoading, setMetaAdsLoading] = useState(false);
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [artistModalType, setArtistModalType] = useState(''); // 'application', 'invitation', 'confirmation'

  // Artist Payment Detail Modal
  const [showArtistDetail, setShowArtistDetail] = useState(false);
  const [selectedArtistForPayment, setSelectedArtistForPayment] = useState(null);
  const [accountLedger, setAccountLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [stripeDetails, setStripeDetails] = useState(null);
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [lastEventInfo, setLastEventInfo] = useState(null);
  const [loadingLastEvent, setLoadingLastEvent] = useState(false);
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [manualPaymentAmount, setManualPaymentAmount] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState('bank_transfer');
  const [manualPaymentNotes, setManualPaymentNotes] = useState('');
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [manualPaymentRequest, setManualPaymentRequest] = useState(null);
  const [loadingManualPaymentRequest, setLoadingManualPaymentRequest] = useState(false);
  const [revealedPaymentDetails, setRevealedPaymentDetails] = useState(false);
  const [artistPerformanceData, setArtistPerformanceData] = useState(new Map());
  const [sampleWorks, setSampleWorks] = useState([]);
  const [sampleWorksLoading, setSampleWorksLoading] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Bio editing states for artist modal
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [showInvitationForm, setShowInvitationForm] = useState(false);
  const [invitationMessage, setInvitationMessage] = useState('');
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [reminderPhoneUsed, setReminderPhoneUsed] = useState(null);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Artwork Detail Modal (for viewing bidders and sending reminders/offers)
  const [showArtworkDetail, setShowArtworkDetail] = useState(false);
  const [selectedArtworkForBids, setSelectedArtworkForBids] = useState(null);
  const [artworkBids, setArtworkBids] = useState([]);
  const [loadingArtworkBids, setLoadingArtworkBids] = useState(false);
  const [showOfferConfirm, setShowOfferConfirm] = useState(null); // { bid, bidder, artwork }
  const [showReminderHistory, setShowReminderHistory] = useState(null);
  const [showOfferHistory, setShowOfferHistory] = useState(null);
  const [reminderHistory, setReminderHistory] = useState(null);
  const [offerHistory, setOfferHistory] = useState(null);

  // Payment Collection Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({
    actualAmount: '',
    actualTax: '',
    paymentMethod: 'cash',
    collectionNotes: ''
  });
  const [artworkHistoryLoading, setArtworkHistoryLoading] = useState(false);
  const [paymentReminderLoading, setPaymentReminderLoading] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);
  const [lastReminderSent, setLastReminderSent] = useState({});
  const [activeOffers, setActiveOffers] = useState({});

  // Payment Invitation Modal (shared between payment setup flow)
  const [showPaymentInviteModal, setShowPaymentInviteModal] = useState(false);
  const [selectedArtistForInvite, setSelectedArtistForInvite] = useState(null);
  const [inviteType, setInviteType] = useState('email');
  const [adminNote, setAdminNote] = useState('');
  const [sendingPaymentInvite, setSendingPaymentInvite] = useState(false);

  useEffect(() => {
    if (eventId) {
      // Preload all data for fast tab switching - fetch event details first, then others
      const loadAllData = async () => {
        try {
          // Load event details first (required for artist data)
          const eventData = await fetchEventDetail();

          // Then load all other data in parallel, passing event data to artist fetch
          await Promise.all([
            fetchHealthData(),
            fetchArtistData(0, eventData),
            fetchEventPeople(),
            fetchEventAdmins()
          ]);
        } catch (err) {
          console.error('Error preloading event data:', err);
        }
      };

      loadAllData();
    }
  }, [eventId]);

  // Check super admin permission
  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const hasPermission = await checkEventAdminPermission(eventId, 'super');
        console.log('Super admin check result:', hasPermission);
        setIsSuperAdmin(hasPermission);
      } catch (error) {
        console.error('Error checking super admin permission:', error);
        setIsSuperAdmin(false);
      }
    };

    if (eventId) {
      checkSuperAdmin();
    }
  }, [eventId]);

  // Fetch artist payments and post-event data in parallel when event is loaded
  useEffect(() => {
    if (!event) return;

    const fetchPostEventDataIfNeeded = async () => {
      const promises = [];

      // Check if completed and fetch post-event data
      if (event.event_end_datetime) {
        const now = new Date();
        const endTime = new Date(event.event_end_datetime);
        const isCompleted = now > endTime;

        if (isCompleted) {
          promises.push(fetchPostEventData());
          promises.push(fetchMetaAdsData());
        }
      }

      // Fetch artist payments if confirmations are loaded
      if (artistConfirmations.length > 0) {
        promises.push(fetchArtistPayments());
      }

      // Run both in parallel if both conditions are met
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    };

    fetchPostEventDataIfNeeded();
  }, [event, artistConfirmations]);

  const fetchEventDetail = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('events')
        .select(`
          *,
          cities(id, name, country_id, countries(id, name, code, currency_code, currency_symbol)),
          event_admins(id, admin_level, phone),
          rounds(
            id,
            round_number,
            round_contestants(
              id,
              easel_number,
              artist_profiles(id, name, instagram)
            )
          )
        `)
        .eq('id', eventId)
        .single();


      if (fetchError) {
        console.error('Error fetching event detail:', fetchError);
        setError(fetchError.message);
        throw fetchError;
      }

      debugObject(data, 'Event Detail Data');
      setEvent(data);
      return data; // Return the event data
    } catch (err) {
      console.error('Error in fetchEventDetail:', err);
      setError('Failed to load event details');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const toggleApplications = async () => {
    try {
      const newApplicationsOpen = !event.applications_open;

      const { error } = await supabase.rpc('admin_toggle_event_applications', {
        p_event_id: eventId,
        p_applications_open: newApplicationsOpen
      });

      if (error) {
        console.error('Error toggling applications:', error);
        setError('Failed to toggle applications status');
        return;
      }

      // Update local state
      setEvent(prev => ({
        ...prev,
        applications_open: newApplicationsOpen
      }));

    } catch (err) {
      console.error('Error in toggleApplications:', err);
      setError('Failed to toggle applications status');
    }
  };

  const updateProducerTickets = async () => {
    if (!producerTicketsValue || isNaN(parseFloat(producerTicketsValue))) {
      alert('Please enter a valid number');
      return;
    }

    try {
      setUpdatingProducerTickets(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase
        .from('events')
        .update({
          producer_tickets_sold: parseFloat(producerTicketsValue),
          producer_tickets_currency: producerTicketsCurrency,
          producer_tickets_updated_by: user.email,
          producer_tickets_updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

      if (error) throw error;

      // Update local state
      setEvent(prev => ({
        ...prev,
        producer_tickets_sold: parseFloat(producerTicketsValue),
        producer_tickets_currency: producerTicketsCurrency,
        producer_tickets_updated_by: user.email,
        producer_tickets_updated_at: new Date().toISOString()
      }));

      setEditingProducerTickets(false);
      setProducerTicketsValue('');

    } catch (err) {
      console.error('Error updating producer tickets:', err);
      setError('Failed to update producer tickets: ' + err.message);
    } finally {
      setUpdatingProducerTickets(false);
    }
  };

  const updateFoodBeverage = async () => {
    if (!foodBeverageValue || isNaN(parseFloat(foodBeverageValue))) {
      alert('Please enter a valid number');
      return;
    }

    try {
      setUpdatingFoodBeverage(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase
        .from('events')
        .update({
          food_beverage_revenue: parseFloat(foodBeverageValue),
          food_beverage_currency: foodBeverageCurrency,
          food_beverage_updated_by: user.email,
          food_beverage_updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

      if (error) throw error;

      setEvent(prev => ({
        ...prev,
        food_beverage_revenue: parseFloat(foodBeverageValue),
        food_beverage_currency: foodBeverageCurrency,
        food_beverage_updated_by: user.email,
        food_beverage_updated_at: new Date().toISOString()
      }));

      setEditingFoodBeverage(false);
      setFoodBeverageValue('');

    } catch (err) {
      console.error('Error updating food & beverage:', err);
      setError('Failed to update food & beverage: ' + err.message);
    } finally {
      setUpdatingFoodBeverage(false);
    }
  };

  const updateOtherRevenue = async () => {
    if (!otherRevenueValue || isNaN(parseFloat(otherRevenueValue))) {
      alert('Please enter a valid number');
      return;
    }

    try {
      setUpdatingOtherRevenue(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase
        .from('events')
        .update({
          other_revenue: parseFloat(otherRevenueValue),
          other_revenue_currency: otherRevenueCurrency,
          other_revenue_updated_by: user.email,
          other_revenue_updated_at: new Date().toISOString()
        })
        .eq('id', eventId);

      if (error) throw error;

      setEvent(prev => ({
        ...prev,
        other_revenue: parseFloat(otherRevenueValue),
        other_revenue_currency: otherRevenueCurrency,
        other_revenue_updated_by: user.email,
        other_revenue_updated_at: new Date().toISOString()
      }));

      setEditingOtherRevenue(false);
      setOtherRevenueValue('');

    } catch (err) {
      console.error('Error updating other revenue:', err);
      setError('Failed to update other revenue: ' + err.message);
    } finally {
      setUpdatingOtherRevenue(false);
    }
  };

  const fetchEventPeople = async () => {
    if (!eventId) return;
    
    try {
      setPeopleLoading(true);
      
      // Get all unique people who voted, bid, or scanned QR codes at this event
      // Use more specific queries to get actual event participants only
      const [votersResult, biddersResult, scannersResult] = await Promise.all([
        // People who voted at this event (use votes table with event_id filter)
        supabase
          .from('votes')
          .select(`
            person_id,
            people(id, first_name, last_name, email, phone, created_at)
          `)
          .eq('event_id', eventId)
          .not('person_id', 'is', null)
          .not('people', 'is', null),
          
        // People who bid at this event (through art pieces at this event)
        supabase
          .from('bids')
          .select(`
            person_id,
            people(id, first_name, last_name, email, phone, created_at),
            art!inner(event_id)
          `)
          .eq('art.event_id', eventId)
          .not('person_id', 'is', null)
          .not('people', 'is', null)
      ]);

      // Combine all people and deduplicate by person ID
      const allPeople = [];
      const seenIds = new Set();

      [votersResult, biddersResult].forEach(result => {
        if (result.data) {
          result.data.forEach(item => {
            if (item.people && !seenIds.has(item.people.id)) {
              seenIds.add(item.people.id);
              allPeople.push({
                ...item.people,
                // Add activity flags
                voted: votersResult.data?.some(v => v.person_id === item.people.id),
                bid: biddersResult.data?.some(b => b.person_id === item.people.id)
              });
            }
          });
        }
      });

      // Sort by most recent activity (created_at)
      allPeople.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setEventPeople(allPeople);

      // Load RFM scores for the people
      if (allPeople.length > 0) {
        try {
          const personIds = allPeople.map(person => person.id);
          const scores = await getBatchRFMScores(personIds);
          setRfmScores(scores);
        } catch (err) {
          console.error('Error loading RFM scores for event people:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching event people:', err);
    } finally {
      setPeopleLoading(false);
    }
  };

  const fetchHealthData = async () => {
    if (!eventId) return;
    
    try {
      setHealthLoading(true);
      
      // Get event EID to match against ai_analysis_cache
      const { data: eventData } = await supabase
        .from('events')
        .select('eid')
        .eq('id', eventId)
        .single();
      
      if (!eventData?.eid) {
        console.log('No EID found for event:', eventId);
        return;
      }
      
      console.log('Looking for health data for event EID:', eventData.eid);
      
      // Calculate 50 hours ago timestamp
      const now = new Date();
      const fiftyHoursAgo = new Date(now.getTime() - 50 * 60 * 60 * 1000);

      // Fetch health scores and marketing recommendations using EID as event_id (only if less than 50 hours old)
      const [healthResponse, marketingResponse] = await Promise.all([
        supabase
          .from('ai_analysis_cache')
          .select('*')
          .eq('event_id', eventData.eid)
          .eq('analysis_type', 'health_scores')
          .gte('created_at', fiftyHoursAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('ai_analysis_cache')
          .select('*')
          .eq('event_id', eventData.eid)
          .eq('analysis_type', 'marketing')
          .gte('created_at', fiftyHoursAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);
      
      console.log('Health response:', healthResponse);
      console.log('Health response data:', healthResponse?.data);
      console.log('Marketing response:', marketingResponse);
      console.log('Marketing response data:', marketingResponse?.data);
      
      if (healthResponse.data) {
        setHealthData(healthResponse.data.result);
      }
      
      if (marketingResponse.data) {
        setMarketingRecommendations(marketingResponse.data.result);
      }
    } catch (err) {
      console.error('Error fetching health data:', err);
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchArtistData = async (retryCount = 0, eventData = null) => {
    if (!eventId) return;
    
    try {
      setArtistsLoading(true);
      
      // Use passed event data or fall back to state
      const currentEvent = eventData || event;
      
      // Wait for event data to be available if this is a retry
      if (retryCount > 0 && !currentEvent?.eid) {
        console.log('Waiting for event data before fetching artists...');
        await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
      }
      
      if (!currentEvent?.eid) {
        throw new Error('Event EID not available');
      }
      
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // First, get the basic workflow data quickly and show it immediately
      const workflowResponse = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-workflow`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({ eventEid: currentEvent.eid })
      });

      if (!workflowResponse.ok) {
        const errorData = await workflowResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${workflowResponse.status}`);
      }

      const { data: artistWorkflowData } = await workflowResponse.json();
      
      // Show basic workflow data immediately (artist numbers visible, but no profile details yet)
      const basicMerge = (dataArray) => dataArray?.map(item => ({ 
        ...item, 
        artist_profiles: { name: `Artist #${item.artist_number}` } // Temporary placeholder
      })) || [];
      
      setArtistApplications(basicMerge(artistWorkflowData.applications));
      setArtistInvites(basicMerge(artistWorkflowData.invitations));
      setArtistConfirmations(basicMerge(artistWorkflowData.confirmations));
      
      // Get all unique artist numbers for profile lookup
      const allArtistNumbers = new Set();
      [artistWorkflowData.applications, artistWorkflowData.invitations, artistWorkflowData.confirmations].forEach(dataArray => {
        dataArray?.forEach(item => {
          if (item.artist_number) {
            allArtistNumbers.add(item.artist_number);
          }
        });
      });

      // Now fetch profiles and performance data in parallel (don't block the UI)
      if (allArtistNumbers.size > 0) {
        const [profilesResult, performanceResult] = await Promise.allSettled([
          // Fetch artist profiles
          fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-profiles`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
            },
            body: JSON.stringify({ artistNumbers: Array.from(allArtistNumbers) })
          }).then(async (res) => {
            if (res.ok) {
              const { data } = await res.json();
              return data.profiles || {};
            }
            return {};
          }),
          
          // Get performance data (we need profiles first, so this runs after profiles resolve)
          fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-profiles`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',  
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
            },
            body: JSON.stringify({ artistNumbers: Array.from(allArtistNumbers) })
          }).then(async (res) => {
            if (res.ok) {
              const { data } = await res.json();
              const profiles = data.profiles || {};
              const artistIds = Object.values(profiles)
                .map(profile => profile.entry_id)
                .filter(Boolean);
              
              if (artistIds.length > 0) {
                return getArtistPerformanceData(artistIds);
              }
            }
            return {};
          })
        ]);

        // Process results when they complete
        let artistProfiles = {};
        if (profilesResult.status === 'fulfilled') {
          artistProfiles = profilesResult.value;
        } else {
          console.error('Error fetching artist profiles:', profilesResult.reason);
        }

        if (performanceResult.status === 'fulfilled') {
          const performanceData = performanceResult.value;
          const performanceMap = new Map();
          Object.entries(performanceData).forEach(([artistId, data]) => {
            performanceMap.set(artistId, data);
          });
          setArtistPerformanceData(performanceMap);
        } else {
          console.error('Error loading artist performance data:', performanceResult.reason);
        }

        // Update workflow data with full profile information
        const mergeProfileData = (items) => {
          return items?.map(item => ({
            ...item,
            artist_profiles: artistProfiles[item.artist_number] || {}
          })) || [];
        };
        
        setArtistApplications(mergeProfileData(artistWorkflowData.applications));
        setArtistInvites(mergeProfileData(artistWorkflowData.invitations));
        setArtistConfirmations(mergeProfileData(artistWorkflowData.confirmations));
      }
      
    } catch (err) {
      console.error('Error fetching artist data:', err);
      
      // Auto-retry up to 3 times with increasing delays
      if (retryCount < 3) {
        console.log(`Retrying artist data fetch (attempt ${retryCount + 1}/3)...`);
        setArtistsLoading(false);
        setTimeout(() => fetchArtistData(retryCount + 1, eventData), 1000 * (retryCount + 1));
        return;
      }
      
      // If all retries failed, show empty state
      setArtistApplications([]);
      setArtistInvites([]);
      setArtistConfirmations([]);
    } finally {
      setArtistsLoading(false);
    }
  };

  const fetchArtistPayments = async () => {
    if (!event?.id || !event?.eid) return;

    setArtistPaymentsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-event-artist-payments', {
        body: { event_eid: event.eid }
      });

      if (error) {
        console.error('Error fetching artist payments:', error);
        throw error;
      }

      // Set the artist payment data from the new endpoint
      setArtistPaymentsData(data.artists || []);
    } catch (err) {
      console.error('Error fetching artist payments:', err);
    } finally {
      setArtistPaymentsLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    // Validate and clean the currency code
    let cleanCurrency = currency;

    if (!cleanCurrency || typeof cleanCurrency !== 'string') {
      cleanCurrency = 'USD';
    }

    // Remove any extra whitespace and convert to uppercase
    cleanCurrency = cleanCurrency.trim().toUpperCase();

    // Try to format with the provided currency
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cleanCurrency
      }).format(amount);
    } catch (e) {
      // If currency is invalid, fall back to USD
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount);
    }
  };

  const openArtistPaymentDetail = async (artist) => {
    // Set the selected artist for payment details
    setSelectedArtistForPayment(artist);
    setStripeDetails(null);
    setAccountLedger(null);
    setManualPaymentRequest(null);
    setLastEventInfo(null);
    setRevealedPaymentDetails(false);
    setLoadingStripe(false);
    setLoadingLedger(true);
    setLoadingManualPaymentRequest(true);
    setLoadingLastEvent(true);

    // Open modal with loading state
    setShowArtistDetail(true);

    try {
      // Fetch Stripe details, account ledger, manual payment request, and last event in parallel
      const promises = [];

      // Fetch Stripe details if account exists
      if (artist.stripe_recipient_id) {
        promises.push(fetchStripeDetails(artist.stripe_recipient_id, artist.artist_id));
      }

      // Always fetch account ledger
      promises.push(fetchArtistAccountLedger(false, artist.artist_id));

      // Always fetch manual payment request
      promises.push(fetchManualPaymentRequest(artist.artist_id));

      // Always fetch last event info
      promises.push(fetchLastEventInfo(artist.entry_id));

      // Wait for all data to load
      await Promise.all(promises);
    } catch (error) {
      console.error('Error loading artist details:', error);
      setError('Failed to load artist details: ' + error.message);
    }
  };

  const fetchLastEventInfo = async (entryId) => {
    if (!entryId) {
      console.error('No entry ID available for last event fetch');
      setLoadingLastEvent(false);
      return;
    }

    try {
      setLoadingLastEvent(true);

      const { data, error } = await supabase.rpc('get_artist_last_event', {
        p_entry_id: entryId
      });

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        setLastEventInfo(data[0]);
      }
    } catch (err) {
      console.error('Failed to load last event info:', err);
      // Don't set error - this is optional data
    } finally {
      setLoadingLastEvent(false);
    }
  };

  const fetchStripeDetails = async (stripeAccountId, artistProfileId) => {
    try {
      setLoadingStripe(true);

      const { data, error } = await supabase.functions.invoke('stripe-account-details', {
        body: {
          stripe_account_id: stripeAccountId,
          artist_profile_id: artistProfileId
        }
      });

      if (error) throw error;

      setStripeDetails(data.account_details);
    } catch (err) {
      console.error('Failed to fetch Stripe details:', err);
    } finally {
      setLoadingStripe(false);
    }
  };

  const fetchArtistAccountLedger = async (includeZeroEntry = false, artistProfileId = null) => {
    const profileId = artistProfileId || selectedArtistForPayment?.artist_id;

    if (!profileId) {
      console.error('No artist profile ID available for ledger fetch');
      return;
    }

    try {
      setLoadingLedger(true);

      const { data, error } = await supabase.functions.invoke('artist-account-ledger', {
        body: {
          artist_profile_id: profileId,
          include_zero_entry: includeZeroEntry
        }
      });

      if (error) throw error;

      setAccountLedger(data);
    } catch (err) {
      console.error('Failed to load account ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  const fetchManualPaymentRequest = async (artistProfileId) => {
    if (!artistProfileId) {
      console.error('No artist profile ID available for manual payment request fetch');
      return;
    }

    try {
      setLoadingManualPaymentRequest(true);

      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-get-manual-payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI1NDI0ODQsImV4cCI6MjAzODExODQ4NH0.x6JzxElYCf9lpkpc3RYX2XOQQ-v8QLPQOHWOzLj0a3M'
        },
        body: JSON.stringify({
          artist_profile_id: artistProfileId,
          reveal_details: false
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch manual payment request');
      }

      if (result.has_request) {
        setManualPaymentRequest(result);
      }
    } catch (err) {
      console.error('Failed to load manual payment request:', err);
      // Don't set error - this is optional data
    } finally {
      setLoadingManualPaymentRequest(false);
    }
  };

  const revealPaymentDetails = async () => {
    if (!selectedArtistForPayment?.artist_id) return;

    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-get-manual-payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI1NDI0ODQsImV4cCI6MjAzODExODQ4NH0.x6JzxElYCf9lpkpc3RYX2XOQQ-v8QLPQOHWOzLj0a3M'
        },
        body: JSON.stringify({
          artist_profile_id: selectedArtistForPayment.artist_id,
          reveal_details: true
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reveal payment details');
      }

      setManualPaymentRequest(result);
      setRevealedPaymentDetails(true);
    } catch (err) {
      console.error('Failed to reveal payment details:', err);
      setError('Failed to reveal payment details: ' + err.message);
    }
  };

  const toggleManualPaymentOverride = async (artistProfileId, newValue) => {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-toggle-manual-payment-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjI1NDI0ODQsImV4cCI6MjAzODExODQ4NH0.x6JzxElYCf9lpkpc3RYX2XOQQ-v8QLPQOHWOzLj0a3M'
        },
        body: JSON.stringify({
          artist_profile_id: artistProfileId,
          enable: newValue
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to toggle manual payment override');
      }

      // Update local state
      setSelectedArtistForPayment(prev => ({
        ...prev,
        manual_payment_override: newValue
      }));

      alert(`Manual payment override ${newValue ? 'enabled' : 'disabled'} successfully!`);
    } catch (err) {
      console.error('Failed to toggle manual payment override:', err);
      setError('Failed to update override setting: ' + err.message);
    }
  };

  const handleManualPayment = async () => {
    try {
      setSubmittingManualPayment(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const createdBy = user?.email || 'admin@artbattle.com';
      const paymentAmount = parseFloat(manualPaymentAmount);

      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        throw new Error('Invalid payment amount');
      }

      const { data, error } = await supabase
        .from('artist_payments')
        .insert({
          artist_profile_id: selectedArtistForPayment.artist_id,
          gross_amount: paymentAmount,
          net_amount: paymentAmount,
          platform_fee: 0.00,
          stripe_fee: 0.00,
          currency: artistPaymentsData[0]?.totals?.primary_currency || 'USD',
          description: manualPaymentNotes || 'Manual payment recorded via admin panel',
          payment_method: manualPaymentMethod,
          reference: null,
          status: 'paid',
          payment_type: 'manual',
          created_by: createdBy,
          metadata: {
            created_via: 'admin_panel',
            created_at: new Date().toISOString(),
            admin_user: createdBy,
            event_id: event.id,
            event_eid: event.eid
          }
        });

      if (error) throw error;

      // Close manual payment modal
      setShowManualPayment(false);
      setManualPaymentAmount('');
      setManualPaymentNotes('');
      setManualPaymentMethod('bank_transfer');

      // Refresh ledger
      await fetchArtistAccountLedger(false, selectedArtistForPayment.artist_id);

      // Refresh artist payments list
      await fetchArtistPayments();
    } catch (err) {
      console.error('Failed to create manual payment:', err);
      setError('Failed to create manual payment: ' + err.message);
    } finally {
      setSubmittingManualPayment(false);
    }
  };

  const fetchPostEventData = async () => {
    if (!event?.id) return;

    setPostEventLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-event-post-summary', {
        body: { event_id: event.id }
      });

      if (error) {
        // Try to parse debug info from error
        if (error.context) {
          try {
            const responseText = await error.context.text();
            console.log('Edge function error response:', responseText);
            const parsed = JSON.parse(responseText);
            if (parsed.debug) {
              console.log('Edge function debug info:', parsed.debug);
            }
          } catch (e) {
            console.log('Could not parse error response:', e);
          }
        }
        throw error;
      }
      setPostEventData(data);
    } catch (err) {
      console.error('Error fetching post-event data:', err);
    } finally {
      setPostEventLoading(false);
    }
  };

  const fetchMetaAdsData = async () => {
    if (!event?.eid) return;

    setMetaAdsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(`meta-ads-report/${event.eid}`);

      if (error) {
        console.error('Error fetching Meta ads data:', error);
        setMetaAdsData(null);
        return;
      }

      setMetaAdsData(data);
    } catch (err) {
      console.error('Error fetching Meta ads data:', err);
      setMetaAdsData(null);
    } finally {
      setMetaAdsLoading(false);
    }
  };

  const getArtistPerformanceData = async (artistIds) => {
    try {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call the analytics edge function
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-artist-analytics`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({ 
          action: 'get_artist_performance',
          artistIds: Array.isArray(artistIds) ? artistIds : [artistIds]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const { performanceData } = await response.json();
      return performanceData;
    } catch (err) {
      console.error('Error fetching artist performance:', err);
      return {};
    }
  };

  const formatTimeSince = (date) => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMinutes > 0) return `${diffMinutes}m ago`;
    if (diffSeconds > 0) return `${diffSeconds}s ago`;
    return 'Just now';
  };

  const getInvitationStatus = (invite) => {
    if (!invite.first_viewed_at) {
      return { 
        status: 'not-viewed', 
        color: 'gray', 
        text: 'Not viewed',
        icon: <EyeNoneIcon size={14} />
      };
    }
    
    if (invite.view_count === 1) {
      return { 
        status: 'viewed-once', 
        color: 'blue', 
        text: `Viewed ${formatTimeSince(invite.last_viewed_at)}`,
        icon: <ViewedIcon size={14} />
      };
    }
    
    if (invite.view_count > 1) {
      return { 
        status: 'engaged', 
        color: 'green', 
        text: `Viewed ${invite.view_count}x, last: ${formatTimeSince(invite.last_viewed_at)}`,
        icon: <ViewedIcon size={14} />
      };
    }
    
    return { 
      status: 'unknown', 
      color: 'gray', 
      text: 'Unknown',
      icon: <DotFilledIcon size={14} />
    };
  };

  const handleImageClick = (work) => {
    setSelectedImage(work);
    setImageModalOpen(true);
  };

  // Deduplication logic for artist workflow
  const getConfirmedArtistNumbers = () => {
    return new Set(artistConfirmations.map(confirmation => confirmation.artist_number).filter(Boolean));
  };

  const getInvitedArtistNumbers = () => {
    return new Set(artistInvites.map(invite => invite.artist_number).filter(Boolean));
  };

  const getFilteredApplications = () => {
    // First deduplicate within applications by artist_number (keep most recent)
    const deduplicatedApps = artistApplications.reduce((acc, app) => {
      if (!app.artist_number) return [...acc, app];
      const existingIndex = acc.findIndex(existing => existing.artist_number === app.artist_number);
      if (existingIndex === -1) {
        return [...acc, app];
      } else {
        const existing = acc[existingIndex];
        const isMoreRecent = app.created_at > existing.created_at || (!app.created_at && !existing.created_at && app.id > existing.id);
        if (isMoreRecent) {
          acc[existingIndex] = app;
        }
        return acc;
      }
    }, []);

    const filteredApps = showAllArtists ? deduplicatedApps :
      (() => {
        const confirmedNumbers = getConfirmedArtistNumbers();
        const invitedNumbers = getInvitedArtistNumbers();
        return deduplicatedApps.filter(app =>
          !confirmedNumbers.has(app.artist_number) &&
          !invitedNumbers.has(app.artist_number)
        );
      })();

    // Sort by newest first
    return sortByNewestFirst(filteredApps, 'created_at');
  };

  const getFilteredInvitations = () => {
    // First deduplicate within invitations by artist_number (keep most recent)
    const deduplicatedInvites = artistInvites.reduce((acc, invite) => {
      if (!invite.artist_number) return [...acc, invite];
      const existingIndex = acc.findIndex(existing => existing.artist_number === invite.artist_number);
      if (existingIndex === -1) {
        return [...acc, invite];
      } else {
        const existing = acc[existingIndex];
        const isMoreRecent = invite.created_at > existing.created_at || (!invite.created_at && !existing.created_at && invite.id > existing.id);
        if (isMoreRecent) {
          acc[existingIndex] = invite;
        }
        return acc;
      }
    }, []);

    const filteredInvites = showAllArtists ? deduplicatedInvites :
      (() => {
        const confirmedNumbers = getConfirmedArtistNumbers();
        return deduplicatedInvites.filter(invite =>
          !confirmedNumbers.has(invite.artist_number)
        );
      })();

    // Sort by newest first
    return sortByNewestFirst(filteredInvites, 'created_at');
  };

  const getFilteredConfirmations = () => {
    // Simple deduplicate confirmations by artist_number (keep most recent)
    const deduplicatedConfirmations = artistConfirmations.reduce((acc, confirmation) => {
      if (!confirmation.artist_number) return [...acc, confirmation];
      const existingIndex = acc.findIndex(existing => existing.artist_number === confirmation.artist_number);
      if (existingIndex === -1) {
        return [...acc, confirmation];
      } else {
        const existing = acc[existingIndex];
        const isMoreRecent = confirmation.created_at > existing.created_at || (!confirmation.created_at && !existing.created_at && confirmation.id > existing.id);
        if (isMoreRecent) {
          acc[existingIndex] = confirmation;
        }
        return acc;
      }
    }, []);

    // Sort by newest first
    return sortByNewestFirst(deduplicatedConfirmations, 'created_at');
  };

  const saveBio = async () => {
    if (!selectedArtist?.artist_profiles?.id) {
      console.error('No artist profile ID available for bio save');
      return;
    }

    setBioSaving(true);
    try {
      // TODO: Convert to edge function to avoid RLS timeout
      // For now, show error message
      throw new Error('Bio update temporarily disabled - please contact developer to enable edge function');

      // Update the selected artist in state
      setSelectedArtist(prev => ({
        ...prev,
        artist_profiles: {
          ...prev.artist_profiles,
          abhq_bio: bioText
        }
      }));

      // Update the artist in all relevant lists
      const updateArtistInList = (list, setList) => {
        setList(prev => prev.map(artist => 
          artist.artist_number === selectedArtist.artist_number 
            ? {
                ...artist,
                artist_profiles: {
                  ...artist.artist_profiles,
                  abhq_bio: bioText
                }
              }
            : artist
        ));
      };

      updateArtistInList(artistApplications, setArtistApplications);
      updateArtistInList(artistInvites, setArtistInvites);
      updateArtistInList(artistConfirmations, setArtistConfirmations);

      setEditingBio(false);
      console.log('Bio saved successfully');
    } catch (error) {
      console.error('Error saving bio:', error);
      alert('Error saving bio. Please try again.');
    } finally {
      setBioSaving(false);
    }
  };

  const cancelBioEdit = () => {
    setBioText(selectedArtist?.artist_profiles?.abhq_bio || '');
    setEditingBio(false);
  };

  const fetchSampleWorks = async (artistNumber) => {
    if (!artistNumber) return;

    try {
      setSampleWorksLoading(true);

      // Use edge function to avoid RLS timeout
      const { data, error } = await supabase.functions.invoke('admin-get-sample-works', {
        body: {
          artist_number: artistNumber
        }
      });

      if (error) {
        console.error('Error fetching sample works:', error);
        setSampleWorks([]);
      } else if (data?.success) {
        setSampleWorks(data.sample_works || []);
      } else {
        console.error('Sample works fetch failed:', data);
        setSampleWorks([]);
      }
    } catch (err) {
      console.error('Error fetching sample works:', err);
      setSampleWorks([]);
    } finally {
      setSampleWorksLoading(false);
    }
  };

  // Artwork Modal Functions (for viewing bidders and sending reminders/offers)
  const fetchArtworkBids = async (artworkId) => {
    try {
      setLoadingArtworkBids(true);

      // Fetch bids with bidder data (people table join)
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select(`
          id,
          amount,
          created_at,
          people:person_id (
            id,
            first_name,
            last_name,
            name,
            nickname,
            email,
            phone,
            phone_number,
            auth_phone
          )
        `)
        .eq('art_id', artworkId)
        .order('amount', { ascending: false });

      if (bidsError) {
        console.error('Error fetching bids:', bidsError);
        setArtworkBids([]);
        return;
      }

      // Format the bids data to match broadcast pattern
      const formattedBids = (bidsData || []).map(bid => ({
        id: bid.id,
        amount: bid.amount,
        created_at: bid.created_at,
        bidder: bid.people ? {
          id: bid.people.id,
          first_name: bid.people.first_name,
          last_name: bid.people.last_name,
          name: bid.people.name,
          nickname: bid.people.nickname,
          email: bid.people.email,
          phone: bid.people.phone || bid.people.phone_number || bid.people.auth_phone
        } : null
      }));

      setArtworkBids(formattedBids);
    } catch (err) {
      console.error('Error fetching artwork bids:', err);
      setArtworkBids([]);
    } finally {
      setLoadingArtworkBids(false);
    }
  };

  const handleOpenArtworkDetail = async (artwork) => {
    setSelectedArtworkForBids(artwork);
    setShowArtworkDetail(true);
    await fetchArtworkBids(artwork.art_id);
  };

  const handleCreateOffer = async () => {
    if (!showOfferConfirm || !selectedArtworkForBids) return;

    setOfferLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-offer-to-bidder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc2RrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg0MzY4NzYsImV4cCI6MjA0NDAxMjg3Nn0.SRr0cu_CBDs_BNriath2HLu0msxLE3TcIPbxe7s69-8'
        },
        body: JSON.stringify({
          art_id: selectedArtworkForBids.art_id,
          bid_id: showOfferConfirm.bid.id,
          admin_note: `Offer created via admin panel for ${showOfferConfirm.bidder.first_name || 'bidder'}`
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 409) {
          alert('This bidder already has an active offer for this artwork');
        } else if (response.status === 400 && result.error?.includes('winner')) {
          alert('Cannot create offer for the winning bidder. Use payment reminder instead.');
        } else if (result.error?.includes('already paid')) {
          alert('This artwork has already been paid for');
        } else {
          throw new Error(result.error || 'Failed to create offer');
        }
        return;
      }

      // Track active offer with expiration
      setActiveOffers(prev => ({
        ...prev,
        [selectedArtworkForBids.art_id]: {
          expires_at: result.offer.expires_at,
          bidder_name: result.offer.bidder_name,
          bidder_id: result.offer.offered_to_person_id
        }
      }));

      alert(`Offer sent successfully to ${showOfferConfirm.bidder.first_name || 'bidder'}!`);
      setShowOfferConfirm(null);

    } catch (error) {
      console.error('Error creating offer:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setOfferLoading(false);
    }
  };

  const handleSendPaymentReminder = async (artId, bidder) => {
    setPaymentReminderLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-send-payment-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc2RrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg0MzY4NzYsImV4cCI6MjA0NDAxMjg3Nn0.SRr0cu_CBDs_BNriath2HLu0msxLE3TcIPbxe7s69-8'
        },
        body: JSON.stringify({
          art_id: artId,
          admin_note: `Payment reminder sent via admin panel to ${bidder.first_name || bidder.name || 'bidder'}`
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error?.includes('already paid')) {
          alert('This artwork has already been paid for');
        } else if (result.error?.includes('No winning bid')) {
          alert('No winning bid found for this artwork');
        } else {
          throw new Error(result.error || 'Failed to send reminder');
        }
        return;
      }

      // Update timestamp tracking
      setLastReminderSent(prev => ({
        ...prev,
        [artId]: new Date().toISOString()
      }));

      alert(`Payment reminder sent successfully to ${bidder.first_name || bidder.name || 'winner'}!`);

    } catch (error) {
      console.error('Error sending payment reminder:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setPaymentReminderLoading(false);
    }
  };

  const fetchReminderHistory = async (artId) => {
    setArtworkHistoryLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-get-payment-reminder-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc2RrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg0MzY4NzYsImV4cCI6MjA0NDAxMjg3Nn0.SRr0cu_CBDs_BNriath2HLu0msxLE3TcIPbxe7s69-8'
        },
        body: JSON.stringify({ art_id: artId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch reminder history');
      }

      setReminderHistory(result);
      setShowReminderHistory(artId);

    } catch (error) {
      console.error('Error fetching reminder history:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setArtworkHistoryLoading(false);
    }
  };

  const fetchOfferHistory = async (artId) => {
    setArtworkHistoryLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-get-offer-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc2RrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg0MzY4NzYsImV4cCI6MjA0NDAxMjg3Nn0.SRr0cu_CBDs_BNriath2HLu0msxLE3TcIPbxe7s69-8'
        },
        body: JSON.stringify({ art_id: artId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch offer history');
      }

      setOfferHistory(result);
      setShowOfferHistory(artId);

    } catch (error) {
      console.error('Error fetching offer history:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setArtworkHistoryLoading(false);
    }
  };

  const handleSendPaymentInvite = async () => {
    if (!selectedArtistForInvite || !inviteType) {
      alert('Please select an invitation type');
      return;
    }

    setSendingPaymentInvite(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('https://db.artb.art/functions/v1/admin-send-payment-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.data.session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc2RrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg0MzY4NzYsImV4cCI6MjA0NDAxMjg3Nn0.SRr0cu_CBDs_BNriath2HLu0msxLE3TcIPbxe7s69-8'
        },
        body: JSON.stringify({
          artist_id: selectedArtistForInvite.artist_id,
          invite_type: inviteType,
          admin_note: adminNote.trim() || undefined
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      alert(`Payment invitation sent successfully to ${selectedArtistForInvite.artist_name}!`);

      // Close modal and reset
      setShowPaymentInviteModal(false);
      setSelectedArtistForInvite(null);
      setInviteType('email');
      setAdminNote('');

      // Refresh artist data to show updated invitation status
      await fetchArtistData(0);

    } catch (error) {
      console.error('Error sending payment invitation:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setSendingPaymentInvite(false);
    }
  };

  const handleArtistCardClick = async (artist, type) => {
    setSelectedArtist(artist);
    setArtistModalType(type);
    setArtistModalOpen(true);
    setSampleWorks([]); // Clear previous sample works

    // Initialize bio editing state
    setBioText(artist.artist_profiles?.abhq_bio || '');
    setEditingBio(false);
    setBioSaving(false);
    
    // Reset reminder states
    setReminderPhoneUsed(null);
    setSendingReminder(false);
    setReminderSent(false);
    
    // Fetch sample works using artist number
    const artistNumber = artist?.artist_number;
    if (artistNumber) {
      await fetchSampleWorks(artistNumber);
    }
  };

  const getArtistPerformanceDisplay = (artistId) => {
    const performance = artistPerformanceData.get(artistId);
    if (!performance) {
      return { avgAuction: '$0', winRate: '0%', events: '0', isNew: true };
    }

    return {
      avgAuction: performance.avgAuctionValue > 0 ? `$${Math.round(performance.avgAuctionValue)}` : '$0',
      winRate: performance.winRate > 0 ? `${Math.round(performance.winRate)}%` : '0%',
      events: performance.eventsParticipated.toString(),
      isNew: performance.isNewArtist
    };
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'good': return 'green';
      case 'needs-attention': return 'yellow';
      case 'critical': return 'red';
      default: return 'gray';
    }
  };

  const getHealthIcon = (status) => {
    switch (status) {
      case 'good': return <CheckCircledIcon size={16} />;
      case 'needs-attention': return <InfoCircledIcon size={16} />;
      case 'critical': return <ExclamationTriangleIcon size={16} />;
      default: return <ActivityLogIcon size={16} />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'urgent': return 'red';
      case 'important': return 'yellow';
      case 'nice-to-have': return 'blue';
      default: return 'gray';
    }
  };

  const handleActionClick = (action, recommendation = null) => {
    setSelectedRecommendation(recommendation);
    
    switch (action) {
      case 'positive-feedback':
        setFeedbackType('positive');
        setFeedbackModalOpen(true);
        break;
      case 'negative-feedback':
        setFeedbackType('negative');
        setFeedbackModalOpen(true);
        break;
      case 'send-to-event-channel':
        setSlackChannel('event');
        setSlackModalOpen(true);
        break;
      case 'send-to-promo-discuss':
        setSlackChannel('promo-discuss');
        setSlackModalOpen(true);
        break;
      case 'mark-as-done':
        handleMarkAsDone(recommendation);
        break;
    }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText.trim() || !selectedRecommendation) return;
    
    try {
      setSubmittingFeedback(true);
      
      // Submit feedback to the database or API
      const response = await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: selectedRecommendation.id,
          eventId,
          feedbackType,
          feedback: feedbackText,
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        setFeedbackModalOpen(false);
        setFeedbackText('');
        setSelectedRecommendation(null);
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleSlackSubmit = async () => {
    if (!selectedRecommendation) return;
    
    try {
      setSendingToSlack(true);
      
      const slackWebhook = slackChannel === 'event' 
        ? process.env.REACT_APP_SLACK_EVENT_WEBHOOK
        : process.env.REACT_APP_SLACK_PROMO_WEBHOOK;
      
      const message = {
        text: `🎯 AI Recommendation for ${event.name} (${event.eid})`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🎯 AI Recommendation for ${event.name}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Event:* ${event.eid} - ${event.name}\n*Category:* ${selectedRecommendation.category}\n*Priority Score:* ${selectedRecommendation.score}/10\n*Timeline:* ${selectedRecommendation.timeline}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Recommendation:*\n${selectedRecommendation.suggestion}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Reasoning:*\n${selectedRecommendation.reasoning}`
            }
          }
        ]
      };
      
      const response = await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      
      if (response.ok) {
        setSlackModalOpen(false);
        setSelectedRecommendation(null);
      }
    } catch (err) {
      console.error('Error sending to Slack:', err);
    } finally {
      setSendingToSlack(false);
    }
  };

  const handleMarkAsDone = async (recommendation) => {
    try {
      // Update the recommendation as done in the database
      const response = await fetch('/api/mark-recommendation-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: recommendation.id,
          eventId,
          timestamp: new Date().toISOString()
        })
      });
      
      if (response.ok) {
        // Refresh the health data
        await fetchHealthData();
      }
    } catch (err) {
      console.error('Error marking as done:', err);
    }
  };

  const showAdminMessage = (type, text) => {
    setAdminMessage({ type, text });
    setTimeout(() => setAdminMessage(null), 4000);
  };

  const handleSendInvitation = () => {
    setShowInvitationForm(true);
    setInvitationMessage(`Hi! We would love to invite you to participate in ${event?.name || 'our upcoming Art Battle event'}. 

Please let us know if you're interested in joining us for this exciting event. We think you'd be a great addition to our lineup of talented artists!

Looking forward to hearing from you.

Best regards,
The Art Battle Team`);
  };

  const sendInvitation = async () => {
    if (!selectedArtist || !invitationMessage.trim()) {
      showAdminMessage('error', 'Please provide a message for the invitation');
      return;
    }

    try {
      setSendingInvitation(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showAdminMessage('error', 'Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('admin-send-invitation', {
        body: {
          artist_number: selectedArtist.artist_number,
          event_eid: event?.eid,
          message_from_producer: invitationMessage,
          artist_profile_id: selectedArtist.artist_profile_id
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error) {
        console.error('Invitation error:', response.error);
        showAdminMessage('error', `Failed to send invitation: ${response.error.message}`);
        return;
      }

      if (response.data?.error) {
        console.error('Function returned error:', response.data.error);
        showAdminMessage('error', response.data.error);
        return;
      }

      showAdminMessage('success', response.data?.message || 'Invitation sent successfully!');
      
      // Reset form and close modal after short delay
      setTimeout(() => {
        setShowInvitationForm(false);
        setInvitationMessage('');
        setArtistModalOpen(false);
        // Refresh artist data to show new invitation
        fetchArtistData();
      }, 2000);

    } catch (error) {
      console.error('Error sending invitation:', error);
      
      // Handle FunctionsHttpError and extract meaningful error message
      let errorMessage = 'Failed to send invitation. Please try again.';
      
      if (error && error.message) {
        errorMessage = error.message;
      }
      
      // Try to extract error from the context if it's a FunctionsHttpError
      if (error && error.context) {
        try {
          const errorText = await error.context.text();
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (parseError) {
          console.log('Could not parse error context:', parseError);
        }
      }
      
      showAdminMessage('error', errorMessage);
    } finally {
      setSendingInvitation(false);
    }
  };

  const cancelInvitation = () => {
    setShowInvitationForm(false);
    setInvitationMessage('');
  };

  const handleWithdrawInvitation = async (artist) => {
    if (!artist?.artist_invitations?.[0]?.id) {
      showAdminMessage('error', 'No invitation found to withdraw');
      return;
    }

    const invitationId = artist.artist_invitations[0].id;

    try {
      const { error } = await supabase
        .from('artist_invitations')
        .update({
          status: 'withdrawn',
          withdrawn_at: new Date().toISOString(),
          withdrawn_by: user?.id
        })
        .eq('id', invitationId);

      if (error) {
        console.error('Error withdrawing invitation:', error);
        showAdminMessage('error', 'Failed to withdraw invitation');
      } else {
        showAdminMessage('success', 'Invitation withdrawn successfully - artist will no longer see this invitation');
        // Refresh the applications to update the UI
        await fetchEventApplications();
        // Close the modal
        setSelectedArtist(null);
      }
    } catch (err) {
      console.error('Error withdrawing invitation:', err);
      showAdminMessage('error', 'Failed to withdraw invitation');
    }
  };

  const handleSendReminder = async (artist) => {
    console.log('handleSendReminder clicked! Artist full object:', artist);
    console.log('Artist profiles:', artist?.artist_profiles);
    
    const name = artist?.artist_profiles?.name;
    
    // Direct query to people table removed to avoid RLS timeout
    // Use artist profile phone directly
    let phone = artist?.artist_profiles?.phone_number || artist?.artist_profiles?.phone || artist?.phone_number;
    console.log('Using artist profile phone:', phone);

    // OLD CODE - DISABLED:
    // try {
    //   // Query people table to get auth_phone for this artist
    //   const { data: personData, error: personError } = await supabase
    //     .from('people')
    //     .select('auth_phone, phone')
    //     .eq('artist_number', artist.artist_number)
    //     .single();
    //
    //   if (!personError && personData) {
    //     // Use auth_phone from user account (preferred)
    //     phone = personData.auth_phone || personData.phone;
    //     console.log('Using auth phone from user account:', phone);
    //   } else {
    //     console.log('No person record found, falling back to artist profile phone');
    //     // Fallback to artist profile phone
    //     phone = artist?.artist_profiles?.phone_number || artist?.artist_profiles?.phone || artist?.phone_number;
    //   }
    // } catch (err) {
    //   console.error('Error fetching person auth_phone:', err);
    //   // Fallback to artist profile phone
    //   phone = artist?.artist_profiles?.phone_number || artist?.artist_profiles?.phone || artist?.phone_number;
    // }

    if (!name || !phone) {
      console.error('Missing artist data:', { 
        name: name, 
        phone: phone 
      });
      showAdminMessage('error', 'Artist name or phone number missing');
      return;
    }

    console.log('Setting sending reminder to true');
    setSendingReminder(true);
    setReminderSent(false);

    const message = `${name} - you have been invited to compete at ${event?.eid || event?.event_code || 'AB'} please log in at https://artb.art/profile to accept or decline`;
    
    console.log('Sending SMS reminder to:', phone);
    console.log('Message:', message);
    
    try {
      const { data, error } = await supabase.rpc('send_sms_instantly', {
        p_destination: phone,
        p_message_body: message,
        p_metadata: {
          type: 'invitation_reminder',
          artist_id: artist.artist_profiles.id,
          event_id: eventId
        }
      });

      console.log('SMS RPC result:', { data, error });

      if (error) {
        console.error('Error sending reminder:', error);
        showAdminMessage('error', `Failed to send reminder SMS: ${error.message}`);
      } else {
        console.log('SMS sent successfully, message ID:', data);
        showAdminMessage('success', `Reminder SMS sent to ${phone}`);
        setReminderSent(true);
        setReminderPhoneUsed(phone);
      }
    } catch (err) {
      console.error('Error sending reminder:', err);
      showAdminMessage('error', `Failed to send reminder SMS: ${err.message}`);
    } finally {
      setSendingReminder(false);
    }
  };

  const fetchEventAdmins = async () => {
    if (!eventId) return;

    try {
      setAdminsLoading(true);
      const { data, error } = await supabase
        .from('event_admins')
        .select('*')
        .eq('event_id', eventId)
        .order('admin_level', { ascending: true });

      if (error) throw error;
      setEventAdmins(data || []);
    } catch (err) {
      console.error('Error fetching event admins:', err);
    } finally {
      setAdminsLoading(false);
    }
  };

  const searchPeopleByPhone = async (phoneQuery) => {
    // Direct query to people table removed to avoid RLS timeout
    // People search feature disabled for now
    console.log('People search disabled - direct query removed to prevent RLS timeout');
    setPeopleSearchResults([]);
    return;

    // OLD CODE - DISABLED:
    // if (phoneQuery.length < 3) {
    //   setPeopleSearchResults([]);
    //   return;
    // }
    //
    // try {
    //   const { data, error } = await supabase
    //     .from('people')
    //     .select('id, first_name, last_name, phone, email')
    //     .or(`phone.ilike.%${phoneQuery}%,first_name.ilike.%${phoneQuery}%,last_name.ilike.%${phoneQuery}%`)
    //     .limit(5);
    //
    //   if (error) throw error;
    //   setPeopleSearchResults(data || []);
    // } catch (err) {
    //   console.error('Error searching people:', err);
    //   setPeopleSearchResults([]);
    // }
  };

  // Real-time phone validation as user types
  const validatePhoneInput = (phoneInput) => {
    if (!phoneInput.trim()) {
      setPhoneValidationError(null);
      setValidatedPhone(null);
      return;
    }

    try {
      if (isValidPhoneNumber(phoneInput)) {
        const phoneNumber = parsePhoneNumber(phoneInput);
        const normalized = phoneNumber.format('E.164');
        setValidatedPhone(normalized);
        setPhoneValidationError(null);
      } else {
        setPhoneValidationError('Invalid phone number format');
        setValidatedPhone(null);
      }
    } catch (error) {
      setPhoneValidationError('Please include country code (e.g., +1, +7, +44)');
      setValidatedPhone(null);
    }
  };

  const addEventAdmin = async () => {
    if (!adminPhoneSearch) {
      showAdminMessage('error', 'Please enter a phone number');
      return;
    }
    
    // Validate and normalize phone number to E.164 format
    const inputPhone = adminPhoneSearch.trim();
    let normalizedPhone;
    
    try {
      // Try to parse the phone number
      if (!isValidPhoneNumber(inputPhone)) {
        setPhoneValidationError('Please enter a valid phone number');
        showAdminMessage('error', 'Please enter a valid phone number');
        return;
      }
      
      // Parse and format to E.164
      const phoneNumber = parsePhoneNumber(inputPhone);
      normalizedPhone = phoneNumber.format('E.164');
      setValidatedPhone(normalizedPhone);
      setPhoneValidationError(null);
      
    } catch (parseError) {
      console.error('Phone parsing error:', parseError);
      setPhoneValidationError('Please enter a valid phone number with country code');
      showAdminMessage('error', 'Please enter a valid phone number with country code (e.g., +1234567890)');
      return;
    }
    
    try {
      // Check if admin already exists (check both formats for safety)
      const { data: existing } = await supabase
        .from('event_admins')
        .select('id')
        .eq('event_id', eventId)
        .or(`phone.eq.${normalizedPhone},phone.eq.${inputPhone}`)
        .single();
      
      if (existing) {
        showAdminMessage('error', 'This phone number is already an admin for this event');
        return;
      }
      
      // Add new admin with normalized E.164 format
      const { error } = await supabase
        .from('event_admins')
        .insert({
          event_id: eventId,
          phone: normalizedPhone,
          admin_level: selectedAdminLevel
        });
      
      if (error) throw error;
      
      showAdminMessage('success', `Successfully added ${normalizedPhone} as ${selectedAdminLevel} admin`);
      setAdminPhoneSearch('');
      setPeopleSearchResults([]);
      setPhoneValidationError(null);
      setValidatedPhone(null);
      await fetchEventAdmins();
      
    } catch (error) {
      console.error('Error adding admin:', error);
      showAdminMessage('error', 'Failed to add admin: ' + error.message);
    }
  };

  const removeEventAdmin = async (adminId) => {
    try {
      const { error } = await supabase
        .from('event_admins')
        .delete()
        .eq('id', adminId);
      
      if (error) throw error;
      
      showAdminMessage('success', 'Admin removed successfully');
      await fetchEventAdmins();
      
    } catch (error) {
      console.error('Error removing admin:', error);
      showAdminMessage('error', 'Failed to remove admin: ' + error.message);
    }
  };

  const handleEventDeleted = (deletedEvent, result) => {
    console.log('Event deleted:', deletedEvent.eid, 'Result:', result);
    setDeleteModalOpen(false);
    // Navigate back to events list
    navigate('/events');
  };

  const fetchPersonHistory = async (person) => {
    try {
      setHistoryLoading(true);
      setSelectedPerson(person);
      setDialogOpen(true);

      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Call the edge function with service role access
      const response = await fetch(`https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/admin-person-history`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzcWRrdWJneXF3cHl2Zmx0bnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0MjE2OTYsImV4cCI6MjA2ODk5NzY5Nn0.hY8v8IDZQTcdAFa_OvQNFd1CyvabGcOZZMn_J6c4c2U'
        },
        body: JSON.stringify({ personId: person.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const { data: personHistoryData } = await response.json();
      setPersonHistory(personHistoryData);

      // Load RFM score for this person if not already loaded
      if (!rfmScores.has(person.id)) {
        try {
          const rfmScore = await getRFMScore(person.id);
          setRfmScores(prev => new Map(prev.set(person.id, rfmScore)));
        } catch (err) {
          console.error('Error loading RFM score for person:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching person history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" justify="center" style={{ height: '200px' }}>
          <Spinner size="3" />
        </Flex>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="4">
        <Card>
          <Box p="4">
            <Text color="red">Error: {error}</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  if (!event) {
    return (
      <Box p="4">
        <Card>
          <Box p="4">
            <Text>Event not found</Text>
          </Box>
        </Card>
      </Box>
    );
  }

  const getEventStatus = () => {
    if (!event.enabled) return { color: 'red', label: 'Disabled' };
    
    const now = new Date();
    const startTime = new Date(event.event_start_datetime);
    const endTime = new Date(event.event_end_datetime);
    
    if (now < startTime) return { color: 'blue', label: 'Upcoming' };
    if (now > endTime) return { color: 'gray', label: 'Completed' };
    return { color: 'green', label: 'Active' };
  };

  const status = getEventStatus();

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        {/* Header */}
        <Flex justify="between" align="start">
          <Box>
            <Flex align="center" gap="3" mb="2">
              <Heading size="6">
                <DebugField 
                  value={event.name} 
                  fieldName="event.name"
                  fallback="Unnamed Event"
                />
              </Heading>
              <Badge color={status.color}>{status.label}</Badge>
            </Flex>
            <Text color="gray" size="2">
              <DebugField
                value={event.eid}
                fieldName="event.eid"
                fallback="No EID"
              />
              {' • '}
              <DebugField
                value={event.venue}
                fieldName="event.venue"
                fallback="No venue"
              />
              {event.slack_channel && (
                <>
                  {' • '}
                  <Text color="blue" weight="medium">
                    #{event.slack_channel.replace(/^#/, '')}
                  </Text>
                </>
              )}
            </Text>
          </Box>
          <Flex gap="2">
            <Button onClick={() => navigate(`/events/create?edit=${eventId}`)}>
              Edit Event
            </Button>
            {isSuperAdmin && (
              <Button
                color="red"
                variant="soft"
                onClick={() => setDeleteModalOpen(true)}
              >
                <TrashIcon />
                Delete Event
              </Button>
            )}
          </Flex>
        </Flex>

        {/* Post-Event Summary - Collapsible (only show if event is in the past) */}
        {status.label === 'Completed' && (
          <Card>
            <Box p="3">
              <Flex justify="between" align="center" style={{ cursor: 'pointer' }} onClick={() => setPostEventCollapsed(!postEventCollapsed)}>
                <Heading size="4">Post-Event Summary</Heading>
                <IconButton size="1" variant="ghost">
                  {postEventCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
                </IconButton>
              </Flex>
            </Box>
            {!postEventCollapsed && (
              <Box p="3" pt="0">
                {postEventLoading ? (
                  <Flex align="center" justify="center" p="4">
                    <Spinner size="3" />
                  </Flex>
                ) : (
                  <>
                    {/* Ticket Sales Row */}
                    <Card>
                      <Box p="3">
                        <Flex justify="between" align="center" mb="3">
                          <Text size="2" weight="medium">
                            Ticket Sales
                          </Text>
                          {postEventData?.ticket_sales?.data_source && (
                            <Badge size="1" color={postEventData.ticket_sales.data_source.includes('API') ? 'green' : 'yellow'}>
                              {postEventData.ticket_sales.data_source}
                            </Badge>
                          )}
                        </Flex>

                        {/* Eventbrite Event Verification */}
                        {postEventData?.ticket_sales?.eventbrite_event_name && (
                          <Box mb="3" p="2" style={{ backgroundColor: 'var(--blue-2)', borderRadius: '6px' }}>
                            <Text size="1" color="blue" style={{ display: 'block' }}>
                              <strong>Eventbrite Event:</strong> {postEventData.ticket_sales.eventbrite_event_name}
                              {postEventData.ticket_sales.currency_code && (
                                <Badge size="1" ml="2" color="blue">{postEventData.ticket_sales.currency_code}</Badge>
                              )}
                            </Text>
                            {postEventData.ticket_sales.eventbrite_start_date && (
                              <Text size="1" color="gray" style={{ display: 'block', marginTop: '0.25rem' }}>
                                {new Date(postEventData.ticket_sales.eventbrite_start_date).toLocaleDateString('en-US', {
                                  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </Text>
                            )}
                          </Box>
                        )}

                        {postEventData?.ticket_sales ? (
                          <>
                            <Grid columns="4" gap="3" mb="3">
                              <Box>
                                <Text size="1" color="gray" style={{ display: 'block' }}>Tickets Sold</Text>
                                <Text size="4" weight="bold">
                                  {postEventData.ticket_sales.total_sold || 0}
                                  {postEventData.ticket_sales.total_capacity > 0 && (
                                    <Text size="2" color="gray"> / {postEventData.ticket_sales.total_capacity}</Text>
                                  )}
                                </Text>
                                {postEventData.ticket_sales.percentage_sold && (
                                  <Text size="1" color="gray">{postEventData.ticket_sales.percentage_sold}% sold</Text>
                                )}
                              </Box>
                              <Box>
                                <Text size="1" color="gray" style={{ display: 'block' }}>Gross Revenue</Text>
                                <Text size="4" weight="bold" color="green">
                                  {postEventData.ticket_sales.currency_symbol || postEventData.auction_summary?.currency_symbol || '$'}
                                  {postEventData.ticket_sales.gross_revenue?.toFixed(2) || postEventData.ticket_sales.total_revenue?.toFixed(2) || '0.00'}
                                </Text>
                              </Box>
                              <Box>
                                <Text size="1" color="gray" style={{ display: 'block' }}>Total Fees</Text>
                                <Text size="4" weight="bold" color="red">
                                  {postEventData.ticket_sales.currency_symbol || postEventData.auction_summary?.currency_symbol || '$'}
                                  {postEventData.ticket_sales.total_fees?.toFixed(2) || '0.00'}
                                </Text>
                                {postEventData.ticket_sales.eventbrite_fees > 0 && (
                                  <Text size="1" color="gray">
                                    EB: {postEventData.ticket_sales.currency_symbol}{postEventData.ticket_sales.eventbrite_fees.toFixed(2)}
                                  </Text>
                                )}
                              </Box>
                              <Box>
                                <Text size="1" color="gray" style={{ display: 'block' }}>Net Deposit</Text>
                                <Text size="4" weight="bold" color="blue">
                                  {postEventData.ticket_sales.currency_symbol || postEventData.auction_summary?.currency_symbol || '$'}
                                  {postEventData.ticket_sales.net_deposit?.toFixed(2) || '0.00'}
                                </Text>
                                {postEventData.ticket_sales.average_net_per_ticket && (
                                  <Text size="1" color="gray">
                                    Avg: {postEventData.ticket_sales.currency_symbol}{postEventData.ticket_sales.average_net_per_ticket}/ticket
                                  </Text>
                                )}
                              </Box>
                            </Grid>

                            {postEventData.ticket_sales.data_quality_score && (
                              <Flex gap="2" align="center" mt="2">
                                <Text size="1" color="gray">
                                  Quality: {postEventData.ticket_sales.data_quality_score}/100
                                </Text>
                                {postEventData.ticket_sales.cache_age_hours && (
                                  <Text size="1" color="gray">
                                    • Cache: {parseFloat(postEventData.ticket_sales.cache_age_hours).toFixed(1)}h old
                                  </Text>
                                )}
                              </Flex>
                            )}
                          </>
                        ) : (
                          <Grid columns="4" gap="3">
                            <Box>
                              <Text size="1" color="gray" style={{ display: 'block' }}>Total Sold</Text>
                              <Text size="4" weight="bold">--</Text>
                            </Box>
                            <Box>
                              <Text size="1" color="gray" style={{ display: 'block' }}>Total Revenue</Text>
                              <Text size="4" weight="bold" color="green">--</Text>
                            </Box>
                            <Box>
                              <Text size="1" color="gray" style={{ display: 'block' }}>Fees</Text>
                              <Text size="4" weight="bold">--</Text>
                            </Box>
                            <Box>
                              <Text size="1" color="gray" style={{ display: 'block' }}>Net Deposit</Text>
                              <Text size="4" weight="bold">--</Text>
                            </Box>
                          </Grid>
                        )}

                        {/* Collected by Producer */}
                        <Separator my="3" />
                        <Box>
                          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                            Collected by Producer
                          </Text>
                          <Grid columns="3" gap="4">
                            {/* Tickets Sold */}
                            <Box>
                              <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                                Tickets Sold
                              </Text>
                              {editingProducerTickets ? (
                                <Flex direction="column" gap="2">
                                  <Flex gap="2">
                                    <Select.Root
                                      value={producerTicketsCurrency}
                                      onValueChange={setProducerTicketsCurrency}
                                    >
                                      <Select.Trigger style={{ width: '80px' }} />
                                      <Select.Content>
                                        <Select.Item value="USD">USD</Select.Item>
                                        <Select.Item value="CAD">CAD</Select.Item>
                                        <Select.Item value="EUR">EUR</Select.Item>
                                        <Select.Item value="GBP">GBP</Select.Item>
                                        <Select.Item value="AUD">AUD</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                    <TextField.Root
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={producerTicketsValue}
                                      onChange={(e) => setProducerTicketsValue(e.target.value)}
                                      style={{ width: '120px' }}
                                    />
                                  </Flex>
                                  <Flex gap="2">
                                    <Button
                                      size="1"
                                      onClick={updateProducerTickets}
                                      disabled={updatingProducerTickets}
                                    >
                                      {updatingProducerTickets ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="gray"
                                      onClick={() => {
                                        setEditingProducerTickets(false);
                                        setProducerTicketsValue('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </Flex>
                                </Flex>
                              ) : (
                                <Flex align="center" gap="2">
                                  <Button
                                    size="1"
                                    variant="soft"
                                    onClick={() => {
                                      setEditingProducerTickets(true);
                                      setProducerTicketsValue(event.producer_tickets_sold || '0');
                                      setProducerTicketsCurrency(event.producer_tickets_currency || event.cities?.countries?.currency_code || event.currency || 'USD');
                                    }}
                                  >
                                    SET
                                  </Button>
                                  <Flex direction="column" gap="1">
                                    <Text size="3" weight="bold">
                                      {event.producer_tickets_currency || event.currency || '$'}{(event.producer_tickets_sold || 0).toFixed(2)}
                                    </Text>
                                    {event.producer_tickets_updated_by && (
                                      <Text size="1" color="gray">
                                        Confirmed by {event.producer_tickets_updated_by}
                                        {event.producer_tickets_updated_at && (
                                          <>
                                            <br />
                                            on {new Date(event.producer_tickets_updated_at).toLocaleString()}
                                          </>
                                        )}
                                      </Text>
                                    )}
                                  </Flex>
                                </Flex>
                              )}
                            </Box>

                            {/* Food & Beverage */}
                            <Box>
                              <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                                Food & Beverage
                              </Text>
                              {editingFoodBeverage ? (
                                <Flex direction="column" gap="2">
                                  <Flex gap="2">
                                    <Select.Root
                                      value={foodBeverageCurrency}
                                      onValueChange={setFoodBeverageCurrency}
                                    >
                                      <Select.Trigger style={{ width: '80px' }} />
                                      <Select.Content>
                                        <Select.Item value="USD">USD</Select.Item>
                                        <Select.Item value="CAD">CAD</Select.Item>
                                        <Select.Item value="EUR">EUR</Select.Item>
                                        <Select.Item value="GBP">GBP</Select.Item>
                                        <Select.Item value="AUD">AUD</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                    <TextField.Root
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={foodBeverageValue}
                                      onChange={(e) => setFoodBeverageValue(e.target.value)}
                                      style={{ width: '120px' }}
                                    />
                                  </Flex>
                                  <Flex gap="2">
                                    <Button
                                      size="1"
                                      onClick={updateFoodBeverage}
                                      disabled={updatingFoodBeverage}
                                    >
                                      {updatingFoodBeverage ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="gray"
                                      onClick={() => {
                                        setEditingFoodBeverage(false);
                                        setFoodBeverageValue('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </Flex>
                                </Flex>
                              ) : (
                                <Flex align="center" gap="2">
                                  <Button
                                    size="1"
                                    variant="soft"
                                    onClick={() => {
                                      setEditingFoodBeverage(true);
                                      setFoodBeverageValue(event.food_beverage_revenue || '0');
                                      setFoodBeverageCurrency(event.food_beverage_currency || event.cities?.countries?.currency_code || event.currency || 'USD');
                                    }}
                                  >
                                    SET
                                  </Button>
                                  <Flex direction="column" gap="1">
                                    <Text size="3" weight="bold">
                                      {event.food_beverage_currency || event.currency || '$'}{(event.food_beverage_revenue || 0).toFixed(2)}
                                    </Text>
                                    {event.food_beverage_updated_by && (
                                      <Text size="1" color="gray">
                                        Confirmed by {event.food_beverage_updated_by}
                                        {event.food_beverage_updated_at && (
                                          <>
                                            <br />
                                            on {new Date(event.food_beverage_updated_at).toLocaleString()}
                                          </>
                                        )}
                                      </Text>
                                    )}
                                  </Flex>
                                </Flex>
                              )}
                            </Box>

                            {/* Other */}
                            <Box>
                              <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                                Other (e.g. merch / funding / sponsorship)
                              </Text>
                              {editingOtherRevenue ? (
                                <Flex direction="column" gap="2">
                                  <Flex gap="2">
                                    <Select.Root
                                      value={otherRevenueCurrency}
                                      onValueChange={setOtherRevenueCurrency}
                                    >
                                      <Select.Trigger style={{ width: '80px' }} />
                                      <Select.Content>
                                        <Select.Item value="USD">USD</Select.Item>
                                        <Select.Item value="CAD">CAD</Select.Item>
                                        <Select.Item value="EUR">EUR</Select.Item>
                                        <Select.Item value="GBP">GBP</Select.Item>
                                        <Select.Item value="AUD">AUD</Select.Item>
                                      </Select.Content>
                                    </Select.Root>
                                    <TextField.Root
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={otherRevenueValue}
                                      onChange={(e) => setOtherRevenueValue(e.target.value)}
                                      style={{ width: '120px' }}
                                    />
                                  </Flex>
                                  <Flex gap="2">
                                    <Button
                                      size="1"
                                      onClick={updateOtherRevenue}
                                      disabled={updatingOtherRevenue}
                                    >
                                      {updatingOtherRevenue ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                      size="1"
                                      variant="soft"
                                      color="gray"
                                      onClick={() => {
                                        setEditingOtherRevenue(false);
                                        setOtherRevenueValue('');
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </Flex>
                                </Flex>
                              ) : (
                                <Flex align="center" gap="2">
                                  <Button
                                    size="1"
                                    variant="soft"
                                    onClick={() => {
                                      setEditingOtherRevenue(true);
                                      setOtherRevenueValue(event.other_revenue || '0');
                                      setOtherRevenueCurrency(event.other_revenue_currency || event.cities?.countries?.currency_code || event.currency || 'USD');
                                    }}
                                  >
                                    SET
                                  </Button>
                                  <Flex direction="column" gap="1">
                                    <Text size="3" weight="bold">
                                      {event.other_revenue_currency || event.currency || '$'}{(event.other_revenue || 0).toFixed(2)}
                                    </Text>
                                    {event.other_revenue_updated_by && (
                                      <Text size="1" color="gray">
                                        Confirmed by {event.other_revenue_updated_by}
                                        {event.other_revenue_updated_at && (
                                          <>
                                            <br />
                                            on {new Date(event.other_revenue_updated_at).toLocaleString()}
                                          </>
                                        )}
                                      </Text>
                                    )}
                                  </Flex>
                                </Flex>
                              )}
                            </Box>
                          </Grid>
                        </Box>
                      </Box>
                    </Card>

                    <div className="card-grid card-grid-3" style={{ marginTop: '1rem' }}>
                      {/* Sales Summary Card */}
                      <Card>
                        <Box p="3">
                          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                            Auction Sales Summary
                          </Text>
                          <Flex direction="column" gap="2">
                            <Flex justify="between">
                              <Text size="2" color="gray">Total Top Bids:</Text>
                              <Text size="2" weight="bold">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.total_top_bids_amount?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Flex justify="between">
                              <Text size="2" color="gray">Paid Online:</Text>
                              <Text size="2" weight="bold" color="green">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.total_paid_online?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Flex justify="between">
                              <Text size="2" color="gray">Collected by Partner:</Text>
                              <Text size="2" weight="bold" color="blue">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.total_paid_partner?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Flex justify="between">
                              <Text size="2" color="gray">Sold & Unpaid:</Text>
                              <Text size="2" weight="bold" color="orange">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.unpaid_paintings?.total_amount?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Separator size="4" />
                            <Flex justify="between">
                              <Text size="2" color="gray">Tax (Online):</Text>
                              <Text size="2" weight="bold">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.tax_collected_online?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Flex justify="between">
                              <Text size="2" color="gray">Tax (Partner):</Text>
                              <Text size="2" weight="bold">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.tax_collected_partner?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Separator size="4" />
                            <Flex justify="between">
                              <Text size="2" color="gray">CC Processing Fees:</Text>
                              <Text size="2" weight="bold" color="red">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.auction_summary?.processing_fees?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                              $1.00 + 2.9% per transaction
                            </Text>
                          </Flex>
                        </Box>
                      </Card>

                      {/* Unpaid Paintings Card */}
                      <Card>
                        <Box p="3">
                          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                            Unpaid Paintings
                          </Text>
                          <Flex direction="column" gap="2">
                            <Flex justify="between" align="center">
                              <Badge color="orange" size="2">
                                {postEventData?.unpaid_paintings?.count || 0} paintings
                              </Badge>
                              <Text size="2" weight="bold" color="orange">
                                {postEventData?.auction_summary?.currency_symbol}
                                {postEventData?.unpaid_paintings?.total_amount?.toFixed(2) || '0.00'}
                              </Text>
                            </Flex>
                            <Text size="1" color="gray">
                              Paintings with bids but no payment
                            </Text>
                            <Button
                              size="1"
                              variant="soft"
                              mt="2"
                              onClick={() => setUnpaidModalOpen(true)}
                              disabled={!postEventData?.unpaid_paintings?.count}
                            >
                              View List
                            </Button>
                            {postEventData?.unpaid_paintings?.sample_thumbnails &&
                             postEventData.unpaid_paintings.sample_thumbnails.length > 0 && (
                              <Flex gap="1" mt="2" wrap="wrap">
                                {postEventData.unpaid_paintings.sample_thumbnails.slice(0, 3).map((thumb, idx) => (
                                  <Box
                                    key={idx}
                                    style={{
                                      width: '60px',
                                      height: '60px',
                                      borderRadius: '4px',
                                      overflow: 'hidden',
                                      border: '1px solid var(--gray-6)'
                                    }}
                                  >
                                    <img
                                      src={thumb}
                                      alt="Unpaid painting"
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                      }}
                                    />
                                  </Box>
                                ))}
                              </Flex>
                            )}
                          </Flex>
                        </Box>
                      </Card>

                      {/* No Bids Card */}
                      <Card>
                        <Box p="3">
                          <Text size="2" weight="medium" mb="3" style={{ display: 'block' }}>
                            No Bid Paintings
                          </Text>
                          <Flex direction="column" gap="2">
                            <Badge color="gray" size="2">
                              {postEventData?.no_bid_paintings?.count || 0} paintings
                            </Badge>
                            <Text size="1" color="gray">
                              Paintings that received no bids
                            </Text>
                            <Button
                              size="1"
                              variant="soft"
                              mt="2"
                              onClick={() => setNoBidModalOpen(true)}
                              disabled={!postEventData?.no_bid_paintings?.count}
                            >
                              View List
                            </Button>
                            {postEventData?.no_bid_paintings?.sample_thumbnails &&
                             postEventData.no_bid_paintings.sample_thumbnails.length > 0 && (
                              <Flex gap="1" mt="2" wrap="wrap">
                                {postEventData.no_bid_paintings.sample_thumbnails.map((thumb, idx) => (
                                  <Box
                                    key={idx}
                                    style={{
                                      width: '60px',
                                      height: '60px',
                                      borderRadius: '4px',
                                      overflow: 'hidden',
                                      border: '1px solid var(--gray-6)'
                                    }}
                                  >
                                    <img
                                      src={thumb}
                                      alt="No bid painting"
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                      }}
                                    />
                                  </Box>
                                ))}
                              </Flex>
                            )}
                          </Flex>
                        </Box>
                      </Card>
                    </div>
                  </>
                )}

                {/* Meta Advertising Row */}
                <Card mt="3">
                  <Box p="3">
                    <Flex justify="between" align="center" mb="3">
                      <Text size="2" weight="medium">
                        Meta Advertising
                      </Text>
                      {metaAdsLoading && <Spinner size="1" />}
                      {metaAdsData && (
                        <Badge size="1" color="blue">
                          {metaAdsData.campaigns?.length || 0} campaign{metaAdsData.campaigns?.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </Flex>

                    {metaAdsData && metaAdsData.total_spend > 0 ? (
                      <>
                        <Grid columns="4" gap="3" mb="3">
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Spend</Text>
                            <Text size="4" weight="bold" color="orange">
                              {metaAdsData.currency} ${metaAdsData.total_spend?.toFixed(2) || '0.00'}
                            </Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Reach</Text>
                            <Text size="4" weight="bold">
                              {metaAdsData.total_reach?.toLocaleString() || '0'}
                            </Text>
                            <Text size="1" color="gray">people reached</Text>
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Total Clicks</Text>
                            <Text size="4" weight="bold">
                              {metaAdsData.total_clicks?.toLocaleString() || '0'}
                            </Text>
                            {metaAdsData.total_reach > 0 && (
                              <Text size="1" color="gray">
                                {((metaAdsData.total_clicks / metaAdsData.total_reach) * 100).toFixed(2)}% CTR
                              </Text>
                            )}
                          </Box>
                          <Box>
                            <Text size="1" color="gray" style={{ display: 'block' }}>Cost Per Click</Text>
                            <Text size="4" weight="bold">
                              ${metaAdsData.total_clicks > 0 ? (metaAdsData.total_spend / metaAdsData.total_clicks).toFixed(2) : '0.00'}
                            </Text>
                          </Box>
                        </Grid>

                        {metaAdsData.campaigns && metaAdsData.campaigns.length > 0 && (
                          <Box mt="3" style={{ borderTop: '1px solid var(--gray-5)', paddingTop: '12px' }}>
                            <Text size="1" weight="medium" color="gray" style={{ display: 'block', marginBottom: '8px' }}>
                              Campaigns:
                            </Text>
                            {metaAdsData.campaigns.map((campaign, idx) => (
                              <Flex key={idx} justify="between" align="center" mb="1">
                                <Text size="1">{campaign.name}</Text>
                                <Flex gap="3" align="center">
                                  <Text size="1" color="gray">{campaign.reach?.toLocaleString()} reach</Text>
                                  <Text size="1" color="gray">{campaign.clicks} clicks</Text>
                                  <Text size="1" weight="bold">${campaign.spend?.toFixed(2)}</Text>
                                </Flex>
                              </Flex>
                            ))}
                          </Box>
                        )}
                      </>
                    ) : (
                      <Grid columns="4" gap="3">
                        <Box>
                          <Text size="1" color="gray" style={{ display: 'block' }}>Total Spend</Text>
                          <Text size="2" color="gray">No ad campaigns found for {event?.eid}</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray" style={{ display: 'block' }}>Total Reach</Text>
                          <Text size="4" weight="bold">--</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray" style={{ display: 'block' }}>Total Clicks</Text>
                          <Text size="4" weight="bold">--</Text>
                        </Box>
                        <Box>
                          <Text size="1" color="gray" style={{ display: 'block' }}>Cost Per Click</Text>
                          <Text size="4" weight="bold">--</Text>
                        </Box>
                      </Grid>
                    )}
                  </Box>
                </Card>
              </Box>
            )}
          </Card>
        )}

        {/* Artist Payments - Collapsible (only show if event is in the past) */}
        {status.label === 'Completed' && (
          <Card>
            <Box p="3">
              <Flex justify="between" align="center" style={{ cursor: 'pointer' }} onClick={() => setArtistPaymentsCollapsed(!artistPaymentsCollapsed)}>
                <Heading size="4">Artist Payments ({artistPaymentsData.length})</Heading>
                <Flex align="center" gap="2">
                  {artistPaymentsLoading && <Spinner size="1" />}
                  <IconButton size="1" variant="ghost">
                    {artistPaymentsCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
                  </IconButton>
                </Flex>
              </Flex>
            </Box>
            {!artistPaymentsCollapsed && (
              <Box p="3" pt="0">
                {artistPaymentsLoading ? (
                  <Flex align="center" justify="center" p="4">
                    <Spinner size="3" />
                  </Flex>
                ) : artistPaymentsData.length === 0 ? (
                  <Callout.Root color="gray">
                    <Callout.Icon>
                      <InfoCircledIcon />
                    </Callout.Icon>
                    <Callout.Text>
                      No artist payment data available for this event yet.
                    </Callout.Text>
                  </Callout.Root>
                ) : (
                  <Table.Root variant="surface">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Artworks</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Invitation</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Account Status</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Earned</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Paid Out</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Owed</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {artistPaymentsData.map((artist) => (
                        <Table.Row key={artist.artist_id}>
                          <Table.Cell>
                            <Flex direction="column" gap="0">
                              <Text
                                size="2"
                                weight="bold"
                                style={{ cursor: 'pointer', color: 'var(--accent-9)' }}
                                onClick={() => openArtistPaymentDetail(artist)}
                              >
                                {artist.artist_name}
                              </Text>
                              <Text size="1" color="gray">#{artist.artist_number}</Text>
                            </Flex>
                          </Table.Cell>
                          <Table.Cell>
                            <Flex direction="column" gap="1">
                              {artist.artworks_paid.length > 0 && artist.artworks_paid.map(artwork => (
                                <Badge
                                  key={artwork.art_id}
                                  color="green"
                                  size="1"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => handleOpenArtworkDetail(artwork)}
                                >
                                  {artwork.art_code} - ${artwork.sale_price?.toFixed(2)}
                                </Badge>
                              ))}
                              {artist.artworks_unpaid.length > 0 && artist.artworks_unpaid.map(artwork => (
                                <Badge
                                  key={artwork.art_id}
                                  color="orange"
                                  size="1"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => handleOpenArtworkDetail(artwork)}
                                >
                                  {artwork.art_code} - ${artwork.winning_bid?.toFixed(2)}
                                </Badge>
                              ))}
                              {artist.artworks_no_bid?.length > 0 && artist.artworks_no_bid.map(artwork => (
                                <Badge
                                  key={artwork.art_id}
                                  color="gray"
                                  size="1"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => handleOpenArtworkDetail(artwork)}
                                >
                                  {artwork.art_code} - No Bids
                                </Badge>
                              ))}
                            </Flex>
                          </Table.Cell>
                          <Table.Cell>
                            {artist.payment_invitation ? (
                              <Flex direction="column" gap="0">
                                <Badge size="1" color={artist.payment_invitation.status === 'completed' ? 'green' : 'blue'}>
                                  {artist.payment_invitation.invite_type.toUpperCase()}
                                </Badge>
                                <Text size="1" color="gray">
                                  {new Date(artist.payment_invitation.sent_at).toLocaleDateString()}
                                </Text>
                              </Flex>
                            ) : (
                              <Button
                                size="1"
                                variant="soft"
                                onClick={() => {
                                  setSelectedArtistForInvite(artist);
                                  setShowPaymentInviteModal(true);
                                }}
                              >
                                Send Invite
                              </Button>
                            )}
                          </Table.Cell>
                          <Table.Cell>
                            <Badge
                              color={
                                artist.payment_account_status === 'ready' ? 'green' :
                                artist.payment_account_status === 'pending' ? 'orange' :
                                'gray'
                              }
                              size="1"
                            >
                              {artist.payment_account_status === 'ready' ? 'Ready' :
                               artist.payment_account_status === 'pending' ? 'Pending' :
                               'Not Set Up'}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="2" weight="bold" color="green">
                              ${artist.totals.total_earned.toFixed(2)}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Flex direction="column" gap="0">
                              <Text size="1">
                                ${artist.totals.total_paid.toFixed(2)}
                              </Text>
                              {artist.totals.total_paid > 0 && (
                                <Text size="1" color="gray">
                                  {artist.totals.total_paid_stripe > 0 && `S: $${artist.totals.total_paid_stripe.toFixed(2)}`}
                                  {artist.totals.total_paid_manual > 0 && ` M: $${artist.totals.total_paid_manual.toFixed(2)}`}
                                </Text>
                              )}
                            </Flex>
                          </Table.Cell>
                          <Table.Cell>
                            <Text
                              size="2"
                              weight="bold"
                              color={
                                artist.totals.amount_owed > 0 ? 'orange' :
                                artist.totals.total_earned > 0 ? 'green' :
                                'gray'
                              }
                            >
                              ${artist.totals.amount_owed.toFixed(2)}
                            </Text>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                )}
              </Box>
            )}
          </Card>
        )}

        {/* Pre-Event Info - Collapsible */}
        <Card>
          <Box p="3">
            <Flex justify="between" align="center" style={{ cursor: 'pointer' }} onClick={() => setPreEventCollapsed(!preEventCollapsed)}>
              <Heading size="4">Pre-Event Information</Heading>
              <IconButton size="1" variant="ghost">
                {preEventCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </IconButton>
            </Flex>
          </Box>
          {!preEventCollapsed && (
            <Box p="3" pt="0">
              <div className="card-grid card-grid-3">
                <Card>
                  <Box p="3">
                    <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                      Basic Info
                    </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>EID:</strong> <DebugField value={event.eid} fieldName="event.eid" />
                </Text>
                <Text size="2">
                  <strong>Eventbrite ID:</strong> <DebugField value={event.eventbrite_id} fieldName="event.eventbrite_id" fallback="Not set" />
                </Text>

                {/* Producer Tickets Sold */}
                <Box>
                  <Flex align="center" justify="between" gap="2">
                    <Text size="2">
                      <strong>Tickets Sold by Producer:</strong>
                    </Text>
                    {!editingProducerTickets && (
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => {
                          setEditingProducerTickets(true);
                          setProducerTicketsValue(event.producer_tickets_sold || '0');
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </Flex>
                  {editingProducerTickets ? (
                    <Flex gap="2" mt="1">
                      <TextField.Root
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={producerTicketsValue}
                        onChange={(e) => setProducerTicketsValue(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Button
                        size="1"
                        onClick={updateProducerTickets}
                        disabled={updatingProducerTickets}
                      >
                        {updatingProducerTickets ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        color="gray"
                        onClick={() => {
                          setEditingProducerTickets(false);
                          setProducerTicketsValue('');
                        }}
                      >
                        Cancel
                      </Button>
                    </Flex>
                  ) : (
                    <Flex direction="column" gap="1" mt="1">
                      <Text size="2" weight="bold">
                        {event.producer_tickets_currency || event.currency || '$'}{(event.producer_tickets_sold || 0).toFixed(2)}
                      </Text>
                      {event.producer_tickets_updated_by && (
                        <Text size="1" color="gray">
                          Last updated by {event.producer_tickets_updated_by}
                          {event.producer_tickets_updated_at && ` on ${new Date(event.producer_tickets_updated_at).toLocaleString()}`}
                        </Text>
                      )}
                    </Flex>
                  )}
                </Box>

                <Text size="2">
                  <strong>Slack Channel:</strong> <DebugField value={event.slack_channel} fieldName="event.slack_channel" fallback="Not set" />
                </Text>
                <Text size="2">
                  <strong>Venue:</strong> <DebugField value={event.venue} fieldName="event.venue" />
                </Text>
                <Text size="2">
                  <strong>Enabled:</strong> {event.enabled ? 'Yes' : 'No'}
                </Text>
                <Flex align="center" justify="between">
                  <Text size="2">
                    <strong>Applications:</strong> {event.applications_open ? 'Open' : 'Closed'}
                  </Text>
                  <Button
                    size="1"
                    onClick={toggleApplications}
                    variant={event.applications_open ? "solid" : "soft"}
                    color={event.applications_open ? "red" : "green"}
                  >
                    {event.applications_open ? "Close" : "Open"}
                  </Button>
                </Flex>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Date & Time
              </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>Start:</strong>{' '}
                  <DebugField 
                    value={event.event_start_datetime ? 
                      new Date(event.event_start_datetime).toLocaleString('en-US', {
                        timeZone: event.timezone_icann || 'UTC',
                        year: 'numeric',
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      }) : null} 
                    fieldName="event.event_start_datetime" 
                  />
                </Text>
                <Text size="2">
                  <strong>End:</strong>{' '}
                  <DebugField 
                    value={event.event_end_datetime ? 
                      new Date(event.event_end_datetime).toLocaleString('en-US', {
                        timeZone: event.timezone_icann || 'UTC',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric', 
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZoneName: 'short'
                      }) : null} 
                    fieldName="event.event_end_datetime" 
                  />
                </Text>
                <Text size="2">
                  <strong>Timezone:</strong>{' '}
                  <DebugField 
                    value={event.timezone_icann} 
                    fieldName="event.timezone_icann" 
                  />
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                Location
              </Text>
              <Flex direction="column" gap="2">
                <Text size="2">
                  <strong>City:</strong>{' '}
                  <DebugField 
                    value={event.cities?.name} 
                    fieldName="cities.name" 
                  />
                </Text>
                <Text size="2">
                  <strong>Country:</strong>{' '}
                  <DebugField 
                    value={event.cities?.countries?.name} 
                    fieldName="cities.countries.name" 
                  />
                </Text>
                <Text size="2">
                  <strong>Currency:</strong>{' '}
                  <DebugField 
                    value={event.cities?.countries?.currency_code} 
                    fieldName="cities.countries.currency_code" 
                    fallback="N/A"
                  />
                  {event.cities?.countries?.currency_symbol && (
                    <span style={{ marginLeft: '8px', fontWeight: 'bold', color: 'var(--blue-11)' }}>
                      {event.cities.countries.currency_symbol}
                    </span>
                  )}
                </Text>
              </Flex>
            </Box>
          </Card>
              </div>
            </Box>
          )}
        </Card>

        {/* Tabs for different sections */}
        <Card>
          <Tabs.Root defaultValue="health">
            <Tabs.List>
              <Tabs.Trigger value="health">
                Health
              </Tabs.Trigger>
              <Tabs.Trigger value="recommendations">
                Recommendations
              </Tabs.Trigger>
              <Tabs.Trigger value="artists">
                Artists ({artistApplications.length + artistInvites.length + artistConfirmations.length})
              </Tabs.Trigger>
              <Tabs.Trigger value="people">
                People ({eventPeople.length})
              </Tabs.Trigger>
              <Tabs.Trigger value="admins">
                Admins ({eventAdmins.length})
              </Tabs.Trigger>
            </Tabs.List>

            <Box p="3">
              <Tabs.Content value="health">
                {healthLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                    <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                      Loading health analysis...
                    </Text>
                  </Box>
                ) : healthData ? (
                  <Box>
                    <Text size="4" weight="bold" mb="4" style={{ display: 'block' }}>
                      Event Health Overview
                    </Text>
                    
                    {/* Overall Score Header */}
                    <Card mb="4">
                      <Box p="4">
                        <Flex align="center" justify="center" gap="4">
                          <Box style={{ textAlign: 'center' }}>
                            <Text size="8" weight="bold" color={getHealthColor(healthData.overall_status)}>
                              {healthData.overall_score}
                            </Text>
                            <Text size="2" color="gray" style={{ display: 'block' }}>Overall Health Score</Text>
                          </Box>
                          <Badge color={getHealthColor(healthData.overall_status)} size="3">
                            {getHealthIcon(healthData.overall_status)}
                            {healthData.overall_status.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                        </Flex>
                      </Box>
                    </Card>
                    
                    {/* 4-Grid Health Areas */}
                    <Grid columns={{ initial: '1', sm: '2', lg: '2' }} gap="4" mb="4">
                      {healthData.scores?.map((score, index) => (
                        <Card key={index} style={{ height: 'fit-content' }}>
                          <Box p="4">
                            <Flex justify="between" align="center" mb="3">
                              <Text size="4" weight="bold">{score.area}</Text>
                              <Flex align="center" gap="2">
                                <Text size="6" weight="bold" color={getHealthColor(score.status)}>
                                  {score.score}
                                </Text>
                                <Badge color={getHealthColor(score.status)} size="2">
                                  {getHealthIcon(score.status)}
                                </Badge>
                              </Flex>
                            </Flex>
                            
                            <Text size="2" color="gray" mb="3" style={{ lineHeight: '1.5' }}>
                              {score.summary}
                            </Text>
                            
                            {score.key_metrics && score.key_metrics.length > 0 && (
                              <Box mb="3">
                                <Text size="2" weight="medium" color="blue" mb="2" style={{ display: 'block' }}>
                                  📊 Key Metrics:
                                </Text>
                                <Box style={{ backgroundColor: 'var(--gray-2)', padding: '0.75rem', borderRadius: '6px' }}>
                                  {score.key_metrics.map((metric, i) => (
                                    <Text key={i} size="1" style={{ display: 'block', marginBottom: '0.25rem' }}>
                                      • {metric}
                                    </Text>
                                  ))}
                                </Box>
                              </Box>
                            )}
                            
                            {score.suggestions && score.suggestions.length > 0 && (
                              <Box>
                                <Text size="2" weight="medium" color="green" mb="2" style={{ display: 'block' }}>
                                  💡 Top Suggestions:
                                </Text>
                                <Box>
                                  {score.suggestions.slice(0, 2).map((suggestion, i) => (
                                    <Text key={i} size="1" style={{ display: 'block', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                                      {i + 1}. {suggestion}
                                    </Text>
                                  ))}
                                  {score.suggestions.length > 2 && (
                                    <Text size="1" color="gray" style={{ fontStyle: 'italic' }}>
                                      +{score.suggestions.length - 2} more suggestions
                                    </Text>
                                  )}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        </Card>
                      ))}
                    </Grid>
                    
                    {/* Top Priorities */}
                    {healthData.top_priorities && (
                      <Card>
                        <Box p="4">
                          <Text size="4" weight="bold" mb="3" color="red" style={{ display: 'block' }}>
                            🎯 Immediate Action Required
                          </Text>
                          <Grid columns="1" gap="3">
                            {healthData.top_priorities.map((priority, index) => (
                              <Box key={index} p="3" style={{ backgroundColor: 'var(--red-2)', borderLeft: '4px solid var(--red-9)', borderRadius: '6px' }}>
                                <Text size="2" weight="medium">
                                  {index + 1}. {priority}
                                </Text>
                              </Box>
                            ))}
                          </Grid>
                        </Box>
                      </Card>
                    )}
                  </Box>
                ) : (
                  <Box style={{ textAlign: 'center', padding: '3rem' }}>
                    <Text size="4" color="gray" mb="2" style={{ display: 'block' }}>
                      No Health Data Available
                    </Text>
                    <Text size="2" color="gray">
                      Health analysis has not been generated for this event yet.
                    </Text>
                  </Box>
                )}
              </Tabs.Content>

              <Tabs.Content value="recommendations">
                {healthLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                    <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                      Loading recommendations...
                    </Text>
                  </Box>
                ) : marketingRecommendations ? (
                  <Box>
                    <Text size="4" weight="bold" mb="4" style={{ display: 'block' }}>
                      AI Marketing Recommendations
                    </Text>
                    
                    {marketingRecommendations.summary && (
                      <Card mb="4">
                        <Box p="4">
                          <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
                            📋 Executive Summary
                          </Text>
                          <Text size="2" color="gray" style={{ lineHeight: '1.6' }}>
                            {marketingRecommendations.summary}
                          </Text>
                        </Box>
                      </Card>
                    )}
                    
                    {marketingRecommendations.recommendations && (
                      <Grid columns={{ initial: '1' }} gap="4">
                        {marketingRecommendations.recommendations.map((rec) => (
                          <Card key={rec.id}>
                            <Box p="4">
                              <Flex justify="between" align="start" mb="3">
                                <Flex align="center" gap="2">
                                  <Badge color={getCategoryColor(rec.category)} size="2">
                                    {rec.category.toUpperCase()}
                                  </Badge>
                                  <Badge color="blue" size="2">
                                    Score: {rec.score}/10
                                  </Badge>
                                  <Badge color="gray" size="2">
                                    {rec.timeline}
                                  </Badge>
                                </Flex>
                                <Flex gap="2">
                                  <Button 
                                    size="2" 
                                    variant="ghost"
                                    onClick={() => handleActionClick('send-to-event-channel', rec)}
                                    title="Send to Event Channel"
                                  >
                                    <Share1Icon size={14} />
                                  </Button>
                                  <Button 
                                    size="2" 
                                    variant="ghost"
                                    onClick={() => handleActionClick('send-to-promo-discuss', rec)}
                                    title="Send to #artb-promo-discuss"
                                  >
                                    <PaperPlaneIcon size={14} />
                                  </Button>
                                  <Button 
                                    size="2" 
                                    variant="ghost" 
                                    color="green"
                                    onClick={() => handleActionClick('positive-feedback', rec)}
                                    title="Positive Feedback"
                                  >
                                    <HandIcon size={14} />
                                  </Button>
                                  <Button 
                                    size="2" 
                                    variant="ghost" 
                                    color="red"
                                    onClick={() => handleActionClick('negative-feedback', rec)}
                                    title="Negative Feedback"
                                  >
                                    <CrossCircledIcon size={14} />
                                  </Button>
                                  <Button 
                                    size="2" 
                                    variant="ghost"
                                    onClick={() => handleActionClick('mark-as-done', rec)}
                                    title="Mark as Done"
                                  >
                                    <CheckCircledIcon size={14} />
                                  </Button>
                                </Flex>
                              </Flex>
                              
                              <Text size="3" weight="bold" mb="3" style={{ display: 'block', color: 'var(--accent-11)' }}>
                                {rec.suggestion}
                              </Text>
                              
                              <Text size="2" color="gray" mb="3" style={{ lineHeight: '1.5' }}>
                                <strong>Why:</strong> {rec.reasoning}
                              </Text>
                              
                              {rec.data_sources && rec.data_sources.length > 0 && (
                                <Box>
                                  <Text size="2" weight="medium" color="blue" mb="2" style={{ display: 'block' }}>
                                    📈 Based on:
                                  </Text>
                                  <Box style={{ backgroundColor: 'var(--blue-2)', padding: '0.75rem', borderRadius: '6px' }}>
                                    {rec.data_sources.map((source, i) => (
                                      <Text key={i} size="1" style={{ display: 'block', marginBottom: '0.25rem' }}>
                                        • {source}
                                      </Text>
                                    ))}
                                  </Box>
                                </Box>
                              )}
                            </Box>
                          </Card>
                        ))}
                      </Grid>
                    )}
                  </Box>
                ) : (
                  <Box style={{ textAlign: 'center', padding: '3rem' }}>
                    <Text size="4" color="gray" mb="2" style={{ display: 'block' }}>
                      No Recommendations Available
                    </Text>
                    <Text size="2" color="gray">
                      AI recommendations have not been generated for this event yet.
                    </Text>
                  </Box>
                )}
              </Tabs.Content>

              <Tabs.Content value="artists">
                {artistsLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                    <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                      Loading artist data...
                    </Text>
                  </Box>
                ) : (
                  <Flex direction="column" gap="4">
                    {/* Header with Progress and Refresh */}
                    <Flex justify="between" align="center">
                      <Box>
                        <Text size="4" weight="bold" mb="1" style={{ display: 'block' }}>
                          Artist Management Workflow
                        </Text>
                        <Text size="2" color="gray">
                          Manage applications, invitations, and confirmations for this event
                        </Text>
                      </Box>
                      <Flex align="center" gap="4">
                        <Button 
                          variant="outline" 
                          size="2" 
                          onClick={() => fetchArtistData(0)}
                          disabled={artistsLoading}
                        >
                          <ReloadIcon />
                          {artistsLoading ? 'Refreshing...' : 'Refresh'}
                        </Button>
                        <Badge color="blue" size="2">
                          {getFilteredApplications().length} Applied
                        </Badge>
                        <Badge color="orange" size="2">
                          {getFilteredInvitations().length} Invited
                        </Badge>
                        <Badge color="green" size="2">
                          {getFilteredConfirmations().length} Confirmed
                        </Badge>
                        <Button 
                          variant={showAllArtists ? "solid" : "outline"}
                          color="gray"
                          size="1"
                          onClick={() => setShowAllArtists(!showAllArtists)}
                        >
                          {showAllArtists ? "Hide Duplicates" : "Show All"}
                        </Button>
                      </Flex>
                    </Flex>

                    {/* 3-Column Kanban Board - Responsive: 1 column on mobile, 3 on desktop */}
                    <Grid columns={{ initial: "1", md: "3" }} gap="4">
                      {/* APPLIED Column */}
                      <Card>
                        <Box p="4">
                          <Flex justify="between" align="center" mb="3">
                            <Text size="3" weight="bold">Applied</Text>
                            <Badge color="blue">{getFilteredApplications().length}</Badge>
                          </Flex>
                          
                          <Flex direction="column" gap="3">
                            {getFilteredApplications().map((application) => (
                              <Card 
                                key={application.id}
                                style={{ 
                                  cursor: 'pointer',
                                  border: '1px solid var(--blue-6)',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleArtistCardClick(application, 'application')}
                              >
                                <Box p="3">
                                  <Flex direction="column" gap="2">
                                    <Flex align="center" gap="2">
                                      <Text size="2" weight="bold">
                                        {application.artist_profiles?.name || 'Unknown Artist'}
                                      </Text>
                                      {(() => {
                                        const dateInfo = formatDateForDisplay(application.created_at);
                                        return dateInfo.isRecent && (
                                          <Box
                                            style={{
                                              width: '8px',
                                              height: '8px',
                                              borderRadius: '50%',
                                              backgroundColor: getRecentActivityColor(true),
                                              flexShrink: 0
                                            }}
                                            title="Recent activity (last 36 hours)"
                                          />
                                        );
                                      })()}
                                    </Flex>
                                    <Flex justify="between" align="center" gap="2">
                                      <Text size="1" color="gray">
                                        #{application.artist_number}
                                      </Text>
                                      <Text size="1" color="gray" title={formatDateForDisplay(application.created_at).fullDate}>
                                        {formatDateForDisplay(application.created_at).timeAgo}
                                      </Text>
                                    </Flex>
                                  </Flex>
                                </Box>
                              </Card>
                            ))}
                            
                            {getFilteredApplications().length === 0 && (
                              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                                {showAllArtists ? 'No applications received yet' : 'No new applications (all artists are invited or confirmed)'}
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      </Card>

                      {/* INVITED Column */}
                      <Card>
                        <Box p="4">
                          <Flex justify="between" align="center" mb="3">
                            <Text size="3" weight="bold">Invited</Text>
                            <Badge color="orange">{getFilteredInvitations().length}</Badge>
                          </Flex>
                          
                          <Flex direction="column" gap="3">
                            {getFilteredInvitations().map((invite) => {
                              const status = getInvitationStatus(invite);
                              return (
                                <Card 
                                  key={invite.id}
                                  style={{ 
                                    cursor: 'pointer',
                                    border: `1px solid var(--${status.color}-6)`,
                                    transition: 'all 0.2s ease'
                                  }}
                                  onClick={() => handleArtistCardClick(invite, 'invitation')}
                                >
                                  <Box p="3">
                                    <Flex direction="column" gap="2">
                                      <Flex align="center" gap="2">
                                        <Text size="2" weight="bold">
                                          {invite.artist_profiles?.name || 'Unknown Artist'}
                                        </Text>
                                        {(() => {
                                          const dateInfo = formatDateForDisplay(invite.created_at);
                                          return dateInfo.isRecent && (
                                            <Box
                                              style={{
                                                width: '8px',
                                                height: '8px',
                                                borderRadius: '50%',
                                                backgroundColor: getRecentActivityColor(true),
                                                flexShrink: 0
                                              }}
                                              title="Recent activity (last 36 hours)"
                                            />
                                          );
                                        })()}
                                      </Flex>
                                      <Flex justify="between" align="center" gap="2">
                                        <Text size="1" color="gray">
                                          #{invite.artist_number}
                                        </Text>
                                        <Text size="1" color="gray" title={formatDateForDisplay(invite.created_at).fullDate}>
                                          {formatDateForDisplay(invite.created_at).timeAgo}
                                        </Text>
                                      </Flex>
                                    </Flex>
                                  </Box>
                                </Card>
                              );
                            })}
                            
                            {getFilteredInvitations().length === 0 && (
                              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                                {showAllArtists ? 'No invitations sent yet' : 'No pending invitations (all are confirmed)'}
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      </Card>

                      {/* CONFIRMED Column */}
                      <Card>
                        <Box p="4">
                          <Flex justify="between" align="center" mb="3">
                            <Text size="3" weight="bold">Confirmed</Text>
                            <Badge color="green">{getFilteredConfirmations().length}</Badge>
                          </Flex>
                          
                          <Flex direction="column" gap="3">
                            {getFilteredConfirmations().map((confirmation) => (
                              <Card 
                                key={confirmation.id}
                                style={{ 
                                  cursor: 'pointer',
                                  border: '1px solid var(--green-6)',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleArtistCardClick(confirmation, 'confirmation')}
                              >
                                <Box p="3">
                                  <Flex direction="column" gap="2">
                                    <Flex align="center" gap="2">
                                      <Text size="2" weight="bold">
                                        {confirmation.artist_profiles?.name || 'Unknown Artist'}
                                      </Text>
                                      {(() => {
                                        const dateInfo = formatDateForDisplay(confirmation.created_at);
                                        return dateInfo.isRecent && (
                                          <Box
                                            style={{
                                              width: '8px',
                                              height: '8px',
                                              borderRadius: '50%',
                                              backgroundColor: getRecentActivityColor(true),
                                              flexShrink: 0
                                            }}
                                            title="Recent activity (last 36 hours)"
                                          />
                                        );
                                      })()}
                                    </Flex>
                                    <Flex justify="between" align="center" gap="2">
                                      <Text size="1" color="gray">
                                        #{confirmation.artist_number}
                                      </Text>
                                      <Text size="1" color="gray" title={formatDateForDisplay(confirmation.created_at).fullDate}>
                                        {formatDateForDisplay(confirmation.created_at).timeAgo}
                                      </Text>
                                    </Flex>
                                  </Flex>
                                </Box>
                              </Card>
                            ))}
                            
                            {getFilteredConfirmations().length === 0 && (
                              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '2rem' }}>
                                No confirmations received yet
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      </Card>
                    </Grid>
                  </Flex>
                )}
              </Tabs.Content>

              <Tabs.Content value="people">
                <Flex justify="between" align="center" mb="3">
                  <Text size="3" weight="medium">
                    Event Participants
                  </Text>
                  <Text size="2" color="gray">
                    People who voted, bid, or scanned QR codes
                  </Text>
                </Flex>
                
                {peopleLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                  </Box>
                ) : eventPeople.length > 0 ? (
                  <Grid columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
                    {eventPeople.map((person) => (
                      <PersonTile
                        key={person.id}
                        person={person}
                        onClick={fetchPersonHistory}
                        rfmScores={rfmScores}
                        rfmLoading={peopleLoading}
                        showActivityBadges={true}
                      />
                    ))}
                  </Grid>
                ) : (
                  <Text color="gray">No participants found for this event</Text>
                )}
              </Tabs.Content>

              <Tabs.Content value="admins">
                {adminsLoading ? (
                  <Box style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="3" />
                    <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                      Loading administrators...
                    </Text>
                  </Box>
                ) : (
                  <Flex direction="column" gap="4">
                    {/* Current Admins */}
                    <Card>
                      <Box p="4">
                        <Text size="3" weight="bold" mb="3" style={{ display: 'block' }}>
                          Current Administrators ({eventAdmins.length})
                        </Text>
                        {eventAdmins.length > 0 ? (
                          <Flex direction="column" gap="2">
                            {eventAdmins.map((admin) => (
                              <Card key={admin.id} variant="surface">
                                <Box p="3">
                                  <Flex justify="between" align="center">
                                    <Flex direction="column" gap="1">
                                      <Text size="2" weight="medium">
                                        {admin.phone}
                                      </Text>
                                      <Text size="1" color="gray">
                                        Added: {new Date(admin.created_at).toLocaleDateString()}
                                      </Text>
                                    </Flex>
                                    <Flex align="center" gap="2">
                                      <Badge 
                                        color={
                                          admin.admin_level === 'super' ? 'red' : 
                                          admin.admin_level === 'producer' ? 'orange' : 
                                          admin.admin_level === 'photo' ? 'blue' : 
                                          'green'
                                        }
                                      >
                                        {admin.admin_level}
                                      </Badge>
                                      <Button 
                                        size="1" 
                                        variant="ghost" 
                                        color="red"
                                        onClick={() => {
                                          if (window.confirm(`Remove ${admin.phone} as ${admin.admin_level} admin?`)) {
                                            removeEventAdmin(admin.id);
                                          }
                                        }}
                                      >
                                        <Cross2Icon size={14} />
                                      </Button>
                                    </Flex>
                                  </Flex>
                                </Box>
                              </Card>
                            ))}
                          </Flex>
                        ) : (
                          <Text color="gray">No administrators assigned to this event</Text>
                        )}
                      </Box>
                    </Card>
                    
                    {/* Add New Admin */}
                    <Card>
                      <Box p="4">
                        <Text size="3" weight="bold" mb="3" style={{ display: 'block' }}>
                          Add Administrator
                        </Text>
                        
                        {/* Message Display */}
                        {adminMessage && (
                          <Callout.Root color={adminMessage.type === 'success' ? 'green' : 'red'} mb="3">
                            <Callout.Icon>
                              {adminMessage.type === 'success' ? <InfoCircledIcon /> : <ExclamationTriangleIcon />}
                            </Callout.Icon>
                            <Callout.Text>{adminMessage.text}</Callout.Text>
                          </Callout.Root>
                        )}
                        
                        <Flex direction="column" gap="3">
                          <Box>
                            <Text size="2" mb="1" weight="medium">Phone Number</Text>
                            <Flex gap="2">
                              <input
                                type="tel"
                                placeholder="+1 555-123-4567 or +44 20 1234 5678"
                                value={adminPhoneSearch}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setAdminPhoneSearch(value);
                                  
                                  // Validate phone number in real-time
                                  validatePhoneInput(value);
                                  
                                  // Search for people with this phone
                                  if (value.length >= 10) {
                                    searchPeopleByPhone(value);
                                  } else {
                                    setPeopleSearchResults([]);
                                  }
                                }}
                                style={{
                                  flex: 1,
                                  padding: '8px',
                                  borderRadius: '4px',
                                  border: `1px solid ${phoneValidationError ? 'var(--red-9)' : validatedPhone ? 'var(--green-9)' : 'var(--gray-6)'}`,
                                  background: 'var(--color-background)',
                                  color: 'var(--color-text)'
                                }}
                              />
                              <Select.Root value={selectedAdminLevel} onValueChange={setSelectedAdminLevel}>
                                <Select.Trigger style={{ width: '120px' }}>
                                  {selectedAdminLevel}
                                </Select.Trigger>
                                <Select.Content>
                                  <Select.Item value="voting">Voting</Select.Item>
                                  <Select.Item value="photo">Photo</Select.Item>
                                  <Select.Item value="producer">Producer</Select.Item>
                                  <Select.Item value="super">Super</Select.Item>
                                </Select.Content>
                              </Select.Root>
                              <Button size="2" onClick={addEventAdmin} disabled={!!phoneValidationError || !validatedPhone}>
                                Add Admin
                              </Button>
                            </Flex>
                            
                            {/* Phone Validation Feedback */}
                            {phoneValidationError && (
                              <Callout.Root color="red" size="1" mt="2">
                                <Callout.Icon>
                                  <ExclamationTriangleIcon />
                                </Callout.Icon>
                                <Callout.Text>{phoneValidationError}</Callout.Text>
                              </Callout.Root>
                            )}
                            
                            {validatedPhone && !phoneValidationError && (
                              <Callout.Root color="green" size="1" mt="2">
                                <Callout.Icon>
                                  <CheckCircledIcon />
                                </Callout.Icon>
                                <Callout.Text>Will be stored as: {validatedPhone}</Callout.Text>
                              </Callout.Root>
                            )}
                            
                            {/* Search Results */}
                            {peopleSearchResults.length > 0 && (
                              <Box mt="2" p="2" style={{ background: 'var(--gray-2)', borderRadius: '4px' }}>
                                <Text size="1" weight="medium" mb="2">Found in database:</Text>
                                {peopleSearchResults.map(person => (
                                  <Flex 
                                    key={person.id} 
                                    p="1" 
                                    align="center" 
                                    justify="between"
                                    style={{ cursor: 'pointer', borderRadius: '2px' }}
                                    onClick={() => setAdminPhoneSearch(person.phone)}
                                  >
                                    <Text size="2">
                                      {person.first_name && person.last_name ? 
                                        `${person.first_name} ${person.last_name}` : 
                                        'Unknown'} ({person.phone})
                                    </Text>
                                  </Flex>
                                ))}
                              </Box>
                            )}
                          </Box>
                          
                          <Box p="3" style={{ background: 'var(--blue-2)', borderRadius: '6px' }}>
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              Admin Level Permissions:
                            </Text>
                            <Flex direction="column" gap="1">
                              <Text size="1">
                                <Badge color="green" size="1" style={{ marginRight: '8px' }}>voting</Badge>
                                Can view event data and manage voting
                              </Text>
                              <Text size="1">
                                <Badge color="blue" size="1" style={{ marginRight: '8px' }}>photo</Badge>
                                Can upload photos and manage media
                              </Text>
                              <Text size="1">
                                <Badge color="orange" size="1" style={{ marginRight: '8px' }}>producer</Badge>
                                Can manage event settings and participants
                              </Text>
                              <Text size="1">
                                <Badge color="red" size="1" style={{ marginRight: '8px' }}>super</Badge>
                                Full access to all event management features
                              </Text>
                            </Flex>
                          </Box>
                        </Flex>
                      </Box>
                    </Card>
                  </Flex>
                )}
              </Tabs.Content>

            </Box>
          </Tabs.Root>
        </Card>
      </Flex>

      {/* Person History Modal */}
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Content style={{ maxWidth: 800, maxHeight: '90vh' }}>
          <Dialog.Title>
            <Flex align="center" gap="3">
              <PersonIcon size={24} />
              <Box>
                <Text size="5" weight="bold">
                  {selectedPerson?.first_name} {selectedPerson?.last_name}
                </Text>
                <Flex align="center" gap="2" mt="1">
                  <Text size="2" color="gray">
                    Customer Details & History
                  </Text>
                  {rfmScores.has(selectedPerson?.id) && (
                    <Badge color={getSegmentColor(rfmScores.get(selectedPerson.id).segmentCode)} size="2">
                      <StarIcon size={14} />
                      {rfmScores.get(selectedPerson.id).segment}
                    </Badge>
                  )}
                </Flex>
              </Box>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>

          <ScrollArea style={{ height: '70vh' }}>
            <Box p="4">
              {historyLoading ? (
                <Box style={{ textAlign: 'center', padding: '2rem' }}>
                  <Spinner size="3" />
                  <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                    Loading customer history...
                  </Text>
                </Box>
              ) : (
                <Flex direction="column" gap="4">
                  {/* Basic Info */}
                  <Card>
                    <Box p="4">
                      <Heading size="4" mb="3">Contact Information</Heading>
                      <Flex direction="column" gap="2">
                        {selectedPerson?.email && (
                          <Flex align="center" gap="2">
                            <EnvelopeClosedIcon size={16} />
                            <Text>{selectedPerson.email}</Text>
                          </Flex>
                        )}
                        {selectedPerson?.phone && (
                          <Flex align="center" gap="2">
                            <ChatBubbleIcon size={16} />
                            <Text>{selectedPerson.phone}</Text>
                          </Flex>
                        )}
                        <Flex align="center" gap="2">
                          <CalendarIcon size={16} />
                          <Text size="2" color="gray">
                            Joined: {selectedPerson?.created_at ? new Date(selectedPerson.created_at).toLocaleDateString() : 'Unknown'}
                          </Text>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>

                  {/* RFM Analysis */}
                  {rfmScores.has(selectedPerson?.id) && (
                    <Card>
                      <Box p="4">
                        <Heading size="4" mb="3">
                          <Flex align="center" gap="2">
                            <StarIcon size={20} />
                            RFM Customer Analysis
                          </Flex>
                        </Heading>
                        <Flex direction="column" gap="3">
                          {(() => {
                            const rfm = rfmScores.get(selectedPerson.id);
                            const tier = getSegmentTier(rfm.segmentCode);
                            return (
                              <>
                                <Flex justify="between" align="center">
                                  <Text size="3" weight="bold">
                                    {rfm.segment}
                                  </Text>
                                  <Badge color={getSegmentColor(rfm.segmentCode)} size="2">
                                    Tier {tier.tier}: {tier.description}
                                  </Badge>
                                </Flex>
                                
                                <Grid columns="3" gap="4">
                                  <Box style={{ textAlign: 'center' }}>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>RECENCY</Text>
                                    <Text size="4" weight="bold" color={rfm.recencyScore >= 4 ? 'green' : rfm.recencyScore >= 3 ? 'yellow' : 'red'}>
                                      {rfm.recencyScore}
                                    </Text>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>
                                      {rfm.daysSinceLastActivity} days ago
                                    </Text>
                                  </Box>
                                  <Box style={{ textAlign: 'center' }}>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>FREQUENCY</Text>
                                    <Text size="4" weight="bold" color={rfm.frequencyScore >= 4 ? 'green' : rfm.frequencyScore >= 3 ? 'yellow' : 'red'}>
                                      {rfm.frequencyScore}
                                    </Text>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>
                                      {rfm.totalActivities} activities
                                    </Text>
                                  </Box>
                                  <Box style={{ textAlign: 'center' }}>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>MONETARY</Text>
                                    <Text size="4" weight="bold" color={rfm.monetaryScore >= 4 ? 'green' : rfm.monetaryScore >= 3 ? 'yellow' : 'red'}>
                                      {rfm.monetaryScore}
                                    </Text>
                                    <Text size="1" color="gray" style={{ display: 'block' }}>
                                      ${rfm.totalSpent.toFixed(2)}
                                    </Text>
                                  </Box>
                                </Grid>
                                
                                <Flex justify="center">
                                  <Badge color="blue" size="2">
                                    Total Score: {rfm.totalScore}/15
                                  </Badge>
                                </Flex>
                                
                                <Text size="1" color="gray" style={{ textAlign: 'center' }}>
                                  Calculated: {new Date(rfm.calculatedAt).toLocaleString()}
                                </Text>
                              </>
                            );
                          })()}
                        </Flex>
                      </Box>
                    </Card>
                  )}

                  {/* Voting History */}
                  <Card>
                    <Box p="4">
                      <Flex justify="between" align="center" mb="3">
                        <Heading size="4">Votes</Heading>
                        <Badge color="blue">{personHistory?.votes?.length || 0}</Badge>
                      </Flex>
                      {personHistory?.votes?.length > 0 ? (
                        <Table.Root>
                          <Table.Header>
                            <Table.Row>
                              <Table.ColumnHeaderCell>Art</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Weight</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {personHistory.votes.map((vote) => (
                              <Table.Row key={vote.id}>
                                <Table.Cell>
                                  <Flex align="center" gap="2">
                                    <Box style={{ 
                                      width: 40, 
                                      height: 40, 
                                      backgroundColor: 'var(--gray-5)', 
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <ImageIcon size={16} />
                                    </Box>
                                    <Text size="2" style={{ fontWeight: 'bold' }}>
                                      R{vote.round} E{vote.easel}
                                    </Text>
                                  </Flex>
                                </Table.Cell>
                                <Table.Cell>
                                  <Button 
                                    variant="ghost" 
                                    size="1"
                                    onClick={() => window.open(`/admin/events/${vote.events?.id}`, '_blank')}
                                    style={{ padding: '4px' }}
                                  >
                                    <Flex align="center" gap="1">
                                      <Text size="2">{vote.events?.eid}</Text>
                                      <ExternalLinkIcon size={12} />
                                    </Flex>
                                  </Button>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="2">Unknown Artist</Text>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge color="green" size="1">{vote.vote_factor || 1}</Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="1" color="gray">
                                    {new Date(vote.created_at).toLocaleDateString()}
                                  </Text>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      ) : (
                        <Text size="2" color="gray">No votes found</Text>
                      )}
                    </Box>
                  </Card>

                  {/* Bidding History */}
                  <Card>
                    <Box p="4">
                      <Flex justify="between" align="center" mb="3">
                        <Heading size="4">Bids</Heading>
                        <Badge color="orange">{personHistory?.bids?.length || 0}</Badge>
                      </Flex>
                      {personHistory?.bids?.length > 0 ? (
                        <Table.Root>
                          <Table.Header>
                            <Table.Row>
                              <Table.ColumnHeaderCell>Art</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {personHistory.bids.map((bid) => (
                              <Table.Row key={bid.id}>
                                <Table.Cell>
                                  <Flex align="center" gap="2">
                                    <Box style={{ 
                                      width: 40, 
                                      height: 40, 
                                      backgroundColor: 'var(--gray-5)', 
                                      borderRadius: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <ImageIcon size={16} />
                                    </Box>
                                    <Text size="2" style={{ fontWeight: 'bold' }}>
                                      {bid.art?.art_code || 'Unknown Art'}
                                    </Text>
                                  </Flex>
                                </Table.Cell>
                                <Table.Cell>
                                  <Button 
                                    variant="ghost" 
                                    size="1"
                                    onClick={() => window.open(`/admin/events/${bid.art?.events?.id}`, '_blank')}
                                    style={{ padding: '4px' }}
                                  >
                                    <Flex align="center" gap="1">
                                      <Text size="2">{bid.art?.events?.eid}</Text>
                                      <ExternalLinkIcon size={12} />
                                    </Flex>
                                  </Button>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="2">Unknown Artist</Text>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge color="green">${bid.amount}</Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge color="gray" size="1">Bid</Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="1" color="gray">
                                    {new Date(bid.created_at).toLocaleDateString()}
                                  </Text>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      ) : (
                        <Text size="2" color="gray">No bids found</Text>
                      )}
                    </Box>
                  </Card>

                  {/* Payments */}
                  <Card>
                    <Box p="4">
                      <Flex justify="between" align="center" mb="3">
                        <Heading size="4">Payment History</Heading>
                        <Badge color="green">{personHistory?.payments?.length || 0}</Badge>
                      </Flex>
                      {personHistory?.payments?.length > 0 ? (
                        <Table.Root>
                          <Table.Header>
                            <Table.Row>
                              <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {personHistory.payments.map((payment) => (
                              <Table.Row key={payment.id}>
                                <Table.Cell>
                                  <Flex align="center" gap="2">
                                    <CardStackIcon size={16} />
                                    <Box>
                                      <Text size="2" style={{ fontWeight: 'bold' }}>
                                        {payment.description || 'Payment'}
                                      </Text>
                                      {payment.stripe_charge_id && (
                                        <Text size="1" color="gray" style={{ display: 'block' }}>
                                          {payment.stripe_charge_id}
                                        </Text>
                                      )}
                                    </Box>
                                  </Flex>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="2" color="gray">General</Text>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge color="green">
                                    ${payment.amount} {payment.currency?.toUpperCase()}
                                  </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Badge 
                                    color={payment.status === 'succeeded' ? 'green' : payment.status === 'failed' ? 'red' : 'orange'} 
                                    size="1"
                                  >
                                    {payment.status || 'unknown'}
                                  </Badge>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="1" color="gray">
                                    {new Date(payment.created_at).toLocaleDateString()}
                                  </Text>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      ) : (
                        <Text size="2" color="gray">No payments found</Text>
                      )}
                    </Box>
                  </Card>

                  {/* QR Scans */}
                  <Card>
                    <Box p="4">
                      <Flex justify="between" align="center" mb="3">
                        <Heading size="4">QR Code Scans</Heading>
                        <Badge color="purple">{personHistory?.qrScans?.length || 0}</Badge>
                      </Flex>
                      {personHistory?.qrScans?.length > 0 ? (
                        <Table.Root>
                          <Table.Header>
                            <Table.Row>
                              <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Event</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Data</Table.ColumnHeaderCell>
                              <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                            </Table.Row>
                          </Table.Header>
                          <Table.Body>
                            {personHistory.qrScans.map((scan) => (
                              <Table.Row key={scan.id}>
                                <Table.Cell>
                                  <Flex align="center" gap="2">
                                    <EyeOpenIcon size={16} />
                                    <Badge color="purple" size="1">
                                      QR Scan
                                    </Badge>
                                  </Flex>
                                </Table.Cell>
                                <Table.Cell>
                                  {scan.events?.eid ? (
                                    <Button 
                                      variant="ghost" 
                                      size="1"
                                      onClick={() => window.open(`/admin/events/${scan.events?.id}`, '_blank')}
                                      style={{ padding: '4px' }}
                                    >
                                      <Flex align="center" gap="1">
                                        <Text size="2">{scan.events.eid}</Text>
                                        <ExternalLinkIcon size={12} />
                                      </Flex>
                                    </Button>
                                  ) : (
                                    <Text size="2" color="gray">General</Text>
                                  )}
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="2" color="gray" style={{ fontFamily: 'monospace' }}>
                                    {scan.qr_code ? scan.qr_code.substring(0, 30) + (scan.qr_code.length > 30 ? '...' : '') : 'No data'}
                                  </Text>
                                </Table.Cell>
                                <Table.Cell>
                                  <Text size="1" color="gray">
                                    {new Date(scan.created_at).toLocaleDateString()}
                                  </Text>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Root>
                      ) : (
                        <Text size="2" color="gray">No QR scans found</Text>
                      )}
                    </Box>
                  </Card>

                  {/* Interactions */}
                  {personHistory?.interactions?.length > 0 && (
                    <Card>
                      <Box p="4">
                        <Flex justify="between" align="center" mb="3">
                          <Heading size="4">Interactions</Heading>
                          <Badge color="gray">{personHistory.interactions.length}</Badge>
                        </Flex>
                        <Flex direction="column" gap="2">
                          {personHistory.interactions.map((interaction) => (
                            <Box key={interaction.id} p="2" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '4px' }}>
                              <Text size="2">{interaction.type || 'Unknown'}</Text>
                              <Text size="1" color="gray" style={{ display: 'block' }}>
                                {new Date(interaction.created_at).toLocaleString()}
                              </Text>
                            </Box>
                          ))}
                        </Flex>
                      </Box>
                    </Card>
                  )}
                </Flex>
              )}
            </Box>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Root>

      {/* Feedback Modal */}
      <Dialog.Root open={feedbackModalOpen} onOpenChange={setFeedbackModalOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>
            <Flex align="center" gap="2">
              {feedbackType === 'positive' ? <HandIcon size={20} /> : <CrossCircledIcon size={20} />}
              {feedbackType === 'positive' ? 'Positive Feedback' : 'Negative Feedback'}
            </Flex>
          </Dialog.Title>
          
          <Box p="4">
            <Text size="2" color="gray" mb="3" style={{ display: 'block' }}>
              Share your thoughts about this AI recommendation:
            </Text>
            
            <TextArea
              placeholder="Enter your feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              style={{ width: '100%', marginBottom: '1rem' }}
            />
            
            <Flex justify="end" gap="2">
              <Button 
                variant="ghost" 
                onClick={() => setFeedbackModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim() || submittingFeedback}
              >
                {submittingFeedback ? <Spinner size="1" /> : 'Submit Feedback'}
              </Button>
            </Flex>
          </Box>
        </Dialog.Content>
      </Dialog.Root>

      {/* Slack Modal */}
      <Dialog.Root open={slackModalOpen} onOpenChange={setSlackModalOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>
            <Flex align="center" gap="2">
              <PaperPlaneIcon size={20} />
              Send to Slack
            </Flex>
          </Dialog.Title>
          
          <Box p="4">
            <Text size="2" color="gray" mb="3" style={{ display: 'block' }}>
              Send this recommendation to:
            </Text>
            
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              {slackChannel === 'event' ? 'Event Channel' : '#artb-promo-discuss'}
            </Text>
            
            {selectedRecommendation && (
              <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px', marginBottom: '1rem' }}>
                <Text size="2" weight="medium" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  {selectedRecommendation.suggestion}
                </Text>
                <Text size="1" color="gray">
                  {selectedRecommendation.reasoning}
                </Text>
              </Box>
            )}
            
            <Flex justify="end" gap="2">
              <Button 
                variant="ghost" 
                onClick={() => setSlackModalOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSlackSubmit}
                disabled={sendingToSlack}
              >
                {sendingToSlack ? <Spinner size="1" /> : 'Send to Slack'}
              </Button>
            </Flex>
          </Box>
        </Dialog.Content>
      </Dialog.Root>

      {/* Artist Workflow Modal */}
      <Dialog.Root open={artistModalOpen} onOpenChange={(open) => {
        setArtistModalOpen(open);
        if (!open) {
          // Reset invitation form state when modal closes
          setShowInvitationForm(false);
          setInvitationMessage('');
        }
      }}>
        <Dialog.Content style={{ maxWidth: 800, maxHeight: '90vh' }}>
          <Dialog.Title>
            <Flex align="center" justify="between" gap="3">
              <Flex align="center" gap="3">
                <PersonIcon size={24} />
                <Box>
                  <Text size="5" weight="bold">
                    {selectedArtist?.artist_profiles?.name || 'Unknown Artist'}
                  </Text>
                  <Text size="2" color="gray" mt="1">
                    {artistModalType.charAt(0).toUpperCase() + artistModalType.slice(1)} Details
                  </Text>
                </Box>
              </Flex>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>

          <ScrollArea style={{ height: '70vh' }}>
            <Box p="4">
              <Flex direction="column" gap="4">
                {/* Artist Profile */}
                <Card>
                  <Box p="4">
                    <Heading size="4" mb="3">Artist Profile</Heading>
                    {/* Artist Info */}
                    <Flex direction="column" gap="2">
                        <Text size="2">
                          <strong>Name:</strong> {selectedArtist?.artist_profiles?.name || 'Unknown'}
                        </Text>
                        <Text size="2">
                          <strong>Artist #:</strong> {selectedArtist?.artist_number || 'Unknown'}
                        </Text>
                        {selectedArtist?.artist_profiles?.email && (
                          <Text size="2">
                            <strong>Email:</strong> {selectedArtist.artist_profiles.email}
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.phone && (
                          <Text size="2">
                            <strong>Phone:</strong> {selectedArtist.artist_profiles.phone}
                          </Text>
                        )}
                        {(selectedArtist?.artist_profiles?.city_text || selectedArtist?.artist_profiles?.city || selectedArtist?.artist_profiles?.country) && (
                          <Text size="2">
                            <strong>Location:</strong> {[selectedArtist?.artist_profiles?.city_text || selectedArtist?.artist_profiles?.city, selectedArtist?.artist_profiles?.country].filter(Boolean).join(', ')}
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.studio_location && (
                          <Text size="2">
                            <strong>Studio:</strong> {selectedArtist.artist_profiles.studio_location}
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.specialties && (
                          <Text size="2">
                            <strong>Specialties:</strong> {selectedArtist.artist_profiles.specialties}
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.instagram && (
                          <Text size="2">
                            <strong>Instagram:</strong> <a href={`https://instagram.com/${selectedArtist.artist_profiles.instagram}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{selectedArtist.artist_profiles.instagram}</a>
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.website && (
                          <Text size="2">
                            <strong>Website:</strong> <a href={selectedArtist.artist_profiles.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{selectedArtist.artist_profiles.website}</a>
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.facebook && (
                          <Text size="2">
                            <strong>Facebook:</strong> <a href={`https://facebook.com/${selectedArtist.artist_profiles.facebook}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>{selectedArtist.artist_profiles.facebook}</a>
                          </Text>
                        )}
                        {selectedArtist?.artist_profiles?.twitter && (
                          <Text size="2">
                            <strong>Twitter:</strong> <a href={`https://twitter.com/${selectedArtist.artist_profiles.twitter}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-11)' }}>@{selectedArtist.artist_profiles.twitter}</a>
                          </Text>
                        )}
                    </Flex>
                    
                    {/* Bio Section */}
                    {selectedArtist?.artist_profiles?.bio && (
                      <Box mt="3">
                        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                          <strong>Bio:</strong>
                        </Text>
                        <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                          <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {selectedArtist.artist_profiles.bio}
                          </Text>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Card>

                {/* Sample Works */}
                <Card>
                  <Box p="4">
                    <Heading size="4" mb="3">Sample Works</Heading>
                    {sampleWorksLoading ? (
                      <Box style={{ textAlign: 'center', padding: '2rem' }}>
                        <Spinner size="2" />
                        <Text size="2" color="gray" style={{ display: 'block', marginTop: '1rem' }}>
                          Loading sample works...
                        </Text>
                      </Box>
                    ) : sampleWorks.length > 0 ? (
                      <Grid columns={{ initial: '2', sm: '3', lg: '4' }} gap="3">
                        {sampleWorks.map((work) => (
                          <Box 
                            key={work.id}
                            onClick={() => handleImageClick(work)}
                            style={{ 
                              width: '100%', 
                              height: 120, 
                              backgroundColor: 'var(--gray-4)', 
                              borderRadius: '6px',
                              backgroundImage: work.image_url ? `url(${work.image_url})` : 'none',
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              transition: 'transform 0.2s ease',
                              '&:hover': {
                                transform: 'scale(1.05)'
                              }
                            }}
                          >
                            {!work.image_url && <ImageIcon size={32} />}
                          </Box>
                        ))}
                      </Grid>
                    ) : (
                      <Box style={{ textAlign: 'center', padding: '2rem' }}>
                        <Text size="2" color="gray">
                          No sample works available for this artist.
                        </Text>
                      </Box>
                    )}
                  </Box>
                </Card>

                {/* Invitation Form */}
                {showInvitationForm && selectedArtist && (
                  <Card>
                    <Box p="4">
                      <Heading size="4" mb="3">
                        <Flex align="center" gap="2">
                          <PaperPlaneIcon />
                          Send Invitation to {selectedArtist?.artist_profiles?.name || selectedArtist?.artist_number}
                        </Flex>
                      </Heading>
                      
                      <Flex direction="column" gap="4">
                        <Box>
                          <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                            Personal Message from Producer:
                          </Text>
                          <TextArea
                            placeholder="Write a personal invitation message..."
                            value={invitationMessage}
                            onChange={(e) => setInvitationMessage(e.target.value)}
                            rows={8}
                            style={{ minHeight: '200px' }}
                          />
                          <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                            This message will be sent to the artist along with the invitation to participate in {event?.name}.
                          </Text>
                        </Box>

                        <Separator />

                        <Flex gap="3">
                          <Button 
                            size="3" 
                            style={{ flex: 1 }}
                            onClick={sendInvitation}
                            disabled={sendingInvitation || !invitationMessage.trim()}
                          >
                            {sendingInvitation ? (
                              <>
                                <Spinner size="1" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <PaperPlaneIcon />
                                Send Invitation
                              </>
                            )}
                          </Button>
                          <Button 
                            size="3" 
                            variant="outline" 
                            color="gray"
                            onClick={cancelInvitation}
                            disabled={sendingInvitation}
                          >
                            Cancel
                          </Button>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                )}

                {/* Application-specific content */}
                {artistModalType === 'application' && selectedArtist && !showInvitationForm && (
                  <Card>
                    <Box p="4">
                      <Heading size="4" mb="3">Application Details</Heading>
                      <Flex direction="column" gap="3">
                        <Text size="2">
                          <strong>Applied:</strong> {new Date(selectedArtist.created_at).toLocaleString()}
                        </Text>
                        {selectedArtist.motivation && (
                          <Box>
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              Artist's Motivation:
                            </Text>
                            <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                              <Text size="2" style={{ lineHeight: '1.5' }}>
                                {selectedArtist.motivation}
                              </Text>
                            </Box>
                          </Box>
                        )}
                        
                        <Separator />
                        
                        <Flex gap="3">
                          <Button 
                            size="3" 
                            style={{ flex: 1 }}
                            onClick={handleSendInvitation}
                          >
                            Send Invitation
                          </Button>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                )}

                {/* Invitation-specific content */}
                {artistModalType === 'invitation' && selectedArtist && (
                  <Card>
                    <Box p="4">
                      <Heading size="4" mb="3">Invitation Status</Heading>
                      <Flex direction="column" gap="3">
                        <Text size="2">
                          <strong>Invited:</strong> {new Date(selectedArtist.created_at).toLocaleString()}
                        </Text>
                        
{/* View tracking feature temporarily hidden - to be added later */}
                        {false && selectedArtist.first_viewed_at ? (
                          <Box>
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              View Tracking:
                            </Text>
                            <Flex direction="column" gap="1">
                              <Text size="2">
                                <strong>First viewed:</strong> {new Date(selectedArtist.first_viewed_at).toLocaleString()}
                              </Text>
                              <Text size="2">
                                <strong>Last viewed:</strong> {new Date(selectedArtist.last_viewed_at).toLocaleString()}
                              </Text>
                              <Text size="2">
                                <strong>Total views:</strong> {selectedArtist.view_count || 0}
                              </Text>
                            </Flex>
                          </Box>
                        ) : false && (
                          <Box p="3" style={{ backgroundColor: 'var(--orange-2)', borderRadius: '6px' }}>
                            <Flex align="center" gap="2">
                              <EyeNoneIcon size={16} />
                              <Text size="2" color="orange">
                                Invitation has not been viewed yet
                              </Text>
                            </Flex>
                          </Box>
                        )}

                        {selectedArtist.invitation_message && (
                          <Box>
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              Invitation Message:
                            </Text>
                            <Box p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: '6px' }}>
                              <Text size="2" style={{ lineHeight: '1.5' }}>
                                {selectedArtist.invitation_message}
                              </Text>
                            </Box>
                          </Box>
                        )}

                        {selectedArtist.producer_message && (
                          <Box>
                            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                              Producer Message:
                            </Text>
                            <Box p="3" style={{ backgroundColor: 'var(--blue-2)', borderRadius: '6px' }}>
                              <Text size="2" style={{ lineHeight: '1.5' }}>
                                {selectedArtist.producer_message}
                              </Text>
                            </Box>
                          </Box>
                        )}
                        
                        <Separator />
                        
                        <Flex gap="3">
                          <Button 
                            size="3" 
                            variant={reminderSent ? "solid" : "outline"}
                            color={reminderSent ? "green" : undefined}
                            style={{ flex: 1 }}
                            disabled={sendingReminder || reminderSent}
                            onClick={() => handleSendReminder(selectedArtist)}
                          >
                            {sendingReminder ? (
                              <Flex align="center" gap="2">
                                <Spinner loading size="1" />
                                Sending SMS...
                              </Flex>
                            ) : reminderSent ? (
                              `SMS sent to ${reminderPhoneUsed || 'phone'}`
                            ) : (
                              'Send Reminder'
                            )}
                          </Button>
                          <Button 
                            size="3" 
                            variant="outline" 
                            color="red"
                            onClick={() => handleWithdrawInvitation(selectedArtist)}
                          >
                            Withdraw Invitation
                          </Button>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                )}

                {/* Confirmation-specific content */}
                {artistModalType === 'confirmation' && selectedArtist && (
                  <Card>
                    <Box p="4">
                      <Heading size="4" mb="3">Confirmation Details</Heading>
                      <Flex direction="column" gap="3">
                        <Text size="2">
                          <strong>Confirmed:</strong> {new Date(selectedArtist.created_at).toLocaleString()}
                        </Text>
                        
                        <Box p="3" style={{ backgroundColor: 'var(--green-2)', borderRadius: '6px' }}>
                          <Flex align="center" gap="2">
                            <CheckCircledIcon size={16} />
                            <Text size="2" color="green">
                              Artist has completed all confirmation requirements
                            </Text>
                          </Flex>
                        </Box>

                        {selectedArtist.legal_agreement_signed && (
                          <Text size="2">
                            <strong>Legal Agreement:</strong> ✅ Signed
                          </Text>
                        )}
                        
                        {selectedArtist.promo_image_url && (
                          <Text size="2">
                            <strong>Promo Image:</strong> ✅ Submitted
                          </Text>
                        )}

                        {/* ABHQ Bio Section */}
                        <Box mt="3">
                          <Flex justify="between" align="center" mb="2">
                            <Text size="2" weight="medium">
                              <strong>ABHQ Bio:</strong>
                            </Text>
                            {!editingBio && (
                              <Button 
                                size="1" 
                                variant="soft"
                                onClick={() => setEditingBio(true)}
                              >
                                Edit
                              </Button>
                            )}
                          </Flex>
                          
                          {editingBio ? (
                            <Box>
                              <TextArea
                                value={bioText}
                                onChange={(e) => setBioText(e.target.value)}
                                placeholder="Enter ABHQ bio..."
                                rows={6}
                                style={{ width: '100%', marginBottom: '8px' }}
                              />
                              <Flex gap="2">
                                <Button 
                                  size="1" 
                                  onClick={saveBio}
                                  loading={bioSaving}
                                  disabled={bioSaving}
                                >
                                  Save
                                </Button>
                                <Button 
                                  size="1" 
                                  variant="soft" 
                                  onClick={cancelBioEdit}
                                  disabled={bioSaving}
                                >
                                  Cancel
                                </Button>
                              </Flex>
                            </Box>
                          ) : (
                            <>
                              {selectedArtist?.artist_profiles?.abhq_bio ? (
                                <Box p="3" style={{ backgroundColor: 'var(--green-2)', borderRadius: '6px' }}>
                                  <Text size="2" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {selectedArtist.artist_profiles.abhq_bio}
                                  </Text>
                                </Box>
                              ) : (
                                <Box p="3" style={{ backgroundColor: 'var(--red-2)', borderRadius: '6px' }}>
                                  <Text size="2" color="red">
                                    No ABHQ bio available
                                  </Text>
                                </Box>
                              )}
                            </>
                          )}
                        </Box>
                        
                        <Separator />
                        
                        <Flex gap="3">
                          <Button size="3" style={{ flex: 1 }}>
                            Assign to Round
                          </Button>
                          <Button size="3" variant="outline" color="gray">
                            View Full Details
                          </Button>
                        </Flex>
                      </Flex>
                    </Box>
                  </Card>
                )}
              </Flex>
            </Box>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Root>

      {/* Image Modal */}
      <Dialog.Root open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <Dialog.Content style={{ maxWidth: '90vw', maxHeight: '90vh', padding: 0 }}>
          <Dialog.Title style={{ padding: '1rem' }}>
            <Flex align="center" justify="between">
              <Text size="4" weight="bold">
                {selectedImage?.title || 'Sample Work'}
              </Text>
              <Dialog.Close>
                <Button variant="ghost" size="1">
                  <Cross2Icon />
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Title>
          
          {selectedImage && (
            <Box style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              height: 'calc(90vh - 120px)',
              width: '100%',
              overflow: 'hidden',
              padding: '1rem'
            }}>
              <img 
                src={selectedImage.image_url || selectedImage.compressed_url || selectedImage.original_url}
                alt={selectedImage.title || 'Sample work'}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%', 
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain'
                }}
              />
            </Box>
          )}
          
          {selectedImage?.description && (
            <Box p="4" style={{ backgroundColor: 'var(--gray-2)' }}>
              <Text size="2" color="gray">
                {selectedImage.description}
              </Text>
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Event Delete Modal */}
      <EventDeleteModal
        event={event}
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onDeleted={handleEventDeleted}
      />

      {/* Unpaid Paintings Modal */}
      <Dialog.Root open={unpaidModalOpen} onOpenChange={setUnpaidModalOpen}>
        <Dialog.Content maxWidth="900px">
          <Dialog.Title>Unpaid Paintings</Dialog.Title>
          <Dialog.Description size="2" mb="3">
            Paintings with bids but no recorded payment
          </Dialog.Description>
          <ScrollArea style={{ maxHeight: '60vh' }}>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Art Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Winning Bid</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Days Unpaid</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {postEventData?.unpaid_paintings?.list?.map(painting => (
                  <Table.Row key={painting.art_id}>
                    <Table.Cell>
                      <Text weight="bold">{painting.art_code}</Text>
                    </Table.Cell>
                    <Table.Cell>{painting.artist_name}</Table.Cell>
                    <Table.Cell>
                      {postEventData.auction_summary.currency_symbol}
                      {painting.winning_bid?.toFixed(2)}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="1" color="gray">{painting.payment_status}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={painting.days_since_bid > 7 ? 'red' : 'orange'}>
                        {painting.days_since_bid} days
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Root>

      {/* No Bid Paintings Modal */}
      <Dialog.Root open={noBidModalOpen} onOpenChange={(open) => {
        setNoBidModalOpen(open);
        if (!open) setSelectedNoBidPainting(null);
      }}>
        <Dialog.Content maxWidth="900px">
          <Dialog.Title>Paintings With No Bids</Dialog.Title>
          <Dialog.Description size="2" mb="3">
            These paintings received no bids during the auction
          </Dialog.Description>
          <ScrollArea style={{ maxHeight: '40vh' }}>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Image</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Art Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Artist</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Round</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Easel</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {postEventData?.no_bid_paintings?.list?.map(painting => (
                  <Table.Row
                    key={painting.art_id}
                    onClick={() => setSelectedNoBidPainting(painting)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedNoBidPainting?.art_id === painting.art_id ? 'var(--accent-3)' : undefined
                    }}
                  >
                    <Table.Cell>
                      {painting.image_url ? (
                        <Box
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            border: '1px solid var(--gray-6)'
                          }}
                        >
                          <img
                            src={painting.image_url}
                            alt={painting.art_code}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        </Box>
                      ) : (
                        <Text size="1" color="gray">No image</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text weight="bold">{painting.art_code}</Text>
                    </Table.Cell>
                    <Table.Cell>{painting.artist_name}</Table.Cell>
                    <Table.Cell>{painting.round}</Table.Cell>
                    <Table.Cell>{painting.easel}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </ScrollArea>

          {selectedNoBidPainting && (
            <Box mt="4">
              <Separator size="4" mb="3" />
              <Heading size="4" mb="3">Artwork Details - {selectedNoBidPainting.art_code}</Heading>
              <Flex gap="4" align="start">
                {selectedNoBidPainting.image_url && (
                  <Box style={{ flex: '0 0 300px' }}>
                    <img
                      src={selectedNoBidPainting.image_url}
                      alt={selectedNoBidPainting.art_code}
                      style={{
                        width: '100%',
                        height: 'auto',
                        borderRadius: '8px',
                        border: '1px solid var(--gray-6)'
                      }}
                    />
                  </Box>
                )}
                <Flex direction="column" gap="2" style={{ flex: 1 }}>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">Artist</Text>
                    <Text size="3" weight="bold">{selectedNoBidPainting.artist_name}</Text>
                  </Flex>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">Location</Text>
                    <Text size="3">Round {selectedNoBidPainting.round}, Easel {selectedNoBidPainting.easel}</Text>
                  </Flex>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">Status</Text>
                    <Badge color="gray">No Bids Received</Badge>
                  </Flex>
                </Flex>
              </Flex>
            </Box>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Artist Payment Detail Modal */}
      <Dialog.Root open={showArtistDetail} onOpenChange={setShowArtistDetail}>
        <Dialog.Content style={{ maxWidth: '1100px', maxHeight: '95vh', overflow: 'auto' }}>
          <Dialog.Title>
            {selectedArtistForPayment?.artist_name} - Payment Details
          </Dialog.Title>

          <Box style={{ maxHeight: 'none', padding: '0' }}>
            {selectedArtistForPayment && (
              <Flex direction="column" gap="4" mt="4">

                {/* Artist Info */}
                <Card>
                  <Heading size="3" mb="3">Artist Information</Heading>
                  <Flex direction="column" gap="2">
                    <Flex justify="between">
                      <Text weight="medium">Name:</Text>
                      <Text>{selectedArtistForPayment.artist_name}</Text>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Entry ID:</Text>
                      <Badge>{selectedArtistForPayment.entry_id}</Badge>
                    </Flex>
                    <Flex justify="between">
                      <Text weight="medium">Email:</Text>
                      <Text>{selectedArtistForPayment.email}</Text>
                    </Flex>
                    <Separator />
                    <Flex justify="between" align="center">
                      <Flex direction="column" gap="1">
                        <Text weight="medium">Manual Payments</Text>
                        {loadingLastEvent ? (
                          <Text size="1" color="gray">Loading event information...</Text>
                        ) : lastEventInfo ? (
                          <Flex direction="column" gap="1">
                            <Text size="1" color="gray">
                              Last Event: {lastEventInfo.event_eid} ({lastEventInfo.city_name})
                            </Text>
                            <Text size="1" weight="bold" color={lastEventInfo.days_since_event >= 14 ? "green" : "amber"}>
                              Days since event: {lastEventInfo.days_since_event}
                            </Text>
                          </Flex>
                        ) : (
                          <Text size="1" color="gray">No recent events found</Text>
                        )}
                      </Flex>
                      <Button
                        size="2"
                        variant="solid"
                        color={
                          selectedArtistForPayment.manual_payment_override
                            ? "green"
                            : lastEventInfo && lastEventInfo.days_since_event >= 14
                            ? "blue"
                            : "gray"
                        }
                        onClick={() => toggleManualPaymentOverride(selectedArtistForPayment.artist_id, !selectedArtistForPayment.manual_payment_override)}
                      >
                        {selectedArtistForPayment.manual_payment_override
                          ? "MANUALLY ENABLED"
                          : lastEventInfo && lastEventInfo.days_since_event >= 14
                          ? "AUTOMATICALLY ENABLED"
                          : "ENABLE EARLY"}
                      </Button>
                    </Flex>
                  </Flex>
                </Card>

                {/* Stripe Account Details */}
                {selectedArtistForPayment.stripe_recipient_id && (
                  <Card>
                    <Flex justify="between" align="center" mb="3">
                      <Heading size="3">Stripe Account Details</Heading>
                      <Button
                        size="1"
                        variant="soft"
                        loading={loadingStripe}
                        onClick={() => fetchStripeDetails(selectedArtistForPayment.stripe_recipient_id, selectedArtistForPayment.artist_id)}
                      >
                        <UpdateIcon width="14" height="14" />
                        Refresh
                      </Button>
                    </Flex>

                    {loadingStripe ? (
                      <Skeleton height="100px" />
                    ) : stripeDetails ? (
                      <Flex direction="column" gap="2">
                        <Flex justify="between">
                          <Text weight="medium">Account ID:</Text>
                          <Text style={{ fontFamily: 'monospace' }}>{stripeDetails.id}</Text>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Status:</Text>
                          <Flex gap="2">
                            {stripeDetails.charges_enabled && <Badge color="green">Charges</Badge>}
                            {stripeDetails.payouts_enabled && <Badge color="green">Payouts</Badge>}
                          </Flex>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Currency:</Text>
                          <Badge variant="outline">{stripeDetails.default_currency.toUpperCase()}</Badge>
                        </Flex>
                        <Flex justify="between">
                          <Text weight="medium">Verification:</Text>
                          <Badge color={stripeDetails.individual?.verification?.status === 'verified' ? 'green' : 'yellow'}>
                            {stripeDetails.individual?.verification?.status || 'Pending'}
                          </Badge>
                        </Flex>
                      </Flex>
                    ) : (
                      <Text color="gray">Click refresh to load Stripe details</Text>
                    )}
                  </Card>
                )}

                {/* Manual Payment Request */}
                {loadingManualPaymentRequest ? (
                  <Card>
                    <Skeleton height="80px" />
                  </Card>
                ) : manualPaymentRequest && manualPaymentRequest.has_request ? (
                  <Card>
                    <Flex direction="column" gap="3">
                      <Flex justify="between" align="center">
                        <Heading size="3">Manual Payment Request</Heading>
                        <Badge
                          color={
                            manualPaymentRequest.metadata.status === 'paid' ? 'green' :
                            manualPaymentRequest.metadata.status === 'approved' ? 'blue' :
                            manualPaymentRequest.metadata.status === 'rejected' ? 'red' :
                            'orange'
                          }
                        >
                          {manualPaymentRequest.metadata.status.toUpperCase()}
                        </Badge>
                      </Flex>

                      {/* Metadata - always visible */}
                      <Flex direction="column" gap="2">
                        <Flex justify="between">
                          <Text size="2" color="gray">Payment Method:</Text>
                          <Badge variant="outline">{manualPaymentRequest.metadata.payment_method || 'Not specified'}</Badge>
                        </Flex>
                        <Flex justify="between">
                          <Text size="2" color="gray">Requested Amount:</Text>
                          <Text size="2" weight="bold">
                            {manualPaymentRequest.metadata.requested_amount
                              ? `$${manualPaymentRequest.metadata.requested_amount.toFixed(2)} ${manualPaymentRequest.metadata.preferred_currency || 'USD'}`
                              : 'Not specified'}
                          </Text>
                        </Flex>
                        <Flex justify="between">
                          <Text size="2" color="gray">Country:</Text>
                          <Text size="2">{manualPaymentRequest.metadata.country_code || 'Not specified'}</Text>
                        </Flex>
                        <Flex justify="between">
                          <Text size="2" color="gray">Events:</Text>
                          <Text size="2">{manualPaymentRequest.metadata.events_referenced?.join(', ') || 'None'}</Text>
                        </Flex>
                        <Flex justify="between">
                          <Text size="2" color="gray">Submitted:</Text>
                          <Text size="2">{new Date(manualPaymentRequest.metadata.created_at).toLocaleDateString()}</Text>
                        </Flex>
                        {manualPaymentRequest.metadata.processed_at && (
                          <Flex justify="between">
                            <Text size="2" color="gray">Processed:</Text>
                            <Text size="2">{new Date(manualPaymentRequest.metadata.processed_at).toLocaleDateString()}</Text>
                          </Flex>
                        )}
                      </Flex>

                      {/* Reveal sensitive details */}
                      {!revealedPaymentDetails ? (
                        <Callout.Root color="orange">
                          <Callout.Icon>
                            <InfoCircledIcon />
                          </Callout.Icon>
                          <Callout.Text>
                            <Flex justify="between" align="center">
                              <Text size="2">
                                Banking details are hidden for security. Click to reveal and audit log the access.
                              </Text>
                              <Button
                                size="1"
                                variant="soft"
                                onClick={revealPaymentDetails}
                              >
                                Reveal Details
                              </Button>
                            </Flex>
                          </Callout.Text>
                        </Callout.Root>
                      ) : (
                        <Card variant="surface" style={{ backgroundColor: 'var(--yellow-2)', border: '1px solid var(--yellow-6)' }}>
                          <Flex direction="column" gap="2">
                            <Flex align="center" gap="2">
                              <Badge color="yellow">🔓 Sensitive Data Revealed</Badge>
                              <Text size="1" color="gray">(Audit logged)</Text>
                            </Flex>
                            <Separator />
                            <Box>
                              <Text size="2" weight="bold" mb="1" style={{ display: 'block' }}>Payment Details:</Text>
                              <Text size="2" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', display: 'block' }}>
                                {manualPaymentRequest.sensitive_details?.payment_details || 'No details provided'}
                              </Text>
                            </Box>
                            {manualPaymentRequest.sensitive_details?.admin_notes && (
                              <Box>
                                <Text size="2" weight="bold" mb="1" style={{ display: 'block' }}>Admin Notes:</Text>
                                <Text size="2" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>
                                  {manualPaymentRequest.sensitive_details.admin_notes}
                                </Text>
                              </Box>
                            )}
                          </Flex>
                        </Card>
                      )}
                    </Flex>
                  </Card>
                ) : null}

                {/* Account Ledger */}
                <Card>
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="3">Account Ledger</Heading>
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => fetchArtistAccountLedger()}
                      loading={loadingLedger}
                    >
                      <UpdateIcon width="12" height="12" />
                      Refresh
                    </Button>
                  </Flex>

                  {loadingLedger ? (
                    <Skeleton height="150px" />
                  ) : accountLedger ? (
                    <Flex direction="column" gap="4">
                      {/* Account Summary */}
                      <Card variant="ghost">
                        <Flex justify="between" align="center">
                          <Box>
                            <Text size="2" color="gray">Current Balance</Text>
                            <Text size="4" weight="bold" color={accountLedger.summary.current_balance >= 0 ? 'green' : 'red'}>
                              {formatCurrency(accountLedger.summary.current_balance, accountLedger.summary.primary_currency)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Total Credits</Text>
                            <Text size="3" weight="medium" color="green">
                              +${accountLedger.summary.total_credits.toFixed(2)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Total Debits</Text>
                            <Text size="3" weight="medium" color="red">
                              -${accountLedger.summary.total_debits.toFixed(2)}
                            </Text>
                          </Box>
                          <Box style={{ textAlign: 'right' }}>
                            <Text size="2" color="gray">Entries</Text>
                            <Text size="3" weight="medium">
                              {accountLedger.summary.entry_count}
                            </Text>
                          </Box>
                        </Flex>
                      </Card>

                      {/* Ledger Entries */}
                      <Box>
                        <ScrollArea style={{ height: '300px' }}>
                          <Table.Root>
                            <Table.Header>
                              <Table.Row>
                                <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Amount</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Currency</Table.ColumnHeaderCell>
                                <Table.ColumnHeaderCell>Balance</Table.ColumnHeaderCell>
                              </Table.Row>
                            </Table.Header>
                            <Table.Body>
                              {accountLedger.ledger.map((entry) => (
                                <Table.Row key={entry.id}>
                                  <Table.Cell>
                                    <Text size="2" color="gray">
                                      {new Date(entry.date).toLocaleDateString()}
                                    </Text>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge
                                      color={
                                        entry.type === 'credit' ? 'green' :
                                        entry.type === 'debit' ? 'red' : 'blue'
                                      }
                                      variant="soft"
                                    >
                                      {entry.category}
                                    </Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Flex direction="column" gap="1">
                                      <Text size="2" weight="medium">
                                        {entry.description}
                                      </Text>
                                      {entry.art_info && (
                                        <Text size="1" color="gray">
                                          {entry.art_info.event_name} • {entry.art_info.art_code}
                                        </Text>
                                      )}
                                    </Flex>
                                  </Table.Cell>
                                  <Table.Cell>
                                    {entry.amount !== undefined ? (
                                      <Text
                                        size="2"
                                        weight="medium"
                                        color={entry.type === 'credit' ? 'green' : 'red'}
                                      >
                                        {entry.type === 'credit' ? '+' : '-'}${entry.amount.toFixed(2)}
                                      </Text>
                                    ) : (
                                      <Text size="2" color="gray">—</Text>
                                    )}
                                  </Table.Cell>
                                  <Table.Cell>
                                    <Badge
                                      variant="outline"
                                      size="1"
                                      color={entry.currency === 'USD' ? 'blue' : 'orange'}
                                    >
                                      {entry.currency || 'USD'}
                                    </Badge>
                                  </Table.Cell>
                                  <Table.Cell>
                                    {entry.balance_after !== undefined ? (
                                      <Text
                                        size="2"
                                        weight="medium"
                                        color={entry.balance_after >= 0 ? 'green' : 'red'}
                                      >
                                        ${entry.balance_after.toFixed(2)}
                                      </Text>
                                    ) : (
                                      <Text size="2" color="gray">—</Text>
                                    )}
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Root>
                        </ScrollArea>
                      </Box>
                    </Flex>
                  ) : (
                    <Text color="gray">Click refresh to load account ledger</Text>
                  )}
                </Card>

                {/* Manual Payment Button */}
                <Flex justify="end" gap="2">
                  <Button
                    variant="solid"
                    color="blue"
                    onClick={() => setShowManualPayment(true)}
                  >
                    <PlusIcon width="16" height="16" />
                    Record Manual Payment
                  </Button>
                </Flex>
              </Flex>
            )}
          </Box>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Manual Payment Modal */}
      <Dialog.Root open={showManualPayment} onOpenChange={setShowManualPayment}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Record Manual Payment</Dialog.Title>
          <Dialog.Description>
            Record a manual payment made to {selectedArtistForPayment?.artist_name} outside of the Stripe system.
          </Dialog.Description>

          <Flex direction="column" gap="3" mt="4">
            <label>
              <Text size="2" weight="medium" mb="1">Amount</Text>
              <TextField.Root
                value={manualPaymentAmount}
                onChange={(e) => setManualPaymentAmount(e.target.value)}
                placeholder="0.00"
                type="number"
                step="0.01"
              />
            </label>

            <label>
              <Text size="2" weight="medium" mb="1">Payment Method</Text>
              <Select.Root value={manualPaymentMethod} onValueChange={setManualPaymentMethod}>
                <Select.Trigger style={{ width: '100%' }} />
                <Select.Content>
                  <Select.Item value="bank_transfer">Bank Transfer</Select.Item>
                  <Select.Item value="check">Check</Select.Item>
                  <Select.Item value="cash">Cash</Select.Item>
                  <Select.Item value="paypal">PayPal</Select.Item>
                  <Select.Item value="other">Other</Select.Item>
                </Select.Content>
              </Select.Root>
            </label>

            <label>
              <Text size="2" weight="medium" mb="1">Notes (Optional)</Text>
              <TextArea
                value={manualPaymentNotes}
                onChange={(e) => setManualPaymentNotes(e.target.value)}
                placeholder="Additional notes about this payment..."
                rows={3}
              />
            </label>
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Cancel</Button>
            </Dialog.Close>
            <Button
              onClick={handleManualPayment}
              disabled={!manualPaymentAmount || parseFloat(manualPaymentAmount) <= 0}
              loading={submittingManualPayment}
            >
              Record Payment
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Artwork Detail Modal - Shows bidders and allows sending reminders/offers */}
      <Dialog.Root open={showArtworkDetail} onOpenChange={setShowArtworkDetail}>
        <Dialog.Content style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
          <Dialog.Title>
            Artwork Details - {selectedArtworkForBids?.art_code}
          </Dialog.Title>
          <Dialog.Description>
            View bidders and send payment reminders or offers
          </Dialog.Description>

          {selectedArtworkForBids && (
            <Box mt="4">
              {/* Artwork Info Card */}
              <Card mb="4">
                <Flex direction="column" gap="2" p="3">
                  <Flex justify="between" align="center">
                    <Text size="3" weight="bold">{selectedArtworkForBids.art_code}</Text>
                    <Badge color={selectedArtworkForBids.is_paid ? 'green' : 'orange'} size="2">
                      {selectedArtworkForBids.is_paid ? 'PAID' : 'UNPAID'}
                    </Badge>
                  </Flex>
                  <Flex gap="4">
                    <Text size="2" color="gray">Round: {selectedArtworkForBids.round}</Text>
                    <Text size="2" color="gray">Easel: {selectedArtworkForBids.easel}</Text>
                    <Text size="2" weight="bold">
                      {selectedArtworkForBids.is_paid ?
                        `Sale Price: $${selectedArtworkForBids.sale_price?.toFixed(2)}` :
                        `Winning Bid: $${selectedArtworkForBids.winning_bid?.toFixed(2)}`
                      }
                    </Text>
                  </Flex>
                  {selectedArtworkForBids.is_paid && selectedArtworkForBids.payment_in && (
                    <Text size="1" color="green">
                      Paid {new Date(selectedArtworkForBids.payment_in.paid_at).toLocaleDateString()} via {selectedArtworkForBids.payment_in.method}
                    </Text>
                  )}
                </Flex>
              </Card>

              {/* Mark as Paid Button - Only show if artwork is unpaid */}
              {!selectedArtworkForBids.is_paid && selectedArtworkForBids.winning_bid > 0 && (
                <Card mb="4">
                  <Flex direction="column" gap="3" p="3">
                    <Text size="2" weight="bold">Collect Payment</Text>
                    <Button
                      onClick={() => {
                        // Calculate suggested values
                        const winningBid = selectedArtworkForBids.winning_bid || 0;
                        const taxRate = selectedArtworkForBids.tax || 0;
                        const suggestedTax = Math.round((winningBid * taxRate / 100) * 100) / 100;
                        const suggestedTotal = winningBid + suggestedTax;

                        setPaymentFormData({
                          actualAmount: suggestedTotal.toString(),
                          actualTax: suggestedTax.toString(),
                          paymentMethod: 'cash',
                          collectionNotes: ''
                        });

                        setShowPaymentModal(true);
                      }}
                    >
                      Mark as Paid
                    </Button>
                  </Flex>
                </Card>
              )}

              {/* Bidders List */}
              <Text size="2" weight="bold" mb="2" style={{ display: 'block' }}>
                All Bidders ({artworkBids.length})
              </Text>

              {loadingArtworkBids ? (
                <Flex justify="center" p="4">
                  <Text color="gray">Loading bidders...</Text>
                </Flex>
              ) : artworkBids.length === 0 ? (
                <Flex justify="center" p="4">
                  <Text color="gray">No bids found for this artwork</Text>
                </Flex>
              ) : (
                <Flex direction="column" gap="2">
                  {artworkBids.map((bid, index) => (
                    <Card key={bid.id}>
                      <Flex direction="column" gap="2" p="3">
                        <Flex justify="between" align="start">
                          <Flex direction="column" gap="1">
                            <Flex align="center" gap="2">
                              {index === 0 && (
                                <Badge color="green" size="1">WINNER</Badge>
                              )}
                              <Text size="3" weight="bold">
                                {bid.bidder?.first_name ?
                                  `${bid.bidder.first_name} ${bid.bidder.last_name || ''}`.trim() :
                                  bid.bidder?.name || bid.bidder?.nickname || bid.bidder?.email?.split('@')[0] || 'Unknown Bidder'
                                }
                              </Text>
                            </Flex>

                            {/* Contact Info */}
                            <Flex direction="column" gap="0">
                              {bid.bidder?.email && (
                                <Text size="2" color="gray">📧 {bid.bidder.email}</Text>
                              )}
                              {bid.bidder?.phone && (
                                <Text size="2" color="gray">📱 {bid.bidder.phone}</Text>
                              )}
                            </Flex>
                          </Flex>

                          <Flex direction="column" align="end" gap="1">
                            <Text size="4" weight="bold" color="green">
                              ${bid.amount.toFixed(2)}
                            </Text>
                            <Text size="1" color="gray">
                              {new Date(bid.created_at).toLocaleString()}
                            </Text>
                          </Flex>
                        </Flex>

                        {/* Action Buttons */}
                        <Flex gap="2" mt="2">
                          {index === 0 ? (
                            // Winner gets payment reminder button
                            <>
                              <Button
                                size="2"
                                onClick={() => handleSendPaymentReminder(selectedArtworkForBids.art_id, bid.bidder)}
                                disabled={paymentReminderLoading || selectedArtworkForBids.is_paid}
                              >
                                {paymentReminderLoading ? 'Sending...' :
                                 lastReminderSent[selectedArtworkForBids.art_id] ?
                                 'Send Another Reminder' : 'Send Payment Reminder'}
                              </Button>
                              <Button
                                size="2"
                                variant="soft"
                                onClick={() => fetchReminderHistory(selectedArtworkForBids.art_id)}
                              >
                                Reminder History
                              </Button>
                            </>
                          ) : (
                            // Non-winners get offer button
                            <>
                              <Button
                                size="2"
                                color="orange"
                                onClick={() => setShowOfferConfirm({ bid: { id: bid.id, amount: bid.amount }, bidder: bid.bidder })}
                                disabled={selectedArtworkForBids.is_paid || activeOffers[selectedArtworkForBids.art_id]?.bidder_id === bid.bidder?.id}
                              >
                                {activeOffers[selectedArtworkForBids.art_id]?.bidder_id === bid.bidder?.id ?
                                 'Offer Active' : 'Create Offer'}
                              </Button>
                              <Button
                                size="2"
                                variant="soft"
                                onClick={() => fetchOfferHistory(selectedArtworkForBids.art_id)}
                              >
                                Offer History
                              </Button>
                            </>
                          )}
                        </Flex>

                        {/* Show active offer info if exists for this bidder */}
                        {activeOffers[selectedArtworkForBids.art_id]?.bidder_id === bid.bidder?.id && (
                          <Text size="1" color="orange" mt="1">
                            Active offer expires: {new Date(activeOffers[selectedArtworkForBids.art_id].expires_at).toLocaleString()}
                          </Text>
                        )}

                        {/* Show last reminder sent for winner */}
                        {index === 0 && lastReminderSent[selectedArtworkForBids.art_id] && (
                          <Text size="1" color="green" mt="1">
                            Last reminder sent: {new Date(lastReminderSent[selectedArtworkForBids.art_id]).toLocaleString()}
                          </Text>
                        )}
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Box>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Offer Confirmation Dialog */}
      <Dialog.Root open={!!showOfferConfirm} onOpenChange={(open) => !open && setShowOfferConfirm(null)}>
        <Dialog.Content style={{ maxWidth: '450px' }}>
          <Dialog.Title>Create Timed Offer</Dialog.Title>
          <Dialog.Description>
            Create a 48-hour offer for {showOfferConfirm?.bidder?.first_name || 'this bidder'} to purchase this artwork?
          </Dialog.Description>

          {showOfferConfirm && (
            <Box mt="4">
              <Card>
                <Flex direction="column" gap="2" p="3">
                  <Text size="2">
                    <strong>Bidder:</strong> {showOfferConfirm.bidder?.first_name || 'Unknown'} {showOfferConfirm.bidder?.last_name || ''}
                  </Text>
                  <Text size="2">
                    <strong>Bid Amount:</strong> ${showOfferConfirm.bid?.amount?.toFixed(2)}
                  </Text>
                  <Text size="2">
                    <strong>Email:</strong> {showOfferConfirm.bidder?.email || 'N/A'}
                  </Text>
                  <Text size="2">
                    <strong>Phone:</strong> {showOfferConfirm.bidder?.phone || 'N/A'}
                  </Text>
                </Flex>
              </Card>

              <Text size="2" color="gray" mt="3" style={{ display: 'block' }}>
                This will send an email and SMS notification to the bidder with a 48-hour deadline to purchase the artwork.
              </Text>
            </Box>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Button
              variant="soft"
              color="gray"
              onClick={() => setShowOfferConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              color="orange"
              onClick={handleCreateOffer}
              disabled={offerLoading}
            >
              {offerLoading ? 'Sending...' : 'Send Offer'}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Reminder History Dialog */}
      <Dialog.Root open={!!showReminderHistory} onOpenChange={(open) => !open && setShowReminderHistory(null)}>
        <Dialog.Content style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
          <Dialog.Title>Payment Reminder History</Dialog.Title>
          <Dialog.Description>
            All payment reminders sent for this artwork
          </Dialog.Description>

          <Box mt="4">
            {artworkHistoryLoading ? (
              <Flex justify="center" p="4">
                <Text color="gray">Loading history...</Text>
              </Flex>
            ) : reminderHistory?.reminders?.length > 0 ? (
              <Flex direction="column" gap="2">
                {reminderHistory.reminders.map((reminder, index) => (
                  <Card key={index}>
                    <Flex direction="column" gap="1" p="3">
                      <Text size="2" weight="bold">
                        {new Date(reminder.sent_at).toLocaleString()}
                      </Text>
                      <Text size="2" color="gray">
                        Method: {reminder.method || 'SMS'}
                      </Text>
                      {reminder.admin_note && (
                        <Text size="1" color="gray">
                          Note: {reminder.admin_note}
                        </Text>
                      )}
                    </Flex>
                  </Card>
                ))}
              </Flex>
            ) : (
              <Text color="gray">No payment reminders sent yet</Text>
            )}
          </Box>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Offer History Dialog */}
      <Dialog.Root open={!!showOfferHistory} onOpenChange={(open) => !open && setShowOfferHistory(null)}>
        <Dialog.Content style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
          <Dialog.Title>Offer History</Dialog.Title>
          <Dialog.Description>
            All offers sent for this artwork
          </Dialog.Description>

          <Box mt="4">
            {artworkHistoryLoading ? (
              <Flex justify="center" p="4">
                <Text color="gray">Loading history...</Text>
              </Flex>
            ) : offerHistory?.offers?.length > 0 ? (
              <Flex direction="column" gap="2">
                {offerHistory.offers.map((offer, index) => (
                  <Card key={index}>
                    <Flex direction="column" gap="1" p="3">
                      <Flex justify="between" align="center">
                        <Text size="2" weight="bold">
                          {offer.bidder_name || 'Unknown Bidder'}
                        </Text>
                        <Badge
                          color={offer.status === 'active' ? 'green' :
                                 offer.status === 'expired' ? 'gray' :
                                 offer.status === 'accepted' ? 'blue' : 'red'}
                        >
                          {offer.status?.toUpperCase()}
                        </Badge>
                      </Flex>
                      <Text size="2" color="gray">
                        Sent: {new Date(offer.sent_at).toLocaleString()}
                      </Text>
                      <Text size="2" color="gray">
                        Expires: {new Date(offer.expires_at).toLocaleString()}
                      </Text>
                      <Text size="2" weight="bold">
                        Amount: ${offer.amount?.toFixed(2)}
                      </Text>
                      {offer.admin_note && (
                        <Text size="1" color="gray">
                          Note: {offer.admin_note}
                        </Text>
                      )}
                    </Flex>
                  </Card>
                ))}
              </Flex>
            ) : (
              <Text color="gray">No offers sent yet</Text>
            )}
          </Box>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Payment Invitation Modal */}
      <Dialog.Root open={showPaymentInviteModal} onOpenChange={(open) => {
        setShowPaymentInviteModal(open);
        if (!open) {
          setSelectedArtistForInvite(null);
          setInviteType('email');
          setAdminNote('');
        }
      }}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Send Payment Setup Invitation</Dialog.Title>
          <Dialog.Description>
            Send a payment setup invitation to {selectedArtistForInvite?.artist_name}
          </Dialog.Description>

          {selectedArtistForInvite && (
            <Flex direction="column" gap="4" mt="4">
              {/* Artist Info */}
              <Card>
                <Flex direction="column" gap="2" p="3">
                  <Text size="2"><strong>Artist:</strong> {selectedArtistForInvite.artist_name}</Text>
                  <Text size="2"><strong>Email:</strong> {selectedArtistForInvite.email}</Text>
                  {selectedArtistForInvite.phone && (
                    <Text size="2"><strong>Phone:</strong> {selectedArtistForInvite.phone}</Text>
                  )}
                </Flex>
              </Card>

              {/* Invitation Type */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Invitation Method
                </Text>
                <Flex gap="2">
                  <Button
                    variant={inviteType === 'email' ? 'solid' : 'soft'}
                    onClick={() => setInviteType('email')}
                    disabled={!selectedArtistForInvite.email}
                  >
                    Email
                  </Button>
                  <Button
                    variant={inviteType === 'sms' ? 'solid' : 'soft'}
                    onClick={() => setInviteType('sms')}
                    disabled={!selectedArtistForInvite.phone}
                  >
                    SMS
                  </Button>
                </Flex>
              </Box>

              {/* Admin Note */}
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Admin Note (Optional)
                </Text>
                <Text size="1" color="gray" mb="2" style={{ display: 'block' }}>
                  This note will appear in <strong>bold at the top</strong> of the email or SMS message
                </Text>
                <TextArea
                  placeholder="e.g. 'Please set up your account by Friday so we can process payments.'"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                />
              </Box>
            </Flex>
          )}

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray" disabled={sendingPaymentInvite}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={handleSendPaymentInvite}
              disabled={sendingPaymentInvite || !inviteType}
            >
              {sendingPaymentInvite ? 'Sending...' : `Send ${inviteType === 'email' ? 'Email' : 'SMS'}`}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* Payment Collection Modal */}
      <Dialog.Root open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Collect Payment</Dialog.Title>

          {selectedArtworkForBids && (
            <Flex direction="column" gap="4" mt="3">
              {/* Artwork Summary */}
              <Card size="2" style={{ backgroundColor: 'var(--gray-2)' }}>
                <Flex direction="column" gap="2">
                  <Text size="3" weight="bold">
                    Art Code: {selectedArtworkForBids.art_code}
                  </Text>
                  <Text size="2" color="gray">
                    Round {selectedArtworkForBids.round}, Easel {selectedArtworkForBids.easel}
                  </Text>
                  <Text size="2" weight="medium">
                    Winning Bid: ${selectedArtworkForBids.winning_bid?.toFixed(2) || '0.00'}
                  </Text>
                </Flex>
              </Card>

              {/* Payment Form */}
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Actual Amount Collected *
                  </Text>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentFormData.actualAmount}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, actualAmount: e.target.value }))}
                    placeholder="Enter total amount collected"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)'
                    }}
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Tax Amount Collected
                  </Text>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentFormData.actualTax}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, actualTax: e.target.value }))}
                    placeholder="Enter tax amount collected"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)'
                    }}
                  />
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Payment Method *
                  </Text>
                  <Select.Root
                    value={paymentFormData.paymentMethod}
                    onValueChange={(value) => setPaymentFormData(prev => ({ ...prev, paymentMethod: value }))}
                  >
                    <Select.Trigger style={{ width: '100%' }} />
                    <Select.Content>
                      <Select.Item value="cash">Cash</Select.Item>
                      <Select.Item value="card">Card</Select.Item>
                      <Select.Item value="etransfer">E-Transfer</Select.Item>
                      <Select.Item value="check">Check</Select.Item>
                      <Select.Item value="other">Other</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Collection Notes
                  </Text>
                  <textarea
                    value={paymentFormData.collectionNotes}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, collectionNotes: e.target.value }))}
                    placeholder="Any additional notes about this payment"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-6)',
                      backgroundColor: 'var(--gray-1)',
                      color: 'var(--gray-12)',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </Box>
              </Flex>

              {/* Action Buttons */}
              <Flex gap="3" justify="end" mt="2">
                <Button variant="soft" color="gray" onClick={() => setShowPaymentModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="solid"
                  disabled={!paymentFormData.actualAmount}
                  onClick={async () => {
                    try {
                      const actualAmount = parseFloat(paymentFormData.actualAmount);
                      const actualTax = parseFloat(paymentFormData.actualTax) || 0;

                      if (isNaN(actualAmount) || actualAmount <= 0) {
                        alert('Please enter a valid amount collected');
                        return;
                      }

                      const { data: { user } } = await supabase.auth.getUser();
                      const adminPhone = user?.phone || 'admin';

                      // Call the admin function to mark as paid
                      const { data, error } = await supabase
                        .rpc('admin_update_art_status', {
                          p_art_code: selectedArtworkForBids.art_code,
                          p_new_status: 'paid',
                          p_admin_phone: adminPhone,
                          p_actual_amount_collected: actualAmount,
                          p_actual_tax_collected: actualTax || null,
                          p_payment_method: paymentFormData.paymentMethod,
                          p_collection_notes: paymentFormData.collectionNotes || null
                        });

                      if (error) throw error;

                      if (data?.success) {
                        // Refresh event data
                        const eventData = await fetchEventDetail();
                        await fetchArtistData(0, eventData);
                        setShowPaymentModal(false);
                        setShowArtworkDetail(false);
                        alert(`Payment recorded: $${actualAmount} via ${paymentFormData.paymentMethod} by ${adminPhone}`);
                      } else {
                        throw new Error(data?.error || 'Failed to record payment');
                      }
                    } catch (error) {
                      console.error('Error recording payment:', error);
                      alert('Failed to record payment: ' + error.message);
                    }
                  }}
                >
                  Record Payment
                </Button>
              </Flex>
            </Flex>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
};

export default EventDetail;