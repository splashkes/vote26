import { Box, Container, Flex, Heading, Text, Card, Button } from '@radix-ui/themes';
import { RocketIcon, TargetIcon } from '@radix-ui/react-icons';

const SelfSelectionCTA = ({ onSelect }) => {
  return (
    <Box py="9" style={{ background: 'var(--gray-2)', padding: '3rem 1rem' }}>
      <Container size="3" px="4">
        <Flex direction="column" gap="6" align="center">
          <Box style={{ textAlign: 'center' }}>
            <Heading size="7" mb="2">Choose Your Sponsorship Level</Heading>
            <Text size="4" style={{ color: 'var(--gray-11)' }}>
              Select the package tier that best fits your goals
            </Text>
          </Box>

          <Grid columns={{ initial: '1', sm: '2' }} gap="4" width="100%">
            {/* Premium Tier */}
            <Card
              size="4"
              style={{
                background: 'linear-gradient(135deg, var(--accent-3) 0%, var(--accent-4) 100%)',
                border: '2px solid var(--accent-8)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => onSelect('premium')}
            >
              <Flex direction="column" gap="4" align="center" style={{ textAlign: 'center' }}>
                <Box
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'var(--accent-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <RocketIcon width="40" height="40" style={{ color: 'white' }} />
                </Box>

                <Box>
                  <Heading size="6" mb="2">Maximize My Visibility</Heading>
                  <Text size="3" style={{ color: 'var(--gray-11)' }}>
                    Premium sponsorship packages over $300
                  </Text>
                </Box>

                <Flex direction="column" gap="2" style={{ width: '100%' }}>
                  <Text size="2" style={{ color: 'var(--gray-12)' }}>✓ Maximum brand exposure</Text>
                  <Text size="2" style={{ color: 'var(--gray-12)' }}>✓ Premium placement & signage</Text>
                  <Text size="2" style={{ color: 'var(--gray-12)' }}>✓ VIP tickets included</Text>
                  <Text size="2" style={{ color: 'var(--gray-12)' }}>✓ Social media spotlight</Text>
                </Flex>

                <Button size="3" style={{ width: '100%' }}>
                  View Premium Packages
                </Button>
              </Flex>
            </Card>

            {/* Targeted Tier */}
            <Card
              size="4"
              style={{
                background: 'var(--gray-3)',
                border: '2px solid var(--gray-6)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => onSelect('targeted')}
            >
              <Flex direction="column" gap="4" align="center" style={{ textAlign: 'center' }}>
                <Box
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'var(--gray-9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <TargetIcon width="40" height="40" style={{ color: 'white' }} />
                </Box>

                <Box>
                  <Heading size="6" mb="2">Targeted Brand Presence</Heading>
                  <Text size="3" style={{ color: 'var(--gray-11)' }}>
                    Focused sponsorship packages under $300
                  </Text>
                </Box>

                <Flex direction="column" gap="2" style={{ width: '100%' }}>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>✓ Strategic brand placement</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>✓ Specific feature focus</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>✓ Cost-effective exposure</Text>
                  <Text size="2" style={{ color: 'var(--gray-11)' }}>✓ Tickets included</Text>
                </Flex>

                <Button size="3" variant="outline" style={{ width: '100%' }}>
                  View Targeted Packages
                </Button>
              </Flex>
            </Card>
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
};

// Fix: Import Grid from Radix
import { Grid } from '@radix-ui/themes';

export default SelfSelectionCTA;
