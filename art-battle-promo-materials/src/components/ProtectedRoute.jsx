import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spinner, Container, Box } from '@radix-ui/themes';

const ProtectedRoute = ({ children }) => {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <Container size="1">
        <Box style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spinner size="3" />
        </Box>
      </Container>
    );
  }

  if (!user || !isSuperAdmin()) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;