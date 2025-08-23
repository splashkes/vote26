import { useState, useEffect } from 'react';
import { Flex, Box, Text, Progress } from '@radix-ui/themes';

const LoadingScreen = ({ message = 'Loading...' }) => {
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading events...');
  
  const messages = [
    'Loading events...',
    'Loading artists...',
    'Loading artworks...',
    'Loading votes...',
    'Preparing gallery...',
    'Almost ready...'
  ];

  useEffect(() => {
    // Cycle through loading messages
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setLoadingMessage(messages[messageIndex]);
    }, 800);

    // Simulate progress - never actually reach 100%
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) {
          // Oscillate between 85-95% when almost done
          return 85 + Math.random() * 10;
        }
        // Faster initial progress, then slow down
        const increment = prev < 40 ? 12 : prev < 70 ? 6 : prev < 85 ? 3 : 1;
        return Math.min(prev + increment + Math.random() * 2, 95);
      });
    }, 300);

    // Pulse effect
    const pulseInterval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 500);
    }, 1500);

    return () => {
      clearInterval(interval);
      clearInterval(pulseInterval);
      clearInterval(messageInterval);
    };
  }, []);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      style={{ minHeight: '50vh', padding: '2rem' }}
      gap="6"
    >
      {/* Vertical Progress Bar Container */}
      <Box style={{ position: 'relative', height: '200px', width: '40px' }}>
        {/* Background track */}
        <Box
          style={{
            position: 'absolute',
            left: '10px',
            top: '0',
            width: '20px',
            height: '200px',
            borderRadius: '10px',
            background: 'var(--gray-5)',
            overflow: 'hidden',
          }}
        >
          {/* Progress fill */}
          <Box
            style={{
              position: 'absolute',
              left: '0',
              bottom: '0',
              width: '100%',
              height: `${progress}%`,
              background: `linear-gradient(180deg, var(--blue-9) 0%, var(--gray-11) 100%)`,
              borderRadius: '10px',
              transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: pulse ? 'scale(1.1)' : 'scale(1)',
            }}
          />
        </Box>
        
        {/* Animated glow effect */}
        <Box
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '40px',
            height: '200px',
            background: `linear-gradient(0deg, 
              var(--blue-8) 0%, 
              transparent ${progress}%, 
              transparent 100%)`,
            filter: 'blur(20px)',
            opacity: pulse ? 0.8 : 0.4,
            pointerEvents: 'none',
            transition: 'all 0.5s ease',
          }}
        />
        
        {/* Spark effect at top of progress */}
        <Box
          style={{
            position: 'absolute',
            left: '5px',
            bottom: `${progress}%`,
            width: '30px',
            height: '30px',
            background: 'radial-gradient(circle, var(--blue-11) 0%, transparent 70%)',
            filter: 'blur(3px)',
            opacity: pulse ? 1 : 0.6,
            transform: 'translateY(15px)',
            transition: 'all 0.3s ease',
          }}
        />
      </Box>

      {/* Loading text with animation */}
      <Text 
        size="4" 
        weight="medium"
        style={{
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }}
      >
        {loadingMessage}
      </Text>

      {/* Progress percentage */}
      <Text size="6" weight="bold" style={{ color: 'var(--gray-11)' }}>
        {Math.round(progress)}%
      </Text>
    </Flex>
  );
};

export default LoadingScreen;