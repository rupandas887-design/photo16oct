/**
 * Error Viewport and Scroll Handler
 */
export function ensureErrorScrolledToTop(container?: HTMLElement | null) {
  if (!container) return;
  try {
    container.scrollTop = 0;
  } catch {
    // Ignore error
  }
}
