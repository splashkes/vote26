import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Container, 
  Card, 
  Heading, 
  TextField, 
  Button, 
  Box, 
  Text,
  Callout
} from '@radix-ui/themes';
import { InfoCircledIcon } from '@radix-ui/react-icons';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await signInWithEmail(email, password);
      
      if (error) {
        setError(error.message);
      } else if (data.user) {
        // Check if user is super admin
        if (data.user.user_metadata?.is_super_admin) {
          navigate('/designer');
        } else {
          setError('Access denied. Super admin privileges required.');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size="1" style={{ maxWidth: '400px', marginTop: '100px' }}>
      <Card size="4">
        <Box p="6">
          <Heading size="6" mb="4" align="center">
            Designer Login
          </Heading>
          
          <Text size="2" color="gray" align="center" mb="6">
            Super admin access required
          </Text>

          {error && (
            <Callout.Root color="red" mb="4">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <form onSubmit={handleSubmit}>
            <Box mb="4">
              <TextField.Root
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Box>
            
            <Box mb="6">
              <TextField.Root
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Box>
            
            <Button 
              type="submit" 
              size="3" 
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </Box>
      </Card>
    </Container>
  );
};

export default LoginPage;