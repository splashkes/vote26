import { useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export const useCacheInvalidation = (eventId, onInvalidate) => {
  useEffect(() => {
    if (!eventId) return
    
    const channel = supabase.channel(`cache-invalidate-${eventId}`)
      .on('broadcast', { event: 'votes_changed' }, (payload) => {
        console.log('Vote change detected:', payload)
        onInvalidate?.({ type: 'votes', ...payload })
      })
      .on('broadcast', { event: 'bids_changed' }, (payload) => {
        console.log('Bid change detected:', payload)
        onInvalidate?.({ type: 'bids', ...payload })
      })
      .on('broadcast', { event: 'art_changed' }, (payload) => {
        console.log('Art change detected:', payload)
        onInvalidate?.({ type: 'art', ...payload })
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, onInvalidate])
}

export const useEventDataRefresh = (eventId, refreshCallback) => {
  useCacheInvalidation(eventId, async (notification) => {
    console.log(`Cache invalidation received for ${eventId}:`, notification.type)
    
    if (refreshCallback) {
      await refreshCallback(notification)
    }
  })
}