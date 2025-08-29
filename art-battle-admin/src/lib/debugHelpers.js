/**
 * Debug helpers for displaying missing data in development
 */

// Global debug mode flag - disabled in production
window.ADMIN_DEBUG_MODE = false;

export const setDebugMode = (enabled) => {
  window.ADMIN_DEBUG_MODE = enabled;
  console.log(`Admin Debug Mode: ${enabled ? 'ON' : 'OFF'}`);
};

/**
 * Display a value or a debug placeholder if the value is missing
 * @param {any} value - The value to display
 * @param {string} fieldName - Name of the field for debug display
 * @param {any} fallback - Fallback value to show in production
 * @returns {any} - The value, fallback, or debug info
 */
export const debugValue = (value, fieldName, fallback = '—') => {
  if (value !== null && value !== undefined && value !== '') {
    return value;
  }

  if (window.ADMIN_DEBUG_MODE) {
    return `[${fieldName}]`;
  }

  return fallback;
};

/**
 * Component for displaying field values with debug support
 * This should be imported as a React component in .jsx files
 */
export const createDebugField = (React) => ({ 
  value, 
  fieldName, 
  fallback = '—', 
  className = '',
  style = {},
  prefix = '',
  suffix = ''
}) => {
  const displayValue = debugValue(value, fieldName, fallback);
  const isDebugValue = window.ADMIN_DEBUG_MODE && (value === null || value === undefined || value === '');
  
  return React.createElement('span', {
    className: `${className} ${isDebugValue ? 'debug-field' : ''}`,
    style: {
      ...style,
      ...(isDebugValue ? {
        fontFamily: 'monospace',
        fontSize: '0.8em',
        color: '#888',
        backgroundColor: '#2a2a2a',
        padding: '2px 4px',
        borderRadius: '3px',
        border: '1px dashed #555'
      } : {})
    },
    title: isDebugValue ? `Missing field: ${fieldName}` : undefined
  }, `${prefix}${displayValue}${suffix}`);
};

/**
 * Log object structure for debugging
 * @param {object} obj - Object to analyze
 * @param {string} label - Label for the log
 */
export const debugObject = (obj, label = 'Object') => {
  if (!window.ADMIN_DEBUG_MODE) return;
  
  console.group(`🔍 Debug: ${label}`);
  console.log('Raw object:', obj);
  console.log('Object keys:', obj ? Object.keys(obj) : 'null/undefined');
  console.log('Object type:', typeof obj);
  
  if (obj && typeof obj === 'object') {
    const summary = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      const type = Array.isArray(value) ? `array[${value.length}]` : typeof value;
      summary[key] = {
        type,
        hasValue: value !== null && value !== undefined && value !== '',
        preview: type === 'string' && value ? value.slice(0, 50) + (value.length > 50 ? '...' : '') : value
      };
    });
    console.table(summary);
  }
  
  console.groupEnd();
};

/**
 * Debug component that shows object structure
 * This should be imported as a React component in .jsx files
 */
export const createDebugObjectViewer = (React) => ({ obj, label, collapsed = true }) => {
  if (!window.ADMIN_DEBUG_MODE) return null;

  return React.createElement('details', {
    className: 'debug-object-viewer',
    style: {
      margin: '10px 0',
      padding: '10px',
      border: '1px dashed #555',
      borderRadius: '4px',
      backgroundColor: '#1a1a1a',
      fontFamily: 'monospace',
      fontSize: '12px'
    }
  }, [
    React.createElement('summary', {
      key: 'summary',
      style: { cursor: 'pointer', color: '#888' }
    }, `🔍 Debug: ${label}`),
    React.createElement('pre', {
      key: 'content',
      style: { 
        marginTop: '10px', 
        overflow: 'auto', 
        maxHeight: '300px',
        color: '#ccc'
      }
    }, JSON.stringify(obj, null, 2))
  ]);
};