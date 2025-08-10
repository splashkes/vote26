import { debugValue } from '../lib/debugHelpers';

/**
 * Component for displaying field values with debug support
 */
export const DebugField = ({ 
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
  
  return (
    <span 
      className={`${className} ${isDebugValue ? 'debug-field' : ''}`}
      style={{
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
      }}
      title={isDebugValue ? `Missing field: ${fieldName}` : undefined}
    >
      {prefix}{displayValue}{suffix}
    </span>
  );
};

/**
 * Debug component that shows object structure
 */
export const DebugObjectViewer = ({ obj, label, collapsed = true }) => {
  if (!window.ADMIN_DEBUG_MODE) return null;

  return (
    <details className="debug-object-viewer" style={{
      margin: '10px 0',
      padding: '10px',
      border: '1px dashed #555',
      borderRadius: '4px',
      backgroundColor: '#1a1a1a',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <summary style={{ cursor: 'pointer', color: '#888' }}>
        🔍 Debug: {label}
      </summary>
      <pre style={{ 
        marginTop: '10px', 
        overflow: 'auto', 
        maxHeight: '300px',
        color: '#ccc'
      }}>
        {JSON.stringify(obj, null, 2)}
      </pre>
    </details>
  );
};