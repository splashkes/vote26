import { useState, useEffect } from 'react';
import { 
  Dialog, 
  Flex, 
  Text, 
  Box, 
  Button, 
  Tabs, 
  Card,
  Badge,
  Separator,
  IconButton
} from '@radix-ui/themes';
import { Cross2Icon, BarChartIcon, EyeOpenIcon, ClockIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';

const ContentStatsModal = ({ isOpen, onClose, contentId }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daysBack, setDaysBack] = useState(30);

  // Load stats when modal opens or contentId changes
  useEffect(() => {
    if (isOpen && contentId) {
      loadStats();
    }
  }, [isOpen, contentId, daysBack]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke('admin-content-stats', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to load stats');
      }

      setStats(data.data);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Format time duration
  const formatDuration = (ms) => {
    if (!ms || ms === 0) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Format percentage
  const formatPercentage = (value) => {
    if (!value && value !== 0) return '0%';
    return `${Math.round(value * 100) / 100}%`;
  };

  if (!isOpen) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: '800px', maxHeight: '80vh' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <BarChartIcon />
            Content Analytics
          </Flex>
        </Dialog.Title>

        <Dialog.Description size="2" mb="4">
          Detailed engagement analytics for content ID: {contentId}
        </Dialog.Description>

        {/* Time Range Selector */}
        <Flex gap="2" mb="4">
          <Text size="2" style={{ alignSelf: 'center' }}>Time range:</Text>
          {[7, 14, 30, 90].map((days) => (
            <Button
              key={days}
              size="1"
              variant={daysBack === days ? 'solid' : 'soft'}
              onClick={() => setDaysBack(days)}
            >
              {days} days
            </Button>
          ))}
        </Flex>

        {loading && (
          <Box p="4" style={{ textAlign: 'center' }}>
            <Text>Loading analytics...</Text>
          </Box>
        )}

        {error && (
          <Box p="4" style={{ backgroundColor: 'var(--red-2)', borderRadius: '8px' }}>
            <Text color="red">{error}</Text>
            <Button size="1" mt="2" onClick={loadStats}>
              Retry
            </Button>
          </Box>
        )}

        {stats && !loading && (
          <Tabs.Root defaultValue="overview">
            <Tabs.List>
              <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
              <Tabs.Trigger value="engagement">Engagement</Tabs.Trigger>
              <Tabs.Trigger value="trends">Trends</Tabs.Trigger>
            </Tabs.List>

            {/* Overview Tab */}
            <Tabs.Content value="overview">
              <Box mt="4">
                <Flex gap="4" wrap="wrap">
                  {/* Total Views */}
                  <Card style={{ flex: '1', minWidth: '150px' }}>
                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <EyeOpenIcon />
                        <Text size="2" color="gray">Total Views</Text>
                      </Flex>
                      <Text size="6" weight="bold">
                        {stats.total_views?.toLocaleString() || 0}
                      </Text>
                      <Text size="1" color="gray">
                        {stats.unique_sessions || 0} unique sessions
                      </Text>
                    </Flex>
                  </Card>

                  {/* Average Dwell Time */}
                  <Card style={{ flex: '1', minWidth: '150px' }}>
                    <Flex direction="column" gap="2">
                      <Flex align="center" gap="2">
                        <ClockIcon />
                        <Text size="2" color="gray">Avg Dwell Time</Text>
                      </Flex>
                      <Text size="6" weight="bold">
                        {formatDuration(stats.avg_dwell_time_ms)}
                      </Text>
                      <Text size="1" color="gray">
                        Per session
                      </Text>
                    </Flex>
                  </Card>

                  {/* Viewport Percentage */}
                  <Card style={{ flex: '1', minWidth: '150px' }}>
                    <Flex direction="column" gap="2">
                      <Text size="2" color="gray">Avg Viewport</Text>
                      <Text size="6" weight="bold">
                        {formatPercentage(stats.avg_viewport_percentage)}
                      </Text>
                      <Text size="1" color="gray">
                        Screen coverage
                      </Text>
                    </Flex>
                  </Card>

                  {/* Video Watch Percentage */}
                  {stats.avg_video_watch_percentage > 0 && (
                    <Card style={{ flex: '1', minWidth: '150px' }}>
                      <Flex direction="column" gap="2">
                        <Text size="2" color="gray">Video Completion</Text>
                        <Text size="6" weight="bold">
                          {formatPercentage(stats.avg_video_watch_percentage)}
                        </Text>
                        <Text size="1" color="gray">
                          Average watched
                        </Text>
                      </Flex>
                    </Card>
                  )}
                </Flex>
              </Box>
            </Tabs.Content>

            {/* Engagement Tab */}
            <Tabs.Content value="engagement">
              <Box mt="4">
                <Flex direction="column" gap="4">
                  {/* User Actions */}
                  <Card>
                    <Flex direction="column" gap="3">
                      <Text size="4" weight="medium">User Interactions</Text>
                      <Flex gap="4" wrap="wrap">
                        <Box>
                          <Text size="3" weight="bold">{stats.total_actions || 0}</Text>
                          <Text size="2" color="gray" style={{ display: 'block' }}>
                            Total Actions
                          </Text>
                        </Box>
                        <Box>
                          <Text size="3" weight="bold">
                            {stats.swipe_velocity_avg?.toFixed(1) || '0.0'}
                          </Text>
                          <Text size="2" color="gray" style={{ display: 'block' }}>
                            Avg Swipe Velocity
                          </Text>
                        </Box>
                      </Flex>
                    </Flex>
                  </Card>

                  {/* Exit Actions */}
                  {stats.exit_actions && Object.keys(stats.exit_actions).length > 0 && (
                    <Card>
                      <Flex direction="column" gap="3">
                        <Text size="4" weight="medium">Exit Behaviors</Text>
                        <Flex gap="2" wrap="wrap">
                          {Object.entries(stats.exit_actions).map(([action, count]) => (
                            <Badge key={action} variant="soft">
                              {action}: {count}
                            </Badge>
                          ))}
                        </Flex>
                      </Flex>
                    </Card>
                  )}
                </Flex>
              </Box>
            </Tabs.Content>

            {/* Trends Tab */}
            <Tabs.Content value="trends">
              <Box mt="4">
                {stats.engagement_by_day && stats.engagement_by_day.length > 0 ? (
                  <Card>
                    <Flex direction="column" gap="3">
                      <Text size="4" weight="medium">Daily Engagement</Text>
                      <Box style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {stats.engagement_by_day.map((day, index) => (
                          <Flex 
                            key={day.date} 
                            justify="between" 
                            align="center" 
                            py="2"
                            style={{ 
                              borderBottom: index < stats.engagement_by_day.length - 1 
                                ? '1px solid var(--gray-6)' 
                                : 'none' 
                            }}
                          >
                            <Text size="2">
                              {new Date(day.date).toLocaleDateString()}
                            </Text>
                            <Flex gap="4" align="center">
                              <Text size="2" color="blue">
                                {day.views} views
                              </Text>
                              <Text size="2" color="green">
                                {formatDuration(day.avg_dwell)} avg
                              </Text>
                            </Flex>
                          </Flex>
                        ))}
                      </Box>
                    </Flex>
                  </Card>
                ) : (
                  <Card>
                    <Text size="2" color="gray">
                      No engagement data available for the selected time period.
                    </Text>
                  </Card>
                )}
              </Box>
            </Tabs.Content>
          </Tabs.Root>
        )}

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>

        <Dialog.Close>
          <IconButton
            size="1"
            variant="ghost"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px'
            }}
          >
            <Cross2Icon />
          </IconButton>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ContentStatsModal;