import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Card,
  Flex,
  Text,
  TextField,
  Button,
  Callout,
  Heading,
  Box
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const LoginPage = () => {
  const { user, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already logged in
  if (!loading && user) {
    return <Navigate to="/events" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: signInError } = await signInWithEmail(email, password);
      
      if (signInError) {
        setError(signInError.message || 'Login failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="login-page">
        <Card className="login-form">
          <Flex direction="column" align="center" justify="center" p="6">
            <Text>Loading...</Text>
          </Flex>
        </Card>
      </div>
    );
  }

  return (
    <div className="login-page">
      <Card className="login-form">
        <Flex direction="column" gap="4" p="6">
          <Box mb="4" style={{ textAlign: 'center' }}>
            <Heading size="6" mb="2">Art Battle Admin</Heading>
            <Text color="gray" size="2">Sign in to manage events and artists</Text>
          </Box>

          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="3">
              <TextField.Root
                type="email"
                placeholder="Admin email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              
              <TextField.Root
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              
              <Button 
                type="submit" 
                size="3" 
                disabled={isLoading || !email || !password}
                style={{ width: '100%' }}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </Flex>
          </form>

          <Flex direction="column" align="center" gap="2" style={{ marginTop: '1rem' }}>
            <Text size="1" color="gray" style={{ textAlign: 'center' }}>
              Admin access only. Contact support if you need access.
            </Text>
          </Flex>
        </Flex>
      </Card>

    </div>
  );
};

export default LoginPage;