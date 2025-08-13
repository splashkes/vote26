import {
  Card,
  Box,
  Flex,
  Text,
  Badge,
  Spinner,
  Tooltip
} from '@radix-ui/themes';
import {
  PersonIcon,
  EnvelopeClosedIcon,
  ChatBubbleIcon,
  StarIcon
} from '@radix-ui/react-icons';
import { getSegmentColor, getSegmentTier } from '../lib/rfmScoring';

const PersonTile = ({ 
  person, 
  onClick, 
  rfmScores, 
  rfmLoading,
  showActivityBadges = false 
}) => {
  const rfmScore = rfmScores?.get(person.id);

  return (
    <Card 
      key={person.id} 
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(person);
      }}
    >
      <Box p="4">
        <Flex direction="column" gap="3">
          {/* Person Header */}
          <Flex align="center" gap="3">
            <PersonIcon size={20} />
            <Box>
              <Text size="3" weight="bold">
                {person.first_name} {person.last_name}
              </Text>
            </Box>
          </Flex>

          {/* Contact Info */}
          <Flex direction="column" gap="2">
            {person.email && (
              <Flex align="center" gap="2">
                <EnvelopeClosedIcon size={14} />
                <Text size="2" color="gray">
                  {person.email}
                </Text>
              </Flex>
            )}
            
            {person.phone && (
              <Flex align="center" gap="2">
                <ChatBubbleIcon size={14} />
                <Text size="2" color="gray">
                  {person.phone}
                </Text>
              </Flex>
            )}
          </Flex>

          {/* RFM Score */}
          <Flex direction="column" gap="2">
            {rfmScore ? (
              <Flex align="center" justify="between">
                <Tooltip content={`Tier ${getSegmentTier(rfmScore.segmentCode).tier}: ${getSegmentTier(rfmScore.segmentCode).description}`}>
                  <Badge color={getSegmentColor(rfmScore.segmentCode)} size="1">
                    <StarIcon size={12} />
                    {rfmScore.segment}
                  </Badge>
                </Tooltip>
                <Text size="1" color="gray">
                  RFM: {rfmScore.recencyScore}-{rfmScore.frequencyScore}-{rfmScore.monetaryScore}
                </Text>
              </Flex>
            ) : rfmLoading ? (
              <Flex align="center" gap="2">
                <Spinner size="1" />
                <Text size="1" color="gray">Loading RFM...</Text>
              </Flex>
            ) : (
              <Badge color="gray" size="1">
                <StarIcon size={12} />
                RFM Not Available
              </Badge>
            )}
          </Flex>

          {/* Activity Badges (for event people) */}
          {showActivityBadges && (
            <Flex justify="between" align="center">
              <Flex gap="1">
                {person.voted && (
                  <Badge color="blue" size="1">Voted</Badge>
                )}
                {person.bid && (
                  <Badge color="orange" size="1">Bid</Badge>
                )}
                {person.scanned && (
                  <Badge color="purple" size="1">Scanned</Badge>
                )}
              </Flex>
            </Flex>
          )}

          {/* Status */}
          <Flex justify="between" align="center">
            <Badge color={person.email ? 'green' : 'gray'} size="1">
              {person.email ? 'Has Email' : 'Phone Only'}
            </Badge>
            <Text size="1" color="gray">
              ID: {person.id?.toString().slice(-8)}
            </Text>
          </Flex>
        </Flex>
      </Box>
    </Card>
  );
};

export default PersonTile;