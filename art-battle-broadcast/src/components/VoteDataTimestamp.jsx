import { useState, useEffect } from 'react';
import { Box, Text, Badge, Flex } from '@radix-ui/themes';

/**
 * Displays when vote data was last updated with live countdown
 */
const VoteDataTimestamp = ({ timestampData }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!timestampData || !timestampData.generated_at) {
    return null;
  }

  // Calculate age from when the data was generated on the server
  const generatedTime = new Date(timestampData.generated_at).getTime();
  const ageMs = currentTime - generatedTime;
  const ageSeconds = Math.floor(ageMs / 1000);

  // Format the generation time
  const generatedAt = new Date(timestampData.generated_at);
  const timeString = generatedAt.toLocaleTimeString();

  // Create age display
  const getAgeDisplay = (seconds) => {
    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s ago`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m ago`;
    }
  };

  // Color based on age
  const getAgeColor = (seconds) => {
    if (seconds <= 15) return 'green';   // Fresh data
    if (seconds <= 30) return 'yellow';  // Slightly old
    if (seconds <= 60) return 'orange';  // Getting old
    return 'red';                        // Stale data
  };

  return (
    <Flex align="center" gap="3" style={{ 
      padding: '8px 12px',
      backgroundColor: 'var(--gray-2)',
      borderRadius: '6px',
      fontSize: '14px'
    }}>
      <Text size="2" color="gray">
        📊 Data generated: {timeString}
      </Text>
      <Badge color={getAgeColor(ageSeconds)} size="2">
        {getAgeDisplay(ageSeconds)}
      </Badge>
    </Flex>
  );
};

export default VoteDataTimestamp;