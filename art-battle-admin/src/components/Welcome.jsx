import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  Heading,
  Text,
  TextField,
  Button,
  Flex,
  Callout,
  Spinner
} from '@radix-ui/themes';
import { CheckIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const Welcome = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [linkExpired, setLinkExpired] = useState(false);
  const [expiredToken, setExpiredToken] = useState('');
  const [requestingNewLink, setRequestingNewLink] = useState(false);
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    // Check for force password change from URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('force_password_change') === 'true') {
      setForcePasswordChange(true);
    }
    
    // Check for errors in URL hash
    const checkForErrors = () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const urlError = hashParams.get('error');
      const errorCode = hashParams.get('error_code');
      const errorDescription = hashParams.get('error_description');
      
      if (urlError) {
        if (errorCode === 'otp_expired' || urlError === 'access_denied') {
          // Store the expired token to send to server for processing
          const expiredToken = hashParams.get('access_token');
          
          setLinkExpired(true);
          setExpiredToken(expiredToken || '');
          setError('Your invitation link has expired. Please request a new one below.');
        } else {
          setError(`Authentication error: ${errorDescription || urlError}`);
        }
        // Clear the hash
        window.history.replaceState(null, '', window.location.pathname);
        return true;
      }
      return false;
    };
    
    // Handle auth session from URL hash fragment
    const handleAuthSession = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      if (accessToken && refreshToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          
          if (error) {
            console.error('Error setting session:', error);
            if (type === 'recovery') {
              setError('Failed to authenticate for password reset. Please try the reset link again.');
            } else {
              setError('Failed to authenticate. Please try clicking the invite link again.');
            }
          } else {
            // Check if this is a password reset flow
            if (type === 'recovery') {
              setIsPasswordReset(true);
            }
            // Clear the hash from URL
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {
          console.error('Auth session error:', err);
          setError('Authentication failed. Please try again.');
        }
      }
    };
    
    // Check for errors first
    const hasErrors = checkForErrors();
    
    // Process auth session if no errors
    if (!hasErrors && window.location.hash.includes('access_token')) {
      handleAuthSession();
    }
    
    // If user is already logged in and has admin access, redirect to dashboard
    if (user) {
      checkAdminAccess();
    }
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user?.email) return;
    
    try {
      const { data: adminUser } = await supabase
        .from('abhq_admin_users')
        .select('active, level')
        .eq('email', user.email)
        .single();
        
      if (adminUser?.active) {
        navigate('/');
      }
    } catch (err) {
      console.error('Error checking admin access:', err);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const handleRequestNewLink = async () => {
    if (!expiredToken) {
      setError('Cannot resend invite - no expired token found. Please contact an administrator.');
      return;
    }
    
    setRequestingNewLink(true);
    setError('');
    setSuccess('');
    
    try {
      const { data, error: resendError } = await supabase.functions.invoke('admin-resend-invite', {
        body: { expiredToken: expiredToken }
      });

      if (resendError) throw resendError;
      if (!data.success) throw new Error(data.error || 'Failed to resend invite');

      setSuccess(data.message || 'A new invitation link has been sent to your email. Please check your inbox. The link is valid for 24 hours.');
      setLinkExpired(false);
      
    } catch (err) {
      console.error('Error resending invite:', err);
      setError(err.message || 'Failed to resend invitation. Please contact an administrator.');
    } finally {
      setRequestingNewLink(false);
    }
  };

  const validateForm = () => {
    if (!isPasswordReset && !formData.name.trim()) {
      setError('Name is required');
      return false;
    }
    
    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Update the user's password and optionally name
      const updateData = { password: formData.password };
      
      if (!isPasswordReset) {
        updateData.data = { 
          name: formData.name,
          display_name: formData.name 
        };
      }
      
      const { error: updateError } = await supabase.auth.updateUser(updateData);

      if (updateError) {
        throw updateError;
      }

      // Mark invitation as accepted and activate the admin user record
      if (user?.email) {
        const { error: adminError } = await supabase
          .from('abhq_admin_users')
          .update({ 
            active: true,
            invitation_accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('email', user.email);

        if (adminError) {
          console.error('Error activating admin user:', adminError);
          // Don't fail the whole process if this fails
        }
      }

      if (isPasswordReset) {
        setSuccess('Password updated successfully! You can now use your new password to sign in.');
      } else {
        setSuccess('Welcome! Your admin account has been set up successfully.');
      }
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (err) {
      console.error('Setup error:', err);
      setError(err.message || 'Failed to set up your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // If no user is logged in, show message to check email
  if (!user) {
    return (
      <Box p="6" style={{ maxWidth: '500px', margin: '0 auto', marginTop: '10vh' }}>
        <Card>
          <Box p="6" style={{ textAlign: 'center' }}>
            <Heading size="6" mb="4">Welcome to Art Battle Admin</Heading>
            
            {/* Show error if link expired */}
            {error && (
              <Callout.Root color="red" mb="4">
                <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}
            
            {/* Show success message if new link sent */}
            {success && (
              <Callout.Root color="green" mb="4">
                <Callout.Icon><CheckIcon /></Callout.Icon>
                <Callout.Text>{success}</Callout.Text>
              </Callout.Root>
            )}
            
            {linkExpired ? (
              <Flex direction="column" gap="4">
                <Text color="gray" mb="2">
                  Your invitation link has expired. Click below to request a new one.
                </Text>
                <Button 
                  onClick={handleRequestNewLink}
                  loading={requestingNewLink}
                  disabled={requestingNewLink}
                >
                  {requestingNewLink ? 'Sending...' : 'Request New Invitation Link'}
                </Button>
                <Text size="1" color="gray">
                  The new link will be valid for 24 hours.
                </Text>
              </Flex>
            ) : (
              <>
                <Text color="gray" mb="4">
                  Please check your email and click the invitation link to access the admin interface.
                </Text>
                <Text size="2" color="gray">
                  If you've already clicked the link, please wait a moment while we load your account...
                </Text>
              </>
            )}
          </Box>
        </Card>
      </Box>
    );
  }

  return (
    <Box p="6" style={{ maxWidth: '500px', margin: '0 auto', marginTop: '10vh' }}>
      <Card>
        <form onSubmit={handleSubmit}>
          <Box p="6">
            <Heading size="6" mb="2">
              {isPasswordReset ? 'Reset Your Password' : 'Complete Your Admin Setup'}
            </Heading>
            <Text color="gray" mb="6">
              {isPasswordReset 
                ? 'Please enter your new password to complete the reset process.'
                : 'Welcome to Art Battle Admin! Please set up your account to continue.'
              }
            </Text>

            {error && (
              <Callout.Root color="red" mb="4">
                <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            {success && (
              <Callout.Root color="green" mb="4">
                <Callout.Icon><CheckIcon /></Callout.Icon>
                <Callout.Text>{success}</Callout.Text>
              </Callout.Root>
            )}

            <Flex direction="column" gap="4">
              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Email (confirmed)
                </Text>
                <TextField.Root
                  value={user.email}
                  disabled
                  style={{ backgroundColor: 'var(--gray-3)' }}
                />
              </Box>

              {!isPasswordReset && (
                <Box>
                  <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                    Your Name *
                  </Text>
                  <TextField.Root
                    placeholder="Enter your full name"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={loading}
                  />
                </Box>
              )}

              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  New Password *
                </Text>
                <TextField.Root
                  type="password"
                  placeholder="Choose a secure password (8+ characters)"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  disabled={loading}
                />
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
                  Confirm Password *
                </Text>
                <TextField.Root
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  disabled={loading}
                />
              </Box>

              <Button 
                type="submit" 
                size="3" 
                disabled={loading}
                style={{ marginTop: '16px' }}
              >
                {loading ? (
                  <Flex align="center" gap="2">
                    <Spinner size="1" />
                    {isPasswordReset ? 'Updating Password...' : 'Setting up...'}
                  </Flex>
                ) : (
                  isPasswordReset ? 'Update Password' : 'Complete Setup'
                )}
              </Button>
            </Flex>
          </Box>
        </form>
      </Card>
    </Box>
  );
};

export default Welcome;