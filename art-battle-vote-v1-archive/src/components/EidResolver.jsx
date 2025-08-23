import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import LoadingScreen from './LoadingScreen';

const EidResolver = () => {
  const { eid, tab } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const resolveEidToEventId = async () => {
      try {
        // Look up the event by EID to get the UUID (case insensitive)
        const { data: event, error } = await supabase
          .from('events')
          .select('id')
          .ilike('eid', eid)
          .single();

        if (error || !event) {
          console.error('Event not found for EID:', eid, error);
          navigate('/');
          return;
        }

        // Redirect to the legacy route format using window.location to preserve hash
        const targetPath = tab 
          ? `/event/${event.id}#${tab}` 
          : `/event/${event.id}`;
        
        // Use window.location.replace to ensure hash is preserved
        window.location.replace(targetPath);
        
      } catch (error) {
        console.error('Error resolving EID:', error);
        navigate('/');
      }
    };

    if (eid) {
      resolveEidToEventId();
    }
  }, [eid, tab, navigate]);

  return <LoadingScreen />;
};

export default EidResolver;