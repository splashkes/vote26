import React from 'react';
import { Box, Container, Heading, Text, Button, Flex } from '@radix-ui/themes';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Log to external service if available
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: true
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box style={{ minHeight: '100vh', backgroundColor: 'var(--gray-1)' }}>
          <Container size="2" style={{ maxWidth: '600px', paddingTop: '100px' }}>
            <Box p="4">
              <Flex direction="column" align="center" gap="4">
                <Box style={{ textAlign: 'center' }}>
                  <img
                    src="https://imagedelivery.net/IGZfH_Pl-6S6csykNnXNJw/0ce25113-c21e-4435-1dc0-6020d15fa300/public"
                    alt="Art Battle Vote"
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      maxHeight: '60px',
                      objectFit: 'contain'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const fallback = document.createElement('h1');
                      fallback.innerText = 'ART BATTLE VOTE';
                      fallback.style.cssText = 'color: white; font-weight: 900; letter-spacing: -0.02em; text-transform: uppercase; margin: 0; font-size: 2rem;';
                      e.target.parentNode.appendChild(fallback);
                    }}
                  />
                </Box>
                
                <Heading size="6" style={{ color: 'var(--red-11)', textAlign: 'center' }}>
                  Something went wrong
                </Heading>
                
                <Text size="3" color="gray" style={{ textAlign: 'center' }}>
                  The app encountered an error and couldn't load properly.
                </Text>
                
                <Button 
                  size="3" 
                  onClick={() => window.location.reload()}
                  style={{ width: '100%' }}
                >
                  Reload Page
                </Button>
                
                <Button 
                  size="2" 
                  variant="outline" 
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                  style={{ width: '100%' }}
                >
                  Try Again
                </Button>
                
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <Box style={{ 
                    marginTop: '20px', 
                    padding: '20px', 
                    backgroundColor: 'var(--gray-3)', 
                    borderRadius: '8px',
                    width: '100%'
                  }}>
                    <Text size="2" weight="bold" color="red">Error Details:</Text>
                    <Text size="1" style={{ fontFamily: 'monospace', marginTop: '8px', display: 'block' }}>
                      {this.state.error && this.state.error.toString()}
                    </Text>
                    <Text size="1" style={{ fontFamily: 'monospace', marginTop: '8px', display: 'block' }}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  </Box>
                )}
              </Flex>
            </Box>
          </Container>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;