/**
 * Universal Viewport & Auto-Scroll Controller for Popups, Modals, and Overlays.
 * 
 * Ensures that whenever ANY modal, popup, dialog, or overlay opens across ANY dashboard:
 * 1. Automatically scrolls the page/viewport to bring the opened popup into immediate view (centered).
 * 2. Automatically resets internal scrollable containers inside the modal to the TOP (scrollTop = 0).
 * 3. Prevents any stuck black screens, dark overlays, or locked body scroll states.
 */

/**
 * Resets the scroll position of an element and all its internal scrollable children to top (scrollTop = 0).
 */
export function resetInternalScrollContainersToTop(container: HTMLElement) {
  if (!container) return;

  const resetElement = (el: HTMLElement) => {
    try {
      if (el.scrollTop !== 0) {
        el.scrollTop = 0;
      }
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
    } catch {
      // Ignore errors
    }
  };

  // Reset the container itself
  resetElement(container);

  // Find all internal scrollable child elements
  const scrollableElements = container.querySelectorAll<HTMLElement>(
    '.overflow-y-auto, .overflow-auto, .overflow-y-scroll, [class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"], [data-scroll-container="true"]'
  );

  scrollableElements.forEach((el) => {
    resetElement(el);
  });

  // Also query divs/forms/sections/articles with overflow and scrollHeight > clientHeight
  const allElements = container.querySelectorAll<HTMLElement>('div, form, section, main, article, ul');
  allElements.forEach((el) => {
    try {
      if (el.scrollHeight > el.clientHeight && el.clientHeight > 0) {
        const style = window.getComputedStyle(el);
        if (
          style.overflowY === 'auto' ||
          style.overflowY === 'scroll' ||
          style.overflow === 'auto' ||
          style.overflow === 'scroll'
        ) {
          resetElement(el);
        }
      }
    } catch {
      // Ignore errors
    }
  });
}

/**
 * Ensures a modal/popup is scrolled into the user's viewport and its internal scroll areas are reset to top.
 */
export function ensureModalScrolledToTop(target: HTMLElement | string | null | undefined) {
  if (typeof window === 'undefined' || !target) return;

  const element = typeof target === 'string' ? (document.querySelector(target) as HTMLElement) : target;
  if (!element) return;

  const performResetAndScroll = () => {
    // 1. Reset internal scroll positions to top
    resetInternalScrollContainersToTop(element);

    const fixedOverlay = element.closest('.fixed.inset-0, [class*="fixed"][class*="inset-0"]') as HTMLElement;
    if (fixedOverlay) {
      if (fixedOverlay.scrollTop !== 0) fixedOverlay.scrollTop = 0;
      resetInternalScrollContainersToTop(fixedOverlay);
      // Fixed overlays are already fixed to the window viewport.
      // Do NOT call scrollIntoView on window/body as it causes the page background to jump and black out!
      return;
    }

    // 2. Only for inline/non-fixed popups, gently center in viewport
    const modalCard = element.querySelector<HTMLElement>(
      '.bg-zinc-950, .bg-zinc-900, .bg-slate-950, .bg-slate-900, [role="dialog"], [role="alertdialog"], .max-w-xl, .max-w-2xl, .max-w-3xl, .max-w-4xl, .max-w-5xl, .max-w-lg, .rounded-3xl, .rounded-2xl, .rounded-xl'
    ) || element;

    const style = window.getComputedStyle(modalCard);
    if (style.position !== 'fixed' && typeof modalCard.scrollIntoView === 'function') {
      try {
        modalCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      } catch {
        // Ignore scrollIntoView errors
      }
    }
  };

  performResetAndScroll();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(performResetAndScroll);
  }
  setTimeout(performResetAndScroll, 40);
  setTimeout(performResetAndScroll, 120);
}

/**
 * Checks whether an HTMLElement is currently an open modal/popup/overlay.
 */
function isVisibleModal(el: HTMLElement): boolean {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (!document.body.contains(el)) return false;

  const role = el.getAttribute('role');
  if (role === 'dialog' || role === 'alertdialog') return true;

  const className = typeof el.className === 'string' ? el.className : '';
  const id = el.id || '';

  const isFixedOverlay =
    className.includes('fixed') &&
    (className.includes('inset-0') || className.includes('top-0')) &&
    (className.includes('z-') || className.includes('backdrop-blur') || className.includes('bg-black') || className.includes('bg-slate') || className.includes('bg-zinc'));

  const lowerId = id.toLowerCase();
  const lowerClass = className.toLowerCase();

  const isNamedModal =
    lowerId.includes('modal') ||
    lowerId.includes('popup') ||
    lowerId.includes('dialog') ||
    lowerId.includes('drawer') ||
    lowerId.includes('overlay') ||
    lowerId.includes('_form') ||
    lowerId.includes('wizard') ||
    lowerClass.includes('modal') ||
    lowerClass.includes('popup') ||
    lowerClass.includes('dialog') ||
    lowerClass.includes('drawer');

  if (!isFixedOverlay && !isNamedModal) return false;

  // Check if hidden by style or display
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || el.hasAttribute('hidden')) {
    return false;
  }

  return true;
}

let isGlobalModalViewportInitialized = false;

export function initGlobalModalViewportHandler() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (isGlobalModalViewportInitialized) return () => {};

  isGlobalModalViewportInitialized = true;

  const scannedModals = new Set<HTMLElement>();

  const checkAndUpdateModals = () => {
    // Find all potential modal candidates in document
    const candidates = document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], .fixed.inset-0, [class*="fixed"][class*="inset-0"], [id*="modal" i], [id*="popup" i], [id*="dialog" i], [id*="drawer" i], [id*="_form"]'
    );

    const currentVisibleModals = new Set<HTMLElement>();

    candidates.forEach((el) => {
      if (isVisibleModal(el)) {
        currentVisibleModals.add(el);

        if (!scannedModals.has(el)) {
          scannedModals.add(el);
          ensureModalScrolledToTop(el);
        }
      }
    });

    // Clean up scanned modals that are no longer in DOM or hidden
    scannedModals.forEach((m) => {
      if (!currentVisibleModals.has(m)) {
        scannedModals.delete(m);
      }
    });

    // Safeguard: If no modals are currently visible, guarantee body overflow is normal
    if (currentVisibleModals.size === 0) {
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
    }
  };

  const observer = new MutationObserver(() => {
    checkAndUpdateModals();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'data-state'],
  });

  // Also check periodically and on click/blur/focus
  const interval = setInterval(checkAndUpdateModals, 250);
  window.addEventListener('click', () => {
    setTimeout(checkAndUpdateModals, 50);
    setTimeout(checkAndUpdateModals, 200);
  }, true);
  window.addEventListener('focus', () => {
    setTimeout(checkAndUpdateModals, 100);
  });

  checkAndUpdateModals();

  return () => {
    observer.disconnect();
    clearInterval(interval);
    document.body.style.overflow = '';
    isGlobalModalViewportInitialized = false;
  };
}
