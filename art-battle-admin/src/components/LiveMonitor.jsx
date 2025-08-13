import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Heading,
  Grid,
  Progress,
  Separator
} from '@radix-ui/themes';
import {
  ActivityLogIcon,
  LightningBoltIcon,
  PersonIcon,
  EyeOpenIcon,
  HeartIcon,
  TimerIcon,
  BarChartIcon,
  PlayIcon,
  PauseIcon,
  ReloadIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';

const LiveMonitor = () => {
  const { eventId } = useParams();
  const { user, adminEvents } = useAuth();
  const [liveData, setLiveData] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Find current event
  const currentEvent = adminEvents?.find(e => e.event_id === eventId || e.id === eventId);

  useEffect(() => {
    // Simulate loading live data
    // In the full implementation, this would connect to WebSocket/Supabase realtime
    const loadLiveData = () => {
      setLiveData({
        eventStatus: 'live', // live, upcoming, completed
        currentRound: 2,
        totalRounds: 3,
        roundTimeRemaining: 1847, // seconds
        activeVoters: 89,
        totalVotes: 1247,
        votesThisRound: 423,
        averageVotesPerMinute: 45,
        peakVoting: 78, // votes per minute
        artistStats: [
          { name: 'Sarah Chen', easel: 1, votes: 67, percentage: 15.8 },
          { name: 'Mike Rodriguez', easel: 2, votes: 89, percentage: 21.0 },
          { name: 'Emma Thompson', easel: 3, votes: 45, percentage: 10.6 },
          { name: 'James Wilson', easel: 4, votes: 72, percentage: 17.0 },
          { name: 'Lisa Park', easel: 5, votes: 56, percentage: 13.2 },
          { name: 'David Kumar', easel: 6, votes: 94, percentage: 22.2 }
        ],
        recentActivity: [
          { time: '2 sec ago', action: 'Vote cast for Easel 2', user: 'Anonymous' },
          { time: '5 sec ago', action: 'Vote cast for Easel 6', user: 'Anonymous' },
          { time: '8 sec ago', action: 'Vote cast for Easel 4', user: 'Anonymous' },
          { time: '12 sec ago', action: 'Vote cast for Easel 1', user: 'Anonymous' },
          { time: '15 sec ago', action: 'Vote cast for Easel 3', user: 'Anonymous' }
        ],
        auctionData: {
          activeAuction: true,
          currentLot: 'AB2024-R1-001',
          currentBid: 245,
          bidCount: 8,
          timeRemaining: 120,
          activeBidders: 5
        }
      });
      setIsLive(true);
      setLoading(false);
      setLastUpdate(new Date());
    };

    loadLiveData();

    // Simulate real-time updates every 3 seconds
    const interval = setInterval(() => {
      if (isLive) {
        loadLiveData();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [eventId, isLive]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getArtistColor = (percentage) => {
    if (percentage > 20) return 'green';
    if (percentage > 15) return 'blue';
    if (percentage > 10) return 'orange';
    return 'gray';
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" gap="2" mb="4">
          <ReloadIcon className="animate-spin" />
          <Text size="3">Connecting to live feed...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="6">
        {/* Header with Live Status */}
        <Box>
          <Flex align="center" gap="3" mb="2">
            <Flex align="center" gap="2">
              <ActivityLogIcon size={20} color="var(--green-9)" />
              <Heading size="6">Live Monitor</Heading>
            </Flex>
            <Badge color="green" size="2" variant="solid">
              <Flex align="center" gap="1">
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  animation: 'pulse 2s infinite'
                }} />
                LIVE
              </Flex>
            </Badge>
            <Button
              size="1"
              variant="ghost"
              onClick={() => setIsLive(!isLive)}
            >
              {isLive ? <PauseIcon /> : <PlayIcon />}
            </Button>
          </Flex>
          <Text color="gray" size="3">
            Real-time monitoring for {currentEvent?.event_name || currentEvent?.name || 'Event'}
          </Text>
          <Text color="gray" size="2" mt="1">
            Last update: {lastUpdate.toLocaleTimeString()}
          </Text>
        </Box>

        {/* Event Status Cards */}
        <Grid columns="4" gap="4">
          <Card>
            <Box p="3">
              <Flex direction="column" align="center">
                <Text size="1" color="gray" mb="1">Current Round</Text>
                <Text size="6" weight="bold" color="blue">
                  {liveData.currentRound}/{liveData.totalRounds}
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Flex direction="column" align="center">
                <Text size="1" color="gray" mb="1">Time Remaining</Text>
                <Text size="4" weight="bold" color="orange">
                  {formatTime(liveData.roundTimeRemaining)}
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Flex direction="column" align="center">
                <Text size="1" color="gray" mb="1">Active Voters</Text>
                <Text size="6" weight="bold" color="green">
                  {liveData.activeVoters}
                </Text>
              </Flex>
            </Box>
          </Card>

          <Card>
            <Box p="3">
              <Flex direction="column" align="center">
                <Text size="1" color="gray" mb="1">Total Votes</Text>
                <Text size="6" weight="bold">
                  {liveData.totalVotes.toLocaleString()}
                </Text>
              </Flex>
            </Box>
          </Card>
        </Grid>

        {/* Voting Statistics */}
        <Grid columns="2" gap="6">
          {/* Current Voting Stats */}
          <Card>
            <Box p="4">
              <Flex align="center" gap="2" mb="3">
                <BarChartIcon />
                <Text size="4" weight="medium">Voting Statistics</Text>
              </Flex>
              
              <Flex direction="column" gap="3">
                <Flex justify="between">
                  <Text size="2" color="gray">Votes This Round</Text>
                  <Text size="3" weight="medium">{liveData.votesThisRound}</Text>
                </Flex>
                
                <Flex justify="between">
                  <Text size="2" color="gray">Average/Minute</Text>
                  <Text size="3" weight="medium">{liveData.averageVotesPerMinute}</Text>
                </Flex>
                
                <Flex justify="between">
                  <Text size="2" color="gray">Peak Voting Rate</Text>
                  <Text size="3" weight="medium" color="green">
                    {liveData.peakVoting} votes/min
                  </Text>
                </Flex>

                <Box>
                  <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                    Voting Activity
                  </Text>
                  <Progress 
                    value={(liveData.averageVotesPerMinute / liveData.peakVoting) * 100} 
                    color="green"
                  />
                </Box>
              </Flex>
            </Box>
          </Card>

          {/* Recent Activity Feed */}
          <Card>
            <Box p="4">
              <Flex align="center" gap="2" mb="3">
                <ActivityLogIcon />
                <Text size="4" weight="medium">Live Activity Feed</Text>
              </Flex>
              
              <Box style={{ height: '200px', overflow: 'auto' }}>
                <Flex direction="column" gap="2">
                  {liveData.recentActivity.map((activity, index) => (
                    <Box key={index} p="2" style={{ 
                      backgroundColor: 'var(--gray-2)', 
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      <Flex justify="between" align="center">
                        <Text size="2">{activity.action}</Text>
                        <Text size="1" color="gray">{activity.time}</Text>
                      </Flex>
                    </Box>
                  ))}
                </Flex>
              </Box>
            </Box>
          </Card>
        </Grid>

        {/* Artist Performance */}
        <Card>
          <Box p="4">
            <Flex align="center" gap="2" mb="4">
              <PersonIcon />
              <Text size="4" weight="medium">Live Artist Performance</Text>
            </Flex>
            
            <Grid columns="3" gap="3">
              {liveData.artistStats
                .sort((a, b) => b.votes - a.votes)
                .map((artist, index) => (
                <Card key={index} style={{
                  borderColor: index === 0 ? 'var(--gold-6)' : undefined,
                  borderWidth: index === 0 ? '2px' : '1px'
                }}>
                  <Box p="3">
                    <Flex justify="between" align="center" mb="2">
                      <Box>
                        <Text size="2" weight="medium" style={{ display: 'block' }}>
                          {artist.name}
                        </Text>
                        <Text size="1" color="gray">
                          Easel {artist.easel}
                        </Text>
                      </Box>
                      {index === 0 && (
                        <Badge color="yellow" size="1">🏆 Leading</Badge>
                      )}
                    </Flex>
                    
                    <Flex justify="between" align="center" mb="2">
                      <Text size="3" weight="bold">{artist.votes}</Text>
                      <Text size="2" color={getArtistColor(artist.percentage)}>
                        {artist.percentage}%
                      </Text>
                    </Flex>
                    
                    <Progress 
                      value={artist.percentage} 
                      color={getArtistColor(artist.percentage)}
                      size="1"
                    />
                  </Box>
                </Card>
              ))}
            </Grid>
          </Box>
        </Card>

        {/* Auction Monitor */}
        {liveData.auctionData.activeAuction && (
          <Card style={{ borderColor: 'var(--purple-6)' }}>
            <Box p="4">
              <Flex align="center" gap="2" mb="3">
                <LightningBoltIcon color="var(--purple-9)" />
                <Text size="4" weight="medium">Live Auction</Text>
                <Badge color="purple" size="1">ACTIVE</Badge>
              </Flex>
              
              <Grid columns="4" gap="4">
                <Box>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Current Lot
                  </Text>
                  <Text size="2" weight="medium">
                    {liveData.auctionData.currentLot}
                  </Text>
                </Box>
                
                <Box>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Current Bid
                  </Text>
                  <Text size="4" weight="bold" color="purple">
                    ${liveData.auctionData.currentBid}
                  </Text>
                </Box>
                
                <Box>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Active Bidders
                  </Text>
                  <Text size="3" weight="medium">
                    {liveData.auctionData.activeBidders}
                  </Text>
                </Box>
                
                <Box>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    Time Left
                  </Text>
                  <Text size="3" weight="medium" color="orange">
                    {formatTime(liveData.auctionData.timeRemaining)}
                  </Text>
                </Box>
              </Grid>
            </Box>
          </Card>
        )}

        {/* Control Actions */}
        <Flex gap="3">
          <Button size="3" color="green">
            <PlayIcon />
            Start Next Round
          </Button>
          <Button variant="soft" size="3">
            <PauseIcon />
            Pause Voting
          </Button>
          <Button variant="soft" size="3">
            <BarChartIcon />
            Export Data
          </Button>
          <Button variant="soft" size="3" onClick={() => window.location.reload()}>
            <ReloadIcon />
            Refresh
          </Button>
        </Flex>
      </Flex>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Box>
  );
};

export default LiveMonitor;