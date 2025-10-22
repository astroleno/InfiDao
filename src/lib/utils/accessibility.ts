// Accessibility utilities

// Announce messages to screen readers
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  if (typeof document === 'undefined') return;

  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

// Focus management utilities
export class FocusManager {
  private static elementStack: HTMLElement[] = [];

  // Trap focus within a container
  static trapFocus(container: HTMLElement) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    firstElement.focus();

    // Return cleanup function
    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }

  // Save current focused element
  static saveFocus() {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && activeElement !== document.body) {
      this.elementStack.push(activeElement);
    }
  }

  // Restore focus to previously saved element
  static restoreFocus() {
    const element = this.elementStack.pop();
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
  }

  // Clear focus stack
  static clearFocusStack() {
    this.elementStack = [];
  }
}

// Keyboard navigation utilities
export function setupKeyboardNavigation(
  container: HTMLElement,
  options: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
    onSelect?: (element: HTMLElement) => void;
  } = {}
) {
  const { orientation = 'vertical', loop = true, onSelect } = options;
  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  ) as NodeListOf<HTMLElement>;

  if (focusableElements.length === 0) return;

  let currentIndex = -1;

  const handleKeyDown = (e: KeyboardEvent) => {
    const isVertical = orientation === 'vertical';
    const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
    const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';

    switch (e.key) {
      case nextKey:
        e.preventDefault();
        currentIndex = (currentIndex + 1) % focusableElements.length;
        focusableElements[currentIndex].focus();
        break;

      case prevKey:
        e.preventDefault();
        currentIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
        focusableElements[currentIndex].focus();
        break;

      case 'Home':
        e.preventDefault();
        currentIndex = 0;
        focusableElements[0].focus();
        break;

      case 'End':
        e.preventDefault();
        currentIndex = focusableElements.length - 1;
        focusableElements[currentIndex].focus();
        break;

      case 'Enter':
      case ' ':
        if (document.activeElement && onSelect) {
          e.preventDefault();
          onSelect(document.activeElement as HTMLElement);
        }
        break;

      case 'Escape':
        // Let the parent handle escape
        container.dispatchEvent(new CustomEvent('escape'));
        break;
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}

// ARIA utilities
export function updateAriaAttributes(
  element: HTMLElement,
  attributes: Record<string, string | boolean | null>
) {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === null || value === false) {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
    }
  });
}

// Reduced motion utilities
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// High contrast mode utilities
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}

// Screen reader detection
export function detectScreenReader(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for common screen reader indicators
  const hasVoiceOver = window.speechSynthesis !== undefined;
  const hasHighContrast = prefersHighContrast();
  const hasReducedMotion = prefersReducedMotion();

  return hasVoiceOver || hasHighContrast || hasReducedMotion;
}

// Skip links utility
export function setupSkipLinks() {
  if (typeof document === 'undefined') return;

  const skipLinks = document.querySelectorAll('a[href^="#"]') as NodeListOf<HTMLAnchorElement>;

  skipLinks.forEach(link => {
    const targetId = link.getAttribute('href')?.slice(1);
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      target.focus();
      target.scrollIntoView();
    });
  });
}

// Color contrast utilities
export function getContrastRatio(hex1: string, hex2: string): number {
  const luminance1 = getLuminance(hex1);
  const luminance2 = getLuminance(hex2);

  const brightest = Math.max(luminance1, luminance2);
  const darkest = Math.min(luminance1, luminance2);

  return (brightest + 0.05) / (darkest + 0.05);
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

// Live region utilities
export function createLiveRegion(type: 'polite' | 'assertive' = 'polite'): HTMLElement {
  const region = document.createElement('div');
  region.setAttribute('aria-live', type);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  document.body.appendChild(region);
  return region;
}

// Progress bar accessibility
export function setupProgressBar(
  element: HTMLElement,
  options: {
    value: number;
    max?: number;
    label?: string;
  }
) {
  const { value, max = 100, label } = options;

  updateAriaAttributes(element, {
    role: 'progressbar',
    'aria-valuenow': value.toString(),
    'aria-valuemin': '0',
    'aria-valuemax': max.toString(),
    'aria-label': label
  });

  // Update visual progress
  const progressBar = element.querySelector('[data-progress-bar]');
  if (progressBar) {
    (progressBar as HTMLElement).style.width = `${(value / max) * 100}%`;
  }
}

// Form validation accessibility
export function announceFormErrors(errors: Record<string, string[]>) {
  const errorMessages = Object.values(errors).flat();
  const message = `表单验证失败，请检查以下字段：${errorMessages.join('、')}`;
  announceToScreenReader(message, 'assertive');
}

// Tooltips accessibility
export function setupTooltip(
  trigger: HTMLElement,
  tooltip: HTMLElement,
  options: {
    placement?: 'top' | 'bottom' | 'left' | 'right';
    trigger?: 'hover' | 'click' | 'focus';
  } = {}
) {
  const { placement = 'top', trigger: triggerType = 'hover' } = options;

  // Set up ARIA attributes
  updateAriaAttributes(trigger, {
    'aria-describedby': tooltip.id,
    'aria-expanded': 'false'
  });

  updateAriaAttributes(tooltip, {
    role: 'tooltip',
    'aria-hidden': 'true'
  });

  const showTooltip = () => {
    updateAriaAttributes(trigger, { 'aria-expanded': 'true' });
    updateAriaAttributes(tooltip, { 'aria-hidden': 'false' });
  };

  const hideTooltip = () => {
    updateAriaAttributes(trigger, { 'aria-expanded': 'false' });
    updateAriaAttributes(tooltip, { 'aria-hidden': 'true' });
  };

  // Event listeners based on trigger type
  if (triggerType === 'hover') {
    trigger.addEventListener('mouseenter', showTooltip);
    trigger.addEventListener('mouseleave', hideTooltip);
    trigger.addEventListener('focus', showTooltip);
    trigger.addEventListener('blur', hideTooltip);
  } else if (triggerType === 'click') {
    trigger.addEventListener('click', showTooltip);
    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target as Node) && !tooltip.contains(e.target as Node)) {
        hideTooltip();
      }
    });
  }

  // Keyboard navigation
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
      trigger.focus();
    }
  });

  // Return cleanup function
  return () => {
    trigger.removeEventListener('mouseenter', showTooltip);
    trigger.removeEventListener('mouseleave', hideTooltip);
    trigger.removeEventListener('focus', showTooltip);
    trigger.removeEventListener('blur', hideTooltip);
  };
}