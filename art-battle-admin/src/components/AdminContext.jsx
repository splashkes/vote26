import { Box, Text, Card, Flex, Badge, Separator } from '@radix-ui/themes';
import { useLocation } from 'react-router-dom';
import { DebugObjectViewer } from './DebugComponents';
import { setDebugMode } from '../lib/debugHelpers';
import { useAuth } from '../contexts/AuthContext';

const AdminContext = () => {
  const location = useLocation();
  const { user, adminEvents } = useAuth();

  const contextData = {
    currentPath: location.pathname,
    user: user ? {
      id: user.id,
      email: user.email,
      created_at: user.created_at
    } : null,
    adminEvents: adminEvents?.length || 0,
    timestamp: new Date().toISOString()
  };

  return (
    <Box p="4">
      <Flex direction="column" gap="4">
        <Box>
          <Text size="3" weight="bold" mb="3" style={{ display: 'block' }}>
            Context Panel
          </Text>
          <Text size="2" color="gray">
            Current path: {location.pathname}
          </Text>
        </Box>

        <Separator />

        <Card>
          <Box p="3">
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              Admin Status
            </Text>
            <Flex direction="column" gap="2">
              <Text size="1">
                Events: <Badge>{adminEvents?.length || 0}</Badge>
              </Text>
              <Text size="1">
                User: {user?.email || 'Not logged in'}
              </Text>
            </Flex>
          </Box>
        </Card>

        <Card>
          <Box p="3">
            <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
              Debug Controls
            </Text>
            <Flex direction="column" gap="2">
              <button
                onClick={() => setDebugMode(true)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--gray-3)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Enable Debug Mode
              </button>
              <button
                onClick={() => setDebugMode(false)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--gray-3)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Disable Debug Mode
              </button>
              <button
                onClick={() => console.log('Admin Events:', adminEvents)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  border: '1px solid var(--gray-6)',
                  background: 'var(--gray-3)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Log Admin Events
              </button>
            </Flex>
          </Box>
        </Card>

        <DebugObjectViewer 
          obj={contextData} 
          label="Context Data" 
        />
      </Flex>
    </Box>
  );
};

export default AdminContext;