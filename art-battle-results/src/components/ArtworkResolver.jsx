import { useParams } from 'react-router-dom';
import EventResults from './EventResults';
import ArtworkDisplay from './ArtworkDisplay';

function ArtworkResolver() {
  const { artworkId } = useParams();
  
  // Check if this is an artwork (contains two hyphens) or an event (no hyphens or one hyphen)
  const parts = artworkId ? artworkId.split('-') : [];
  
  // AB2900-3-1 would have 3 parts: ["AB2900", "3", "1"]
  // AB2900 would have 1 part: ["AB2900"]
  const isArtwork = parts.length >= 3;
  
  if (isArtwork) {
    // Parse artwork ID: AB2900-3-1
    const eventId = parts[0];
    const round = parts[1];
    const easel = parts[2];
    
    // Pass the parsed values as props to ArtworkDisplay
    return <ArtworkDisplay eventId={eventId} round={round} easel={easel} />;
  } else {
    // It's an event ID: AB2900
    const eventId = artworkId;
    
    // Pass the eventId as props to EventResults
    return <EventResults eventId={eventId} />;
  }
}

export default ArtworkResolver;