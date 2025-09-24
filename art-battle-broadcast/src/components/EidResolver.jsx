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

        // Navigate using React Router to prevent component disruption
        const targetPath = `/event/${event.id}`;

        if (tab) {
          // For tab navigation, use React Router navigate and set hash
          navigate(targetPath, { replace: true });
          // Set hash after navigation to preserve tab state
          setTimeout(() => {
            window.location.hash = tab;
          }, 0);
        } else {
          navigate(targetPath, { replace: true });
        }
        
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