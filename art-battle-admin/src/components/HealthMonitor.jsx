import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Card,
  Badge,
  Button,
  Progress,
  Heading,
  Separator,
  Grid
} from '@radix-ui/themes';
import {
  HeartFilledIcon,
  ExclamationTriangleIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  LightningBoltIcon,
  BarChartIcon,
  ReloadIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';

const HealthMonitor = () => {
  const { eventId } = useParams();
  const { user, adminEvents } = useAuth();
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Find current event
  const currentEvent = adminEvents?.find(e => e.event_id === eventId || e.id === eventId);

  useEffect(() => {
    // Simulate loading health data
    // In the full implementation, this would fetch from the AI health analysis API
    setTimeout(() => {
      setHealthData({
        overallScore: 85,
        status: 'good',
        lastAnalysis: new Date(),
        categories: [
          {
            name: 'Ticket Sales',
            score: 90,
            status: 'excellent',
            metrics: ['142 registrations', '71% capacity'],
            recommendations: ['Consider opening waitlist', 'Boost social media presence']
          },
          {
            name: 'Artist Management', 
            score: 95,
            status: 'excellent',
            metrics: ['11/11 artists confirmed', '100% confirmation rate'],
            recommendations: ['Artists are well-prepared', 'Backup artist on standby']
          },
          {
            name: 'Event Operations',
            score: 75,
            status: 'needs-attention',
            metrics: ['Venue confirmed', '2 staff assigned'],
            recommendations: ['Add 1 more staff member', 'Confirm equipment delivery']
          },
          {
            name: 'Marketing Performance',
            score: 80,
            status: 'good', 
            metrics: ['$450 ad spend', '2.3% conversion rate'],
            recommendations: ['Increase Meta ads budget', 'Target local art groups']
          }
        ],
        aiRecommendations: [
          {
            priority: 'urgent',
            category: 'Marketing',
            suggestion: 'Increase Meta Ads budget to $200 today for final push',
            impact: 9,
            reasoning: 'Event is in 3 days, need immediate ticket boost'
          },
          {
            priority: 'important', 
            category: 'Operations',
            suggestion: 'Schedule equipment delivery confirmation call',
            impact: 7,
            reasoning: 'Avoid day-of technical issues'
          },
          {
            priority: 'nice-to-have',
            category: 'Artists',
            suggestion: 'Send artists final details and venue map',
            impact: 6,
            reasoning: 'Reduce artist stress and improve experience'
          }
        ]
      });
      setLoading(false);
    }, 1000);
  }, [eventId]);

  const getStatusColor = (status) => {
    const colors = {
      'excellent': 'green',
      'good': 'blue', 
      'needs-attention': 'orange',
      'critical': 'red'
    };
    return colors[status] || 'gray';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'urgent': 'red',
      'important': 'orange',
      'nice-to-have': 'blue'
    };
    return colors[priority] || 'gray';
  };

  if (loading) {
    return (
      <Box p="4">
        <Flex align="center" gap="2" mb="4">
          <ReloadIcon className="animate-spin" />
          <Text size="3">Analyzing event health...</Text>
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
            <Heading size="6">Health Monitor</Heading>
          </Flex>
          <Text color="gray" size="3">
            AI-powered event analysis for {currentEvent?.event_name || currentEvent?.name || 'Event'}
          </Text>
          <Text color="gray" size="2" mt="1">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Text>
        </Box>

        {/* Overall Health Score */}
        <Card size="3">
          <Flex justify="between" align="center">
            <Box>
              <Text size="2" color="gray" mb="1" style={{ display: 'block' }}>
                Overall Event Health
              </Text>
              <Flex align="center" gap="2">
                <Text size="8" weight="bold">{healthData.overallScore}</Text>
                <Box>
                  <Badge color={getStatusColor(healthData.status)} size="2">
                    {healthData.status.replace('-', ' ').toUpperCase()}
                  </Badge>
                  <Text size="1" color="gray" style={{ display: 'block' }}>
                    out of 100
                  </Text>
                </Box>
              </Flex>
            </Box>
            <Box style={{ width: '200px' }}>
              <Progress 
                value={healthData.overallScore} 
                color={getStatusColor(healthData.status)}
                size="3"
              />
            </Box>
          </Flex>
        </Card>

        {/* Health Categories */}
        <Box>
          <Text size="4" weight="medium" mb="3" style={{ display: 'block' }}>
            Health Analysis by Category
          </Text>
          <Grid columns="2" gap="4">
            {healthData.categories.map((category, index) => (
              <Card key={index}>
                <Box p="4">
                  <Flex justify="between" align="start" mb="3">
                    <Box>
                      <Text size="3" weight="medium" mb="1" style={{ display: 'block' }}>
                        {category.name}
                      </Text>
                      <Badge color={getStatusColor(category.status)} size="1">
                        {category.status.replace('-', ' ')}
                      </Badge>
                    </Box>
                    <Text size="6" weight="bold" color={getStatusColor(category.status)}>
                      {category.score}
                    </Text>
                  </Flex>

                  <Box mb="3">
                    <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                      Key Metrics
                    </Text>
                    {category.metrics.map((metric, i) => (
                      <Text key={i} size="2" style={{ display: 'block' }}>
                        • {metric}
                      </Text>
                    ))}
                  </Box>

                  <Box>
                    <Text size="2" color="gray" mb="2" style={{ display: 'block' }}>
                      Recommendations
                    </Text>
                    {category.recommendations.map((rec, i) => (
                      <Text key={i} size="2" color="blue" style={{ display: 'block' }}>
                        → {rec}
                      </Text>
                    ))}
                  </Box>
                </Box>
              </Card>
            ))}
          </Grid>
        </Box>

        <Separator />

        {/* AI Recommendations */}
        <Box>
          <Flex align="center" gap="2" mb="4">
            <LightningBoltIcon />
            <Text size="4" weight="medium">
              AI-Powered Recommendations
            </Text>
          </Flex>

          <Flex direction="column" gap="3">
            {healthData.aiRecommendations.map((rec, index) => (
              <Card key={index} style={{
                borderColor: getPriorityColor(rec.priority) === 'red' ? 'var(--red-6)' : undefined
              }}>
                <Box p="4">
                  <Flex justify="between" align="start" mb="2">
                    <Flex align="center" gap="2">
                      <Badge color={getPriorityColor(rec.priority)} size="1">
                        {rec.priority.toUpperCase()}
                      </Badge>
                      <Badge variant="soft" size="1">
                        {rec.category}
                      </Badge>
                    </Flex>
                    <Text size="2" weight="medium" color="blue">
                      Impact: {rec.impact}/10
                    </Text>
                  </Flex>
                  
                  <Text size="3" weight="medium" mb="2" style={{ display: 'block' }}>
                    {rec.suggestion}
                  </Text>
                  
                  <Text size="2" color="gray">
                    {rec.reasoning}
                  </Text>
                </Box>
              </Card>
            ))}
          </Flex>
        </Box>

        {/* Actions */}
        <Flex gap="3">
          <Button size="3" onClick={() => window.location.reload()}>
            <ReloadIcon />
            Refresh Analysis
          </Button>
          <Button variant="soft" size="3">
            <BarChartIcon />
            View Trends
          </Button>
          <Button variant="soft" size="3">
            Export Report
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};

export default HealthMonitor;