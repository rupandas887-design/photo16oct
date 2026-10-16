/**
 * Universal Error Viewport & Auto-Scroll Controller.
 * 
 * Automatically scrolls to error messages and invalid fields across all dashboards,
 * forms, popups, and nested scrollable containers.
 * 
 * Guarantees:
 * 1. Automatically finds the primary/first error message or invalid field.
 * 2. If inside a modal/popup, scrolls the modal's inner scroll container rather than moving the background page.
 * 3. If inside a nested scrollable container, scrolls the appropriate container.
 * 4. Leaves comfortable breathing space above the error so it is never hidden behind fixed/sticky headers.
 * 5. Avoids repeated scrolling or jumping when the error is already visible.
 * 6. Supports both client-side and server-side/async error banners.
 */

// Selectors for error elements, banners, and invalid form controls
const PRIMARY_ERROR_SELECTORS = [
  // ARIA & explicit error markers
  '[role="alert"]:not([aria-hidden="true"])',
  '[aria-invalid="true"]',
  '[data-error="true"]',
  '[data-error-banner="true"]',
  '.validation-error-msg',
  '.form-error-msg',
  '.field-error-msg',
  '.error-message',

  // Project-specific error banners and popups
  '#save_error_popup',
  '#save_error_popup_create',
  '#db_category_error_banner',
  '[id*="error_banner" i]',
  '[id*="error_popup" i]',
  '[id*="form_error" i]',
  '[id*="add_staff_error" i]',
  '[id*="error_msg" i]',

  // Input fields highlighted with error borders
  'input[class*="border-rose-500"]:not([disabled])',
  'input[class*="border-red-500"]:not([disabled])',
  'input.\\!border-red-500:not([disabled])',
  'select[class*="border-rose-500"]:not([disabled])',
  'select[class*="border-red-500"]:not([disabled])',
  'textarea[class*="border-rose-500"]:not([disabled])',
  'textarea[class*="border-red-500"]:not([disabled])',
  '.ring-red-500:not([disabled])',
  '.\\!ring-red-500:not([disabled])',

  // Red and rose error alert containers
  'div[class*="bg-rose-500/"][class*="border-rose-500/"]',
  'div[class*="bg-red-500/"][class*="border-red-500/"]',
  'div[class*="bg-rose-950"][class*="border-rose-"]',
  'div[class*="bg-red-950"][class*="border-red-"]',
  'div[class*="border-rose-500"][class*="text-rose-400"]',
  'div[class*="border-rose-500"][class*="text-rose-500"]',
  'div[class*="border-red-500"][class*="text-red-400"]',
  'div[class*="border-red-500"][class*="text-red-500"]',
  'p[class*="text-rose-400"]',
  'p[class*="text-rose-500"]',
  'p[class*="text-red-400"]',
  'p[class*="text-red-500"]',
  'p[class*="text-red-550"]',
  'span[class*="text-rose-400"]',
  'span[class*="text-rose-500"]',
  'span[class*="text-red-400"]',
  'span[class*="text-red-500"]'
];

// Keywords commonly found in actual error messages
const ERROR_TEXT_PATTERNS = [
  'error',
  'failed',
  'fail',
  'required',
  'invalid',
  'already registered',
  'duplicate',
  'unable to',
  'cannot',
  'must be',
  'missing',
  'denied',
  'not allowed',
  'incorrect',
  'at least',
  'characters',
  'please enter',
  'please fill',
  'please select',
  'please provide',
  'unauthorized',
  'permission',
  'conflict'
];

/**
 * Validates whether a candidate element is an actual error message or invalid input,
 * while rejecting table status badges, buttons, and required field asterisks.
 */
function isValidErrorElement(el: HTMLElement): boolean {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (!document.body.contains(el)) return false;

  // Reject interactive action buttons or links
  if (el.tagName === 'BUTTON' || el.tagName === 'A') return false;
  if (el.getAttribute('role') === 'button') return false;

  // Reject floating toast messages (they are fixed in the viewport corners and shouldn't cause page jumps)
  const isFloatingToast = el.classList.contains('fixed') && (
    el.classList.contains('bottom-4') ||
    el.classList.contains('top-4') ||
    el.classList.contains('bottom-5')
  );
  if (isFloatingToast || el.closest('.toast, [role="status"]')) return false;

  // Reject table row status chips (e.g. "Lost", "Overdue", "Cancelled") in data tables
  const tableCell = el.closest('td, th');
  if (tableCell && !el.closest('form') && !el.classList.contains('validation-error-msg')) {
    return false;
  }

  // Reject standard required asterisks (e.g. "*", "* (Required)")
  const rawText = (el.textContent || '').trim();
  if (rawText === '*' || rawText === '* (Required)' || rawText === '*' || rawText === '*(Required)') {
    return false;
  }

  // Check if hidden by CSS
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    el.hasAttribute('hidden')
  ) {
    return false;
  }

  // Form controls with invalid state
  if (
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'TEXTAREA'
  ) {
    if (el.getAttribute('aria-invalid') === 'true') return true;
    const cls = typeof el.className === 'string' ? el.className : '';
    if (
      cls.includes('border-rose-500') ||
      cls.includes('border-red-500') ||
      cls.includes('!border-red-500') ||
      cls.includes('ring-red-500') ||
      cls.includes('!ring-red-500')
    ) {
      return true;
    }
    return false;
  }

  // Explicit error markers
  if (
    el.getAttribute('role') === 'alert' ||
    el.classList.contains('validation-error-msg') ||
    el.classList.contains('form-error-msg') ||
    el.id === 'save_error_popup' ||
    el.id === 'save_error_popup_create' ||
    el.id === 'db_category_error_banner'
  ) {
    return true;
  }

  // Has alert SVG icons
  const hasAlertIcon = el.querySelector(
    '.lucide-shield-alert, .lucide-alert-circle, .lucide-alert-triangle, svg[class*="text-rose-"], svg[class*="text-red-"]'
  );
  if (hasAlertIcon && rawText.length > 2) {
    return true;
  }

  // Text content check for error-like wording
  const lowerText = rawText.toLowerCase();
  const hasErrorKeyword = ERROR_TEXT_PATTERNS.some((pat) => lowerText.includes(pat));
  if (hasErrorKeyword && rawText.length >= 3 && rawText.length < 500) {
    return true;
  }

  return false;
}

/**
 * Searches for all active error elements within a root container and returns
 * them sorted by document position (first to last).
 */
export function findActiveErrorElements(root: Element = document.body): HTMLElement[] {
  const elementsFound = new Set<HTMLElement>();

  for (const selector of PRIMARY_ERROR_SELECTORS) {
    try {
      const matches = root.querySelectorAll<HTMLElement>(selector);
      matches.forEach((m) => {
        if (isValidErrorElement(m)) {
          elementsFound.add(m);
        }
      });
    } catch {
      // Ignore query errors
    }
  }

  const sorted = Array.from(elementsFound);
  sorted.sort((a, b) => {
    const comp = a.compareDocumentPosition(b);
    if (comp & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (comp & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return sorted;
}

/**
 * Finds the closest modal, dialog, or fixed overlay ancestor if the element is inside one.
 */
function findModalOrOverlayAncestor(el: HTMLElement): HTMLElement | null {
  let curr: HTMLElement | null = el.parentElement;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const role = curr.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog') return curr;

    const className = typeof curr.className === 'string' ? curr.className : '';
    const id = curr.id ? curr.id.toLowerCase() : '';

    if (
      (className.includes('fixed') && (className.includes('inset-0') || className.includes('top-0'))) ||
      id.includes('modal') ||
      id.includes('popup') ||
      id.includes('dialog')
    ) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

/**
 * Finds the nearest scrollable container parent of an element.
 */
function findScrollableContainer(
  el: HTMLElement,
  boundary: HTMLElement = document.body
): HTMLElement | null {
  let curr: HTMLElement | null = el.parentElement;

  while (curr && curr !== boundary && curr !== document.documentElement) {
    try {
      const style = window.getComputedStyle(curr);
      const overflowY = style.overflowY;
      const isScrollable =
        (overflowY === 'auto' || overflowY === 'scroll') &&
        curr.scrollHeight > curr.clientHeight;

      if (isScrollable) {
        return curr;
      }

      // Stop climbing if we hit a fixed overlay
      if (style.position === 'fixed') {
        if (curr.scrollHeight > curr.clientHeight) return curr;
        break;
      }
    } catch {
      // Ignore style errors
    }
    curr = curr.parentElement;
  }

  return null;
}

/**
 * Checks if an element is already comfortably visible within its container.
 */
function isElementComfortablyVisibleInContainer(
  element: HTMLElement,
  container: HTMLElement,
  topPadding = 32
): boolean {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const isWithinTop = elementRect.top >= containerRect.top + topPadding * 0.4;
  const isWithinBottom = elementRect.bottom <= containerRect.bottom - 16;
  const isNotTooFarDown = elementRect.top < containerRect.top + containerRect.height * 0.5;

  return isWithinTop && isWithinBottom && isNotTooFarDown;
}

/**
 * Checks if an element is already comfortably visible in the window viewport.
 */
function isElementComfortablyVisibleInWindow(
  element: HTMLElement,
  headerOffset = 96
): boolean {
  const rect = element.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;

  const isBelowHeader = rect.top >= headerOffset;
  const isAboveBottom = rect.bottom <= windowHeight - 32;
  const isUpperHalf = rect.top < windowHeight * 0.55;

  return isBelowHeader && isAboveBottom && isUpperHalf;
}

// Memory of last scrolled error to prevent jitter or repeated jumping
let lastScrolledElement: HTMLElement | null = null;
let lastScrolledText = '';
let lastScrolledTimestamp = 0;

/**
 * Smoothly scrolls an error element into the visible viewport, respecting
 * modals, nested containers, and fixed headers.
 */
export function bringErrorElementIntoView(
  errorEl: HTMLElement,
  force: boolean = false
): boolean {
  if (!errorEl || !document.body.contains(errorEl)) return false;

  const currentText = (errorEl.textContent || '').trim();
  const now = Date.now();

  // If this same error was already brought into view recently and is still visible, avoid jumping
  if (
    !force &&
    lastScrolledElement === errorEl &&
    lastScrolledText === currentText &&
    now - lastScrolledTimestamp < 2500
  ) {
    return false;
  }

  const modalAncestor = findModalOrOverlayAncestor(errorEl);
  let didScroll = false;

  if (modalAncestor) {
    // 1. Error is inside a modal or popup:
    // Scroll the modal's internal scroll container rather than unnecessarily moving the background page.
    const scrollContainer = findScrollableContainer(errorEl, modalAncestor) || modalAncestor;

    if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
      if (!isElementComfortablyVisibleInContainer(errorEl, scrollContainer, 32) || force) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = errorEl.getBoundingClientRect();
        const relativeOffset = elementRect.top - containerRect.top;
        const targetScrollTop = scrollContainer.scrollTop + relativeOffset - 32;

        try {
          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        } catch {
          scrollContainer.scrollTop = Math.max(0, targetScrollTop);
        }
        didScroll = true;
      }
    } else {
      // If modal itself has no overflow, gently ensure internal scroll is at top
      if (modalAncestor.scrollTop !== 0) {
        modalAncestor.scrollTop = 0;
        didScroll = true;
      }
    }
  } else {
    // 2. Error is on the main page:
    // Check if inside a nested scroll container
    const scrollContainer = findScrollableContainer(errorEl, document.body);

    if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
      if (!isElementComfortablyVisibleInContainer(errorEl, scrollContainer, 32) || force) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = errorEl.getBoundingClientRect();
        const relativeOffset = elementRect.top - containerRect.top;
        const targetScrollTop = scrollContainer.scrollTop + relativeOffset - 32;

        try {
          scrollContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth'
          });
        } catch {
          scrollContainer.scrollTop = Math.max(0, targetScrollTop);
        }
        didScroll = true;
      }

      // Also ensure the nested container itself is visible in the window viewport
      if (!isElementComfortablyVisibleInWindow(scrollContainer, 96)) {
        const cRect = scrollContainer.getBoundingClientRect();
        const currentWindowY = window.scrollY || window.pageYOffset;
        const targetWindowY = currentWindowY + cRect.top - 96;

        try {
          window.scrollTo({
            top: Math.max(0, targetWindowY),
            behavior: 'smooth'
          });
        } catch {
          window.scrollTo(0, Math.max(0, targetWindowY));
        }
        didScroll = true;
      }
    } else {
      // Direct main window scroll with fixed header offset (96px padding)
      if (!isElementComfortablyVisibleInWindow(errorEl, 96) || force) {
        const elementRect = errorEl.getBoundingClientRect();
        const currentWindowY = window.scrollY || window.pageYOffset;
        const targetWindowY = currentWindowY + elementRect.top - 96;

        try {
          window.scrollTo({
            top: Math.max(0, targetWindowY),
            behavior: 'smooth'
          });
        } catch {
          window.scrollTo(0, Math.max(0, targetWindowY));
        }
        didScroll = true;
      }
    }
  }

  // Gently focus the input if the error is an input or has an adjacent input
  try {
    if (
      errorEl.tagName === 'INPUT' ||
      errorEl.tagName === 'SELECT' ||
      errorEl.tagName === 'TEXTAREA'
    ) {
      errorEl.focus({ preventScroll: true });
    } else {
      const associatedInput = errorEl.closest('div, form')?.querySelector<HTMLInputElement>(
        'input.border-rose-500, input.border-red-500, input[aria-invalid="true"], input:invalid'
      );
      if (associatedInput) {
        associatedInput.focus({ preventScroll: true });
      }
    }
  } catch {
    // Ignore focus errors
  }

  lastScrolledElement = errorEl;
  lastScrolledText = currentText;
  lastScrolledTimestamp = Date.now();

  return didScroll;
}

/**
 * Public function to automatically find and scroll to the first error in the page or container.
 * Can be called manually from any component submission or validation handler.
 */
export function scrollToFirstError(
  containerOrSelector?: HTMLElement | string | null,
  force: boolean = false
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  let root: Element = document.body;
  if (containerOrSelector) {
    if (typeof containerOrSelector === 'string') {
      root = document.querySelector(containerOrSelector) || document.body;
    } else if (containerOrSelector instanceof Element) {
      root = containerOrSelector;
    }
  }

  const errors = findActiveErrorElements(root);
  if (errors.length > 0) {
    return bringErrorElementIntoView(errors[0], force);
  }

  return false;
}

let isGlobalErrorViewportInitialized = false;

/**
 * Initializes the global error viewport handler.
 * Observes DOM mutations, form submissions, and async state changes across the entire app.
 */
export function initGlobalErrorViewportHandler(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (isGlobalErrorViewportInitialized) return () => {};

  isGlobalErrorViewportInitialized = true;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const checkErrorsAndScroll = (force = false) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    debounceTimer = setTimeout(() => {
      // Find open modal if any exists; otherwise document.body
      const openModal = document.querySelector<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], .fixed.inset-0, [class*="fixed"][class*="inset-0"]'
      );

      const root = openModal && document.body.contains(openModal) ? openModal : document.body;
      const errors = findActiveErrorElements(root);

      if (errors.length > 0) {
        bringErrorElementIntoView(errors[0], force);
      }
    }, 40);
  };

  // MutationObserver to catch error messages right after they render
  const observer = new MutationObserver((mutations) => {
    let hasPotentialErrorMutation = false;

    for (const mutation of mutations) {
      // Check newly added nodes
      if (mutation.addedNodes.length > 0) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
            const txt = (el.textContent || '').toLowerCase();

            if (
              cls.includes('rose') ||
              cls.includes('red') ||
              cls.includes('error') ||
              cls.includes('alert') ||
              el.getAttribute('role') === 'alert' ||
              el.getAttribute('aria-invalid') === 'true' ||
              ERROR_TEXT_PATTERNS.some((pat) => txt.includes(pat))
            ) {
              hasPotentialErrorMutation = true;
              break;
            }
          }
        }
      }

      // Check attribute changes on invalid inputs or classes
      if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        const attr = mutation.attributeName;
        if (attr === 'class' || attr === 'aria-invalid' || attr === 'style') {
          const cls = typeof target.className === 'string' ? target.className.toLowerCase() : '';
          if (
            cls.includes('rose') ||
            cls.includes('red') ||
            cls.includes('error') ||
            target.getAttribute('aria-invalid') === 'true'
          ) {
            hasPotentialErrorMutation = true;
            break;
          }
        }
      }

      if (hasPotentialErrorMutation) break;
    }

    if (hasPotentialErrorMutation) {
      checkErrorsAndScroll(false);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-invalid', 'style', 'hidden']
  });

  // Listen to form submit attempts to catch validation errors
  const handleSubmitAttempt = () => {
    // Allow state/DOM to update first, then scan
    setTimeout(() => checkErrorsAndScroll(true), 30);
    setTimeout(() => checkErrorsAndScroll(true), 120);
    setTimeout(() => checkErrorsAndScroll(true), 300);
  };

  window.addEventListener('submit', handleSubmitAttempt, true);

  // Also listen for button clicks on submit buttons or action triggers
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target) {
      const btn = target.closest('button, [role="button"], input[type="submit"]');
      if (btn) {
        const type = btn.getAttribute('type');
        const text = (btn.textContent || '').toLowerCase();
        const isActionBtn =
          type === 'submit' ||
          type !== 'button' ||
          text.includes('save') ||
          text.includes('confirm') ||
          text.includes('submit') ||
          text.includes('create') ||
          text.includes('onboard') ||
          text.includes('add') ||
          text.includes('update') ||
          text.includes('assign');

        if (isActionBtn) {
          handleSubmitAttempt();
        }
      }
    }
  };
  window.addEventListener('click', handleClick, true);

  return () => {
    observer.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
    window.removeEventListener('submit', handleSubmitAttempt, true);
    window.removeEventListener('click', handleClick, true);
    isGlobalErrorViewportInitialized = false;
  };
}
