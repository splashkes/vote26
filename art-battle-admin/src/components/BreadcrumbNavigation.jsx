import { useMemo } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import {
  Box,
  Flex,
  Text,
  Button
} from '@radix-ui/themes';
import {
  DashboardIcon,
  PersonIcon,
  ImageIcon,
  GearIcon,
  ChevronRightIcon,
  HomeIcon,
  ExitIcon,
  HamburgerMenuIcon
} from '@radix-ui/react-icons';
import { useAuth } from '../contexts/AuthContext';

const BreadcrumbNavigation = ({ selectedEvent, onSignOut, onToggleSidebar, sidebarCollapsed }) => {
  const location = useLocation();
  const params = useParams();
  const { adminEvents } = useAuth();

  // Generate breadcrumb items based on current path
  const breadcrumbs = useMemo(() => {
    const items = [];
    const pathSegments = location.pathname.split('/').filter(Boolean);

    // Always start with dashboard
    items.push({
      label: 'Dashboard',
      path: '/events',
      icon: HomeIcon,
      current: pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'events')
    });

    // Parse path segments
    if (pathSegments.length > 0) {
      // Handle different routes
      if (pathSegments[0] === 'events') {
        // Events section
        if (pathSegments.length === 1) {
          // Just /events - already handled above
        } else if (pathSegments.length >= 2) {
          // /events/:eventId or /events/:eventId/subsection
          const eventId = pathSegments[1];
          const eventData = selectedEvent || adminEvents?.find(e => e.event_id === eventId);
          
          items.push({
            label: eventData?.event_name || eventData?.name || 'Event',
            path: `/events/${eventId}`,
            icon: DashboardIcon,
            current: pathSegments.length === 2,
            subtitle: eventData?.event_eid || eventData?.eid
          });

          // Handle subsections
          if (pathSegments.length >= 3) {
            const subsection = pathSegments[2];
            const subsectionConfigs = {
              artists: {
                label: 'Artists',
                icon: PersonIcon,
                description: 'Manage event artists and contestants'
              },
              art: {
                label: 'Artwork',
                icon: ImageIcon,
                description: 'View and manage artwork'
              },
              settings: {
                label: 'Settings',
                icon: GearIcon,
                description: 'Event configuration'
              },
              health: {
                label: 'Health Monitor',
                icon: DashboardIcon,
                description: 'AI-powered event analysis'
              },
              live: {
                label: 'Live Monitor',
                icon: DashboardIcon,
                description: 'Real-time event monitoring'
              }
            };

            const config = subsectionConfigs[subsection];
            if (config) {
              items.push({
                label: config.label,
                path: `/events/${eventId}/${subsection}`,
                icon: config.icon,
                current: true,
                description: config.description
              });
            }
          }
        }
      } else {
        // Other top-level routes
        const routeConfigs = {
          users: {
            label: 'Users',
            icon: PersonIcon,
            description: 'User management'
          },
          settings: {
            label: 'Settings',
            icon: GearIcon,
            description: 'System settings'
          },
          health: {
            label: 'System Health',
            icon: DashboardIcon,
            description: 'System monitoring'
          }
        };

        const config = routeConfigs[pathSegments[0]];
        if (config) {
          items.push({
            label: config.label,
            path: `/${pathSegments[0]}`,
            icon: config.icon,
            current: pathSegments.length === 1,
            description: config.description
          });
        }
      }
    }

    return items;
  }, [location.pathname, params, selectedEvent, adminEvents]);

  // Always render for toggle and logout, even with minimal breadcrumbs
  const showFullBreadcrumbs = breadcrumbs.length > 1;

  return (
    <Box py="2" px="4" className="breadcrumb-container" style={{ borderBottom: '1px solid var(--gray-6)' }}>
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        {/* Left side - Toggle and Breadcrumbs */}
        <Flex align="center" gap="2" wrap="wrap" style={{ flex: 1 }}>
          {/* Toggle button */}
          <Button
            variant="ghost"
            size="1"
            onClick={onToggleSidebar}
            style={{ minHeight: '28px', minWidth: '28px' }}
            title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {sidebarCollapsed ? <ChevronRightIcon size={14} /> : <HamburgerMenuIcon size={14} />}
          </Button>

          {/* Breadcrumbs */}
          {showFullBreadcrumbs && breadcrumbs.map((item, index) => {
            const Icon = item.icon;
            const isLast = index === breadcrumbs.length - 1;
            
            return (
              <Flex key={item.path} align="center" gap="2">
                {/* Breadcrumb Item */}
                {isLast ? (
                  // Current page - not clickable
                  <Flex align="center" gap="2">
                    <Icon size={14} color="var(--accent-9)" />
                    <Box>
                      <Text size="2" weight="medium" color="accent">
                        {item.label}
                      </Text>
                      {item.subtitle && (
                        <Text size="1" color="gray" style={{ display: 'block' }}>
                          {item.subtitle}
                        </Text>
                      )}
                      {item.description && (
                        <Text size="1" color="gray" style={{ display: 'block' }}>
                          {item.description}
                        </Text>
                      )}
                    </Box>
                  </Flex>
                ) : (
                  // Clickable breadcrumb
                  <Link to={item.path} style={{ textDecoration: 'none' }}>
                    <Button variant="ghost" size="1" color="gray">
                      <Icon size={14} />
                      {item.label}
                      {item.subtitle && (
                        <Text size="1" color="gray" ml="1">
                          ({item.subtitle})
                        </Text>
                      )}
                    </Button>
                  </Link>
                )}
                
                {/* Separator */}
                {!isLast && (
                  <ChevronRightIcon size={12} color="var(--gray-8)" />
                )}
              </Flex>
            );
          })}
        </Flex>

        {/* Right side - Sign out */}
        <Button
          variant="ghost"
          size="1"
          onClick={onSignOut}
          style={{ minHeight: '28px', minWidth: '28px' }}
          title="Sign Out"
        >
          <ExitIcon size={14} />
        </Button>
      </Flex>
    </Box>
  );
};

export default BreadcrumbNavigation;