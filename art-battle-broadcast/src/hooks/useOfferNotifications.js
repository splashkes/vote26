/**
 * React Hook for Artwork Offer Real-time Notifications
 * Listens for offer creation, expiration, and payment race events
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for managing offer and payment race notifications
 * @param {string} artId - Artwork ID to monitor
 * @param {function} onOfferChange - Callback when offer status changes
 * @param {function} onPaymentRaceUpdate - Callback for payment race updates
 */
export const useOfferNotifications = (artId, onOfferChange, onPaymentRaceUpdate) => {
  const { person } = useAuth();
  const channelRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Use refs to store stable references to callback functions
  const onOfferChangeRef = useRef(onOfferChange);
  const onPaymentRaceUpdateRef = useRef(onPaymentRaceUpdate);

  // Update refs when callbacks change
  useEffect(() => {
    onOfferChangeRef.current = onOfferChange;
  }, [onOfferChange]);

  useEffect(() => {
    onPaymentRaceUpdateRef.current = onPaymentRaceUpdate;
  }, [onPaymentRaceUpdate]);

  useEffect(() => {
    if (!artId || !person?.id) {
      return;
    }

    console.log(`🎯 [OFFER-NOTIFICATIONS] Setting up listeners for art ${artId}`);
    setConnectionStatus('connecting');

    // Create channel for offer notifications
    const channelName = `offer_notifications_${artId}_${person.id}`;
    const channel = supabase.channel(channelName);

    // Listen for artwork offer changes
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'artwork_offers',
      filter: `art_id=eq.${artId}`
    }, (payload) => {
      console.log(`🎯 [OFFER-NOTIFICATIONS] Artwork offer change:`, payload);

      const { eventType, new: newRecord, old: oldRecord } = payload;

      // Check if this affects the current user
      const affectsUser =
        (newRecord?.offered_to_person_id === person.id) ||
        (oldRecord?.offered_to_person_id === person.id);

      if (affectsUser && onOfferChangeRef.current) {
        onOfferChangeRef.current({
          type: eventType.toLowerCase(),
          offer: newRecord || oldRecord,
          isForCurrentUser: true
        });
      }

      // Notify about race condition changes for all users
      if (onPaymentRaceUpdateRef.current) {
        onPaymentRaceUpdateRef.current({
          type: 'offer_change',
          eventType: eventType.toLowerCase(),
          artId: artId,
          timestamp: Date.now()
        });
      }
    });

    // Listen for payment completion notifications
    channel.on('broadcast', { event: 'payment_completed' }, (payload) => {
      console.log(`💰 [OFFER-NOTIFICATIONS] Payment completed:`, payload);

      if (payload.payload?.art_id === artId) {
        if (onPaymentRaceUpdateRef.current) {
          onPaymentRaceUpdateRef.current({
            type: 'payment_completed',
            ...payload.payload,
            timestamp: Date.now()
          });
        }
      }
    });

    // Listen for offer broadcasts from database triggers
    channel.on('broadcast', { event: 'artwork_offer_changed' }, (payload) => {
      console.log(`🎯 [OFFER-NOTIFICATIONS] Offer broadcast:`, payload);

      const data = payload.payload || payload;
      if (data.art_id === artId) {
        // Check if this affects the current user
        const affectsUser = data.offered_to_person_id === person.id;

        if (affectsUser && onOfferChangeRef.current) {
          onOfferChangeRef.current({
            type: data.type?.toLowerCase() || 'update',
            offer: {
              id: data.id,
              art_id: data.art_id,
              offered_to_person_id: data.offered_to_person_id,
              status: data.status,
              offered_amount: data.offered_amount
            },
            isForCurrentUser: true
          });
        }

        // Always notify about race condition changes
        if (onPaymentRaceUpdateRef.current) {
          onPaymentRaceUpdateRef.current({
            type: 'offer_broadcast',
            ...data,
            timestamp: Date.now()
          });
        }
      }
    });

    // Listen for auction winner broadcasts (when user wins an auction)
    channel.on('broadcast', { event: 'auction_winner' }, (payload) => {
      console.log(`🏆 [OFFER-NOTIFICATIONS] Auction winner broadcast:`, payload);

      const data = payload.payload || payload;
      if (data.art_id === artId && data.winner_person_id === person.id) {
        console.log(`🎉 [OFFER-NOTIFICATIONS] Current user won auction for art ${artId}!`);

        // Notify PaymentButton to show winner modal
        if (onPaymentRaceUpdateRef.current) {
          onPaymentRaceUpdateRef.current({
            type: 'auction_status_change',
            is_winning_bidder: true,
            winning_amount: data.winning_amount,
            currency: data.currency,
            art_id: data.art_id,
            art_code: data.art_code,
            new_status: data.new_status,
            timestamp: Date.now()
          });
        }
      }
    });

    // Subscribe and track connection status
    channel.subscribe((status) => {
      console.log(`🎯 [OFFER-NOTIFICATIONS] Channel status: ${status}`);
      setConnectionStatus(status);
    });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      console.log(`🎯 [OFFER-NOTIFICATIONS] Cleaning up listeners for art ${artId}`);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setConnectionStatus('disconnected');
    };
  }, [artId, person?.id]); // Removed callback dependencies to prevent infinite loops

  return {
    connectionStatus,
    isConnected: connectionStatus === 'SUBSCRIBED'
  };
};