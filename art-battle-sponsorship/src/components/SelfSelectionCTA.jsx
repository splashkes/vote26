import { Box, Container, Flex, Heading, Text, Card, Button, Grid } from '@radix-ui/themes';
import { StarFilledIcon, TargetIcon } from '@radix-ui/react-icons';

const SelfSelectionCTA = ({ onSelect, isExpired = false }) => {
  return (
    <Box py="9" style={{ position: 'relative', padding: '3rem 1rem', overflow: 'hidden' }}>
      {/* Background Image */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(https://picsum.photos/1920/1080?random=3)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'brightness(0.25)',
        transform: 'translate3d(0,0,0)',
        willChange: 'transform',
        zIndex: 0
      }} />

      {/* Combined Overlay Gradients (single layer) */}
      <Box style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(to bottom, black 0%, rgba(30,60,120,0.6) 15%, rgba(10,20,40,0.8) 85%, black 100%)',
        transform: 'translate3d(0,0,0)',
        zIndex: 1
      }} />

      <Container size="3" px="4" style={{ position: 'relative', zIndex: 2 }}>
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
                cursor: isExpired ? 'not-allowed' : 'pointer',
                opacity: isExpired ? 0.5 : 1,
                transition: 'all 0.3s ease'
              }}
              onClick={() => !isExpired && onSelect('premium')}
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
                  <StarFilledIcon width="40" height="40" style={{ color: 'white' }} />
                </Box>

                <Box>
                  <Heading size="6" mb="2">Maximize Awareness</Heading>
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

                <Button size="3" style={{ width: '100%' }} disabled={isExpired}>
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
                cursor: isExpired ? 'not-allowed' : 'pointer',
                opacity: isExpired ? 0.5 : 1,
                transition: 'all 0.3s ease'
              }}
              onClick={() => !isExpired && onSelect('targeted')}
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
                  <Heading size="6" mb="2">Targeted Activations</Heading>
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

                <Button size="3" variant="outline" style={{ width: '100%' }} disabled={isExpired}>
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

export default SelfSelectionCTA;
