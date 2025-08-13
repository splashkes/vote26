import { AuthProvider } from './AuthContext';
import { EventsProvider } from './EventsContext';
import { AdminProvider } from './AdminContext';

export const AppContexts = ({ children }) => {
  return (
    <AuthProvider>
      <AdminProvider>
        <EventsProvider>
          {children}
        </EventsProvider>
      </AdminProvider>
    </AuthProvider>
  );
};