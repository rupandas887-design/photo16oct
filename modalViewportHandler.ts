/**
 * Universal Viewport & Auto-Scroll Controller for Popups, Modals, and Overlays.
 * 
 * Ensures that whenever ANY modal, popup, dialog, or overlay opens across ANY dashboard:
 * 1. Automatically positions the popup in the visible browser viewport (centered horizontally and vertically).
 * 2. Automatically brings the popup into immediate view after it renders.
 * 3. Keeps modal containers within viewport bounds and ensures internal content scrolls cleanly.
 * 4. Neutralizes CSS containing blocks (transforms, filters, perspective) on ancestor elements
 *    so fixed popups are never trapped inside scrolled tables, cards, or motion wrappers.
 * 5. Automatically resets internal scrollable containers inside the modal to TOP (scrollTop = 0).
 * 6. Keeps the popup header, title, and close button accessible and never cut off.
 * 7. Safely locks background scrolling when a modal opens and reliably restores original
 *    page scroll position without jumps when closed.
 */

// Global scroll state tracker
let isGlobalModalViewportInitialized = false;
let activeModalCount = 0;
let savedScrollY = 0;
let isBackgroundLocked = false;
const activeAncestorElements = new Set<HTMLElement>();
const trackedModals = new Set<HTMLElement>();

/**
 * Resets the scroll position of an element and all its internal scrollable children to top (scrollTop = 0).
 */
export function resetInternalScrollContainersToTop(container: HTMLElement) {
  if (!container || typeof window === 'undefined') return;

  const resetElement = (el: HTMLElement) => {
    try {
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    } catch {
      // Ignore errors
    }
  };

  // Reset container itself
  resetElement(container);

  // Find all internal scrollable child elements
  const scrollableElements = container.querySelectorAll<HTMLElement>(
    '.overflow-y-auto, .overflow-auto, .overflow-y-scroll, [class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"], [data-scroll-container="true"], table, tbody'
  );

  scrollableElements.forEach((el) => {
    resetElement(el);
  });

  // Query divs/forms/sections/articles with scrollable height
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
 * Checks whether an HTMLElement is currently an open, visible modal/popup/overlay.
 */
export function isVisibleModal(el: HTMLElement): boolean {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (!document.body.contains(el)) return false;

  // Check role
  const role = el.getAttribute('role');
  if (role === 'dialog' || role === 'alertdialog') return true;

  const className = typeof el.className === 'string' ? el.className : '';
  const id = el.id || '';
  const lowerId = id.toLowerCase();
  const lowerClass = className.toLowerCase();

  const isFixedOverlay =
    className.includes('fixed') &&
    (className.includes('inset-0') || (className.includes('top-0') && className.includes('left-0'))) &&
    (className.includes('z-') || className.includes('backdrop') || className.includes('bg-black') || className.includes('bg-slate') || className.includes('bg-zinc'));

  const isNamedModal =
    lowerId.includes('modal') ||
    lowerId.includes('popup') ||
    lowerId.includes('dialog') ||
    lowerId.includes('dossier') ||
    lowerId.includes('drawer') ||
    lowerId.includes('preview') ||
    lowerId.includes('wizard') ||
    lowerClass.includes('modal') ||
    lowerClass.includes('popup') ||
    lowerClass.includes('dialog');

  if (!isFixedOverlay && !isNamedModal) return false;

  // Check if hidden by CSS
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    el.hasAttribute('hidden') ||
    (el.offsetWidth === 0 && el.offsetHeight === 0 && style.position !== 'fixed')
  ) {
    return false;
  }

  return true;
}

/**
 * Locks background scrolling safely while preserving current page scroll position.
 */
function lockBackgroundScroll() {
  if (isBackgroundLocked || typeof window === 'undefined') return;

  savedScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  isBackgroundLocked = true;
}

/**
 * Unlocks background scrolling safely and restores the exact original scroll position without page jumps.
 */
function unlockBackgroundScroll() {
  if (!isBackgroundLocked || typeof window === 'undefined') return;

  const restoreY = savedScrollY;

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';

  window.scrollTo({
    top: restoreY,
    left: 0,
    behavior: 'instant' as ScrollBehavior,
  });

  isBackgroundLocked = false;
}

/**
 * Ensures a modal/popup is positioned properly within the visible viewport and reset to top.
 */
export function ensureModalScrolledToTop(target: HTMLElement | string | null | undefined) {
  if (typeof window === 'undefined' || !target) return;

  const element = typeof target === 'string' ? (document.querySelector(target) as HTMLElement) : target;
  if (!element) return;

  const performPositionAndReset = () => {
    // 1. Reset internal scroll containers
    resetInternalScrollContainersToTop(element);

    // 2. Identify fixed overlay if any
    const fixedOverlay = (
      element.classList.contains('fixed') && element.classList.contains('inset-0')
        ? element
        : element.closest('.fixed.inset-0, [class*="fixed"][class*="inset-0"]')
    ) as HTMLElement | null;

    if (fixedOverlay) {
      if (fixedOverlay.scrollTop !== 0) fixedOverlay.scrollTop = 0;
      if (fixedOverlay.scrollLeft !== 0) fixedOverlay.scrollLeft = 0;
      
      // Ensure the overlay allows vertical scrolling if content is taller than viewport
      if (!fixedOverlay.classList.contains('overflow-y-auto')) {
        fixedOverlay.style.setProperty('overflow-y', 'auto', 'important');
      }
      fixedOverlay.style.setProperty('overscroll-behavior', 'contain', 'important');

      // Check inner modal card
      const modalCard = (fixedOverlay.querySelector<HTMLElement>(
        'div[id*="modal"], div[id*="card"], div[id*="dossier"], div[id*="popup"], div.bg-zinc-900, div.bg-zinc-950, div.bg-slate-900, div.bg-slate-950, [role="dialog"], [role="alertdialog"], .max-w-xl, .max-w-2xl, .max-w-3xl, .max-w-4xl, .max-w-5xl, .rounded-2xl, .rounded-3xl'
      ) || fixedOverlay.firstElementChild) as HTMLElement | null;

      if (modalCard && modalCard !== fixedOverlay) {
        if (modalCard.scrollTop !== 0) modalCard.scrollTop = 0;
        resetInternalScrollContainersToTop(modalCard);

        // Ensure max height fits comfortably in viewport and doesn't get clipped
        const isFullScreenDossier = modalCard.classList.contains('w-full') && (modalCard.classList.contains('h-full') || modalCard.classList.contains('h-[100dvh]'));
        if (!isFullScreenDossier) {
          modalCard.style.setProperty('max-height', 'min(94vh, 94dvh, calc(100vh - 24px))', 'important');
          // Using margin: auto inside flex container centers both axes and prevents top clipping on overflow
          modalCard.style.setProperty('margin-top', 'auto', 'important');
          modalCard.style.setProperty('margin-bottom', 'auto', 'important');
        }
      }
      return;
    }

    // 3. For non-fixed/inline popups or dropdowns, ensure it is brought into view without jumping
    try {
      if (typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    } catch {
      // Ignore
    }
  };

  performPositionAndReset();
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(performPositionAndReset);
  }
  setTimeout(performPositionAndReset, 30);
  setTimeout(performPositionAndReset, 100);
  setTimeout(performPositionAndReset, 250);
}

/**
 * Global lifecycle observer that monitors modals across all dashboards and maintains:
 * - Containing block neutralization (removes transform/filter traps on ancestors)
 * - Safe scroll lock and restoration
 * - Immediate auto-scroll to top and visibility
 */
export function initGlobalModalViewportHandler() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (isGlobalModalViewportInitialized) return () => {};

  isGlobalModalViewportInitialized = true;

  const updateModalsAndAncestors = () => {
    // 1. Locate all potential modal overlays in the entire document
    const candidates = document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], .fixed.inset-0, [class*="fixed"][class*="inset-0"], [id*="modal" i], [id*="popup" i], [id*="dialog" i], [id*="dossier" i], [id*="drawer" i], [id*="_form"]'
    );

    const currentVisibleModals = new Set<HTMLElement>();
    const currentActiveAncestors = new Set<HTMLElement>();

    candidates.forEach((el) => {
      if (isVisibleModal(el)) {
        currentVisibleModals.add(el);

        // Walk up parents and neutralize containing blocks so position:fixed binds to true viewport
        let parent = el.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          currentActiveAncestors.add(parent);
          if (!parent.classList.contains('modal-viewport-ancestor')) {
            parent.classList.add('modal-viewport-ancestor');
          }
          parent = parent.parentElement;
        }

        // New modal opened: apply positioning and auto-scroll to top
        if (!trackedModals.has(el)) {
          trackedModals.add(el);
          ensureModalScrolledToTop(el);
        }
      }
    });

    // Clean up untracked modals
    trackedModals.forEach((m) => {
      if (!currentVisibleModals.has(m) || !document.body.contains(m)) {
        trackedModals.delete(m);
      }
    });

    // Clean up ancestors of closed modals
    activeAncestorElements.forEach((anc) => {
      if (!currentActiveAncestors.has(anc)) {
        anc.classList.remove('modal-viewport-ancestor');
        activeAncestorElements.delete(anc);
      }
    });

    currentActiveAncestors.forEach((anc) => {
      activeAncestorElements.add(anc);
    });

    // Manage Background Scroll Lock based on active modals count
    activeModalCount = currentVisibleModals.size;
    if (activeModalCount > 0) {
      lockBackgroundScroll();
    } else {
      unlockBackgroundScroll();
    }
  };

  const observer = new MutationObserver(() => {
    updateModalsAndAncestors();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'data-state'],
  });

  // Handle window clicks, keydowns (Escape), resize, orientation
  const handleInteraction = () => {
    setTimeout(updateModalsAndAncestors, 20);
    setTimeout(updateModalsAndAncestors, 120);
  };

  window.addEventListener('click', handleInteraction, true);
  window.addEventListener('resize', updateModalsAndAncestors);
  window.addEventListener('orientationchange', updateModalsAndAncestors);

  const interval = setInterval(updateModalsAndAncestors, 300);

  updateModalsAndAncestors();

  return () => {
    observer.disconnect();
    clearInterval(interval);
    window.removeEventListener('click', handleInteraction, true);
    window.removeEventListener('resize', updateModalsAndAncestors);
    window.removeEventListener('orientationchange', updateModalsAndAncestors);

    activeAncestorElements.forEach((anc) => {
      anc.classList.remove('modal-viewport-ancestor');
    });
    activeAncestorElements.clear();
    trackedModals.clear();
    unlockBackgroundScroll();
    isGlobalModalViewportInitialized = false;
  };
}
