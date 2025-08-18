// Utility for adding flash animations to elements when realtime data updates

export const flashElement = (elementId, duration = 300) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.style.transition = `background-color ${duration}ms ease-in-out`;
  element.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
  
  setTimeout(() => {
    element.style.backgroundColor = '';
  }, duration);
};

export const flashClass = (className, duration = 300) => {
  const elements = document.getElementsByClassName(className);
  Array.from(elements).forEach(element => {
    element.style.transition = `background-color ${duration}ms ease-in-out`;
    element.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    
    setTimeout(() => {
      element.style.backgroundColor = '';
    }, duration);
  });
};

export const flashRef = (ref, duration = 300) => {
  if (!ref.current) return;
  
  const element = ref.current;
  element.style.transition = `background-color ${duration}ms ease-in-out`;
  element.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
  
  setTimeout(() => {
    element.style.backgroundColor = '';
  }, duration);
};

// Create a CSS animation for subtle flash effect
export const injectFlashStyles = () => {
  if (document.getElementById('realtime-flash-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'realtime-flash-styles';
  style.textContent = `
    @keyframes realtimeFlash {
      0% { background-color: transparent; }
      50% { background-color: rgba(0, 255, 0, 0.1); }
      100% { background-color: transparent; }
    }
    
    .realtime-flash {
      animation: realtimeFlash 0.3s ease-in-out;
    }
    
    @keyframes realtimeFlashSubtle {
      0% { opacity: 1; }
      50% { opacity: 0.7; }
      100% { opacity: 1; }
    }
    
    .realtime-flash-subtle {
      animation: realtimeFlashSubtle 0.2s ease-in-out;
    }
  `;
  document.head.appendChild(style);
};

// Apply flash class temporarily
export const applyFlashClass = (element, className = 'realtime-flash') => {
  if (!element) return;
  
  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, 300);
};