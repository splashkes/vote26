import { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Heading,
  Grid,
  TextField,
  Select,
  Separator,
  Progress,
  ScrollArea
} from '@radix-ui/themes';
import {
  HeartFilledIcon,
  MagnifyingGlassIcon,
  LightningBoltIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
  BarChartIcon,
  CalendarIcon,
  ArrowUpIcon,
  ArrowDownIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import EventSearch from './EventSearch';

const HealthRecommendations = () => {
  const { user, adminEvents } = useAuth();
  const [recommendations, setRecommendations] = useState([]);
  const [eventHealthScores, setEventHealthScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedEventFilter, setSelectedEventFilter] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    loadHealthData();
  }, []);

  const loadHealthData = () => {
    setLoading(true);
    
    // Simulate loading cross-event health data and recommendations
    setTimeout(() => {
      setEventHealthScores([
        {
          eventId: 'AB3002',
          eventName: 'Toronto Winter Battle',
          overallScore: 92,
          status: 'excellent',
          daysUntilEvent: 3,
          criticalIssues: 0,
          venue: 'Steam Whistle Brewery',
          ticketsSold: 184,
          artistsConfirmed: 11,
          lastAnalyzed: new Date().toISOString()
        },
        {
          eventId: 'AB3001',
          eventName: 'Vancouver Showdown',
          overallScore: 78,
          status: 'good',
          daysUntilEvent: 7,
          criticalIssues: 1,
          venue: 'Granville Island',
          ticketsSold: 97,
          artistsConfirmed: 9,
          lastAnalyzed: new Date().toISOString()
        },
        {
          eventId: 'AB3000',
          eventName: 'Montreal Arts Night',
          overallScore: 65,
          status: 'needs-attention',
          daysUntilEvent: 14,
          criticalIssues: 3,
          venue: 'Old Port Studios',
          ticketsSold: 45,
          artistsConfirmed: 8,
          lastAnalyzed: new Date().toISOString()
        },
        {
          eventId: 'AB2999',
          eventName: 'Calgary Creative Clash',
          overallScore: 45,
          status: 'critical',
          daysUntilEvent: 21,
          criticalIssues: 5,
          venue: 'Arts Commons',
          ticketsSold: 23,
          artistsConfirmed: 6,
          lastAnalyzed: new Date().toISOString()
        }
      ]);

      setRecommendations([
        {
          id: 1,
          eventId: 'AB2999',
          eventName: 'Calgary Creative Clash',
          priority: 'urgent',
          category: 'Marketing',
          suggestion: 'Launch emergency social media blitz with local influencers',
          impact: 9,
          reasoning: 'Only 23 tickets sold with 21 days to go - need immediate audience boost',
          estimatedCost: 500,
          timeToImplement: '2-4 hours',
          status: 'pending',
          createdAt: '2024-01-16T10:30:00Z',
          dueDate: '2024-01-17T18:00:00Z'
        },
        {
          id: 2,
          eventId: 'AB2999',
          eventName: 'Calgary Creative Clash',
          priority: 'urgent',
          category: 'Artists',
          suggestion: 'Contact backup artists immediately for remaining 5 easels',
          impact: 10,
          reasoning: 'Only 6 artists confirmed, need 11 minimum for event viability',
          estimatedCost: 0,
          timeToImplement: '1-2 hours',
          status: 'pending',
          createdAt: '2024-01-16T10:30:00Z',
          dueDate: '2024-01-17T12:00:00Z'
        },
        {
          id: 3,
          eventId: 'AB3000',
          eventName: 'Montreal Arts Night',
          priority: 'important',
          category: 'Marketing',
          suggestion: 'Partner with local art schools for student discount campaign',
          impact: 7,
          reasoning: 'Montreal has strong art student population, could boost attendance by 30-40 tickets',
          estimatedCost: 200,
          timeToImplement: '4-6 hours',
          status: 'pending',
          createdAt: '2024-01-16T09:15:00Z',
          dueDate: '2024-01-20T17:00:00Z'
        },
        {
          id: 4,
          eventId: 'AB3001',
          eventName: 'Vancouver Showdown',
          priority: 'important',
          category: 'Operations',
          suggestion: 'Confirm audio equipment rental for Granville Island venue',
          impact: 8,
          reasoning: 'Outdoor venue requires special sound setup, prevent day-of technical issues',
          estimatedCost: 300,
          timeToImplement: '30 minutes',
          status: 'in-progress',
          createdAt: '2024-01-16T08:45:00Z',
          dueDate: '2024-01-18T15:00:00Z',
          assignedTo: 'Operations Team'
        },
        {
          id: 5,
          eventId: 'AB3002',
          eventName: 'Toronto Winter Battle',
          priority: 'nice-to-have',
          category: 'Experience',
          suggestion: 'Set up Instagram photo booth with branded backdrop',
          impact: 6,
          reasoning: 'Event is well-prepared, this would enhance social media engagement',
          estimatedCost: 150,
          timeToImplement: '2-3 hours',
          status: 'pending',
          createdAt: '2024-01-16T07:20:00Z',
          dueDate: '2024-01-19T12:00:00Z'
        },
        {
          id: 6,
          eventId: 'AB3000',
          eventName: 'Montreal Arts Night',
          priority: 'urgent',
          category: 'Marketing',
          suggestion: 'Purchase targeted Facebook ads for Montreal art enthusiasts aged 25-45',
          impact: 8,
          reasoning: 'Low ticket sales indicate poor awareness, targeted ads could reach 15K potential attendees',
          estimatedCost: 400,
          timeToImplement: '1 hour',
          status: 'pending',
          createdAt: '2024-01-16T11:10:00Z',
          dueDate: '2024-01-18T09:00:00Z'
        }
      ]);
      
      setLoading(false);
      setLastUpdate(new Date());
    }, 1500);
  };

  // Filter recommendations
  const filteredRecommendations = recommendations.filter(rec => {
    const matchesSearch = !searchTerm || 
      rec.suggestion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPriority = filterPriority === 'all' || rec.priority === filterPriority;
    const matchesCategory = filterCategory === 'all' || rec.category === filterCategory;
    const matchesEvent = !selectedEventFilter || rec.eventId === selectedEventFilter;
    
    return matchesSearch && matchesPriority && matchesCategory && matchesEvent;
  });

  const getPriorityBadge = (priority) => {
    const configs = {
      'urgent': { color: 'red', label: '🚨 URGENT' },
      'important': { color: 'orange', label: '⚠️ Important' },
      'nice-to-have': { color: 'blue', label: '💡 Nice to Have' }
    };
    const config = configs[priority] || configs['nice-to-have'];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  const getCategoryBadge = (category) => {
    const configs = {
      'Marketing': { color: 'purple', label: '📢 Marketing' },
      'Artists': { color: 'green', label: '🎨 Artists' },
      'Operations': { color: 'blue', label: '⚙️ Operations' },
      'Experience': { color: 'cyan', label: '✨ Experience' }
    };
    const config = configs[category] || configs['Operations'];
    return <Badge color={config.color} variant="soft">{config.label}</Badge>;
  };

  const getStatusBadge = (status) => {
    const configs = {
      'pending': { color: 'orange', label: 'Pending', icon: ExclamationTriangleIcon },
      'in-progress': { color: 'blue', label: 'In Progress', icon: ReloadIcon },
      'completed': { color: 'green', label: 'Completed', icon: CheckCircledIcon },
      'dismissed': { color: 'gray', label: 'Dismissed', icon: CrossCircledIcon }
    };
    const config = configs[status] || configs['pending'];
    const Icon = config.icon;
    return (
      <Badge color={config.color} variant="soft">
        <Icon height="12" width="12" />
        {config.label}
      </Badge>
    );
  };

  const getHealthStatusBadge = (status) => {
    const configs = {
      'excellent': { color: 'green', label: 'Excellent' },
      'good': { color: 'blue', label: 'Good' },
      'needs-attention': { color: 'orange', label: 'Needs Attention' },
      'critical': { color: 'red', label: 'Critical' }
    };
    const config = configs[status] || configs['good'];
    return <Badge color={config.color}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" gap="2" mb="4">
          <ReloadIcon className="animate-spin" />
          <Text size="3">Loading health recommendations...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="6">
        {/* Header */}
        <Box>
          <Flex align="center" gap="2" mb="2">
            <HeartFilledIcon size={20} color="var(--crimson-9)" />
            <Heading size="6">Health Recommendations</Heading>
          </Flex>
          <Text color="gray" size="3">
            AI-powered recommendations across all events
          </Text>
          <Text color="gray" size="2" mt="1">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Text>
        </Box>

        {/* Event Health Overview */}
        <Card>
          <Box p="4">
            <Flex justify="between" align="center" mb="4">
              <Text size="4" weight="medium">Event Health Overview</Text>
              <Button variant="soft" size="2" onClick={loadHealthData}>
                <ReloadIcon />
                Refresh All
              </Button>
            </Flex>
            
            <Grid columns="4" gap="4">
              {eventHealthScores.map((event) => (
                <Card key={event.eventId} style={{
                  borderColor: event.status === 'critical' ? 'var(--red-6)' : 
                              event.status === 'needs-attention' ? 'var(--orange-6)' : undefined
                }}>
                  <Box p="3">
                    <Flex justify="between" align="start" mb="2">
                      <Box>
                        <Text size="2" weight="medium" mb="1" style={{ display: 'block' }}>
                          {event.eventName}
                        </Text>
                        <Text size="1" color="gray">{event.eventId}</Text>
                      </Box>
                      {getHealthStatusBadge(event.status)}
                    </Flex>
                    
                    <Flex align="center" gap="2" mb="2">
                      <Text size="4" weight="bold">{event.overallScore}</Text>
                      <Progress value={event.overallScore} color={
                        event.status === 'excellent' ? 'green' :
                        event.status === 'good' ? 'blue' :
                        event.status === 'needs-attention' ? 'orange' : 'red'
                      } size="2" style={{ flex: 1 }} />
                    </Flex>
                    
                    <Flex direction="column" gap="1">
                      <Text size="1">
                        {event.daysUntilEvent} days until event
                      </Text>
                      <Text size="1">
                        {event.ticketsSold} tickets • {event.artistsConfirmed} artists
                      </Text>
                      {event.criticalIssues > 0 && (
                        <Text size="1" color="red">
                          {event.criticalIssues} critical issue{event.criticalIssues !== 1 ? 's' : ''}
                        </Text>
                      )}
                    </Flex>
                  </Box>
                </Card>
              ))}
            </Grid>
          </Box>
        </Card>

        {/* Filters */}
        <Card>
          <Box p="4">
            <Grid columns="5" gap="3" align="end">
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Search Recommendations
                </Text>
                <TextField.Root
                  placeholder="Search by suggestion or event..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                >
                  <TextField.Slot>
                    <MagnifyingGlassIcon height="16" width="16" />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Priority
                </Text>
                <Select.Root value={filterPriority} onValueChange={setFilterPriority}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Priority</Select.Item>
                    <Select.Item value="urgent">Urgent</Select.Item>
                    <Select.Item value="important">Important</Select.Item>
                    <Select.Item value="nice-to-have">Nice to Have</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Category
                </Text>
                <Select.Root value={filterCategory} onValueChange={setFilterCategory}>
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Categories</Select.Item>
                    <Select.Item value="Marketing">Marketing</Select.Item>
                    <Select.Item value="Artists">Artists</Select.Item>
                    <Select.Item value="Operations">Operations</Select.Item>
                    <Select.Item value="Experience">Experience</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              
              <Box>
                <Text size="2" mb="2" style={{ display: 'block' }}>
                  Filter by Event
                </Text>
                <EventSearch 
                  onSelectEvent={(event) => setSelectedEventFilter(event.event_eid || event.eid)}
                  selectedEventId={selectedEventFilter}
                />
              </Box>
              
              <Button onClick={loadHealthData}>
                <LightningBoltIcon />
                Generate New
              </Button>
            </Grid>
          </Box>
        </Card>

        {/* Recommendations List */}
        <Box>
          <Text size="4" weight="medium" mb="4" style={{ display: 'block' }}>
            AI Recommendations ({filteredRecommendations.length})
          </Text>
          
          <Flex direction="column" gap="3">
            {filteredRecommendations.map((rec) => (
              <Card key={rec.id} style={{
                borderColor: rec.priority === 'urgent' ? 'var(--red-6)' : undefined,
                borderWidth: rec.priority === 'urgent' ? '2px' : '1px'
              }}>
                <Box p="4">
                  <Flex justify="between" align="start" mb="3">
                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="2" mb="2">
                        {getPriorityBadge(rec.priority)}
                        {getCategoryBadge(rec.category)}
                        {getStatusBadge(rec.status)}
                      </Flex>
                      
                      <Text size="3" weight="medium" mb="1" style={{ display: 'block' }}>
                        {rec.suggestion}
                      </Text>
                      
                      <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                        {rec.eventName} ({rec.eventId}) • Impact: {rec.impact}/10
                      </Text>
                      
                      <Text size="2" style={{ display: 'block' }}>
                        {rec.reasoning}
                      </Text>
                    </Box>
                    
                    <Box style={{ minWidth: '200px', textAlign: 'right' }}>
                      <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>
                        Due: {new Date(rec.dueDate).toLocaleDateString()}
                      </Text>
                      {rec.estimatedCost > 0 && (
                        <Text size="2" color="orange" mb="1" style={{ display: 'block' }}>
                          Est. Cost: ${rec.estimatedCost}
                        </Text>
                      )}
                      <Text size="1" color="gray">
                        Time: {rec.timeToImplement}
                      </Text>
                    </Box>
                  </Flex>
                  
                  <Separator mb="3" />
                  
                  <Flex justify="between" align="center">
                    <Flex align="center" gap="3">
                      <Text size="1" color="gray">
                        Created: {new Date(rec.createdAt).toLocaleDateString()}
                      </Text>
                      {rec.assignedTo && (
                        <Text size="1" color="blue">
                          Assigned to: {rec.assignedTo}
                        </Text>
                      )}
                    </Flex>
                    
                    <Flex gap="2">
                      {rec.status === 'pending' && (
                        <>
                          <Button size="1" variant="soft">
                            <CheckCircledIcon />
                            Mark Done
                          </Button>
                          <Button size="1" variant="soft" color="orange">
                            <ReloadIcon />
                            In Progress
                          </Button>
                          <Button size="1" variant="soft" color="gray">
                            <CrossCircledIcon />
                            Dismiss
                          </Button>
                        </>
                      )}
                      
                      {rec.status === 'in-progress' && (
                        <Button size="1" variant="soft" color="green">
                          <CheckCircledIcon />
                          Complete
                        </Button>
                      )}
                      
                      <Button size="1" variant="ghost">
                        <BarChartIcon />
                        Details
                      </Button>
                    </Flex>
                  </Flex>
                </Box>
              </Card>
            ))}
          </Flex>
        </Box>

        {/* Empty State */}
        {filteredRecommendations.length === 0 && !loading && (
          <Card>
            <Box p="6" style={{ textAlign: 'center' }}>
              <LightningBoltIcon size={48} color="var(--gray-8)" style={{ margin: '0 auto 16px' }} />
              <Text size="3" color="gray" mb="2" style={{ display: 'block' }}>
                No recommendations found
              </Text>
              <Text size="2" color="gray">
                Try adjusting your filters or generate new recommendations
              </Text>
            </Box>
          </Card>
        )}

        {/* Summary Stats */}
        <Card>
          <Box p="4">
            <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
              Recommendations Summary
            </Text>
            <Grid columns="4" gap="4">
              <Box style={{ textAlign: 'center' }}>
                <Text size="4" weight="bold" color="red" style={{ display: 'block' }}>
                  {recommendations.filter(r => r.priority === 'urgent').length}
                </Text>
                <Text size="1" color="gray">Urgent</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="4" weight="bold" color="orange" style={{ display: 'block' }}>
                  {recommendations.filter(r => r.priority === 'important').length}
                </Text>
                <Text size="1" color="gray">Important</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="4" weight="bold" color="green" style={{ display: 'block' }}>
                  {recommendations.filter(r => r.status === 'completed').length}
                </Text>
                <Text size="1" color="gray">Completed</Text>
              </Box>
              <Box style={{ textAlign: 'center' }}>
                <Text size="4" weight="bold" color="blue" style={{ display: 'block' }}>
                  ${recommendations.reduce((sum, r) => sum + r.estimatedCost, 0)}
                </Text>
                <Text size="1" color="gray">Total Est. Cost</Text>
              </Box>
            </Grid>
          </Box>
        </Card>
      </Flex>
    </Box>
  );
};

export default HealthRecommendations;