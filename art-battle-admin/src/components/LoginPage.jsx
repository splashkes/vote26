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
  Box,
  Dialog
} from '@radix-ui/themes';
import { ExclamationTriangleIcon, CheckIcon } from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const LoginPage = () => {
  const { user, loading, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Password reset state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [passwordResetRequested, setPasswordResetRequested] = useState(false);

  // Redirect if already logged in, but pass password reset flag
  if (!loading && user) {
    if (passwordResetRequested) {
      return <Navigate to="/welcome?force_password_change=true" replace />;
    }
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

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    
    if (!resetEmail.trim()) {
      setResetError('Email address is required');
      return;
    }
    
    setResetLoading(true);
    setResetError('');
    setResetSuccess('');
    
    try {
      // First, try to sign in the user to see if they can already log in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: resetEmail.trim(),
        password: 'temp-password-that-will-fail'
      });
      
      // If we get here without error, or with a specific "wrong password" error,
      // it means the user exists and can potentially log in
      
      // Instead of sending reset email, let's flag that they want to reset
      // and try to let them log in normally first
      setPasswordResetRequested(true);
      setResetModalOpen(false);
      setEmail(resetEmail.trim());
      setResetSuccess('Please try logging in with your current password first. If successful, you\'ll be prompted to set a new password.');
      
    } catch (err) {
      // If the above fails, fall back to sending reset email
      try {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          resetEmail.trim(),
          {
            redirectTo: 'https://artb.art/admin/welcome?force_password_change=true'
          }
        );
        
        if (resetError) {
          setResetError(resetError.message || 'Failed to send password reset email');
        } else {
          setResetSuccess('Password reset email sent! Please check your inbox and follow the instructions.');
          setTimeout(() => {
            setResetModalOpen(false);
            setResetEmail('');
            setResetSuccess('');
          }, 3000);
        }
      } catch (resetErr) {
        console.error('Password reset error:', resetErr);
        setResetError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const openResetModal = () => {
    setResetModalOpen(true);
    setResetEmail(email); // Pre-fill with current email if available
    setResetError('');
    setResetSuccess('');
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
            <Button 
              variant="ghost" 
              size="1" 
              onClick={openResetModal}
              disabled={isLoading}
            >
              Forgot your password?
            </Button>
            
            <Text size="1" color="gray" style={{ textAlign: 'center' }}>
              Admin access only. Contact support if you need access.
            </Text>
          </Flex>
        </Flex>
      </Card>

      {/* Password Reset Modal */}
      <Dialog.Root open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <Dialog.Content style={{ maxWidth: '450px' }}>
          <Dialog.Title>Reset Your Password</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Enter your admin email address and we'll send you a password reset link.
          </Dialog.Description>

          <form onSubmit={handlePasswordReset}>
            <Flex direction="column" gap="4">
              {resetError && (
                <Callout.Root color="red">
                  <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
                  <Callout.Text>{resetError}</Callout.Text>
                </Callout.Root>
              )}

              {resetSuccess && (
                <Callout.Root color="green">
                  <Callout.Icon><CheckIcon /></Callout.Icon>
                  <Callout.Text>{resetSuccess}</Callout.Text>
                </Callout.Root>
              )}

              <label>
                <Text size="2" weight="medium">Email Address</Text>
                <TextField.Root
                  type="email"
                  placeholder="your.admin.email@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={resetLoading}
                  mt="1"
                  required
                />
              </label>

              <Flex gap="3" mt="2" justify="end">
                <Dialog.Close>
                  <Button variant="soft" color="gray" disabled={resetLoading}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" loading={resetLoading} disabled={resetLoading}>
                  {resetLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
};

export default LoginPage;