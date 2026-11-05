import { useEffect, useCallback, useId, useState } from 'react';

// Custom event names for global coordination across all dropdowns
export const DROPDOWN_OPEN_EVENT = 'app:dropdown-open';
export const LEGACY_EVENT_DROPDOWN_EVENT = 'close-all-event-dropdowns';

/**
 * Broadcasts to all other dropdown instances across the application to close.
 */
export function broadcastDropdownOpen(instanceId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DROPDOWN_OPEN_EVENT, { detail: { id: instanceId } }));
  window.dispatchEvent(new CustomEvent(LEGACY_EVENT_DROPDOWN_EVENT, { detail: { id: instanceId } }));
}

export interface UseDropdownAutoCloseOptions {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuRef?: React.RefObject<HTMLElement | null>;
  instanceId?: string;
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  closeOnOtherDropdownOpen?: boolean;
  onClose?: () => void;
}

/**
 * Hook to manage auto-closing of dropdowns:
 * 1. Outside click / tap (mousedown + touchstart)
 * 2. Escape key press
 * 3. Another dropdown opening anywhere in the application
 */
export function useDropdownAutoClose({
  isOpen,
  setIsOpen,
  triggerRef,
  menuRef,
  instanceId,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  closeOnOtherDropdownOpen = true,
  onClose,
}: UseDropdownAutoCloseOptions) {
  const generatedId = useId();
  const id = instanceId || generatedId;

  // Broadcast when this dropdown opens
  useEffect(() => {
    if (isOpen && closeOnOtherDropdownOpen) {
      broadcastDropdownOpen(id);
    }
  }, [isOpen, id, closeOnOtherDropdownOpen]);

  // Close when another dropdown opens anywhere in the application
  useEffect(() => {
    if (!isOpen || !closeOnOtherDropdownOpen) return;

    const handleOtherDropdownOpen = (e: Event) => {
      const customEv = e as CustomEvent<{ id: string }>;
      if (customEv.detail?.id && customEv.detail.id !== id) {
        setIsOpen(false);
        onClose?.();
      }
    };

    window.addEventListener(DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
    window.addEventListener(LEGACY_EVENT_DROPDOWN_EVENT, handleOtherDropdownOpen);

    return () => {
      window.removeEventListener(DROPDOWN_OPEN_EVENT, handleOtherDropdownOpen);
      window.removeEventListener(LEGACY_EVENT_DROPDOWN_EVENT, handleOtherDropdownOpen);
    };
  }, [isOpen, id, closeOnOtherDropdownOpen, setIsOpen, onClose]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.stopPropagation();
        setIsOpen(false);
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, closeOnEscape, setIsOpen, onClose]);

  // Close on outside click or tap (handles both desktop mouse and mobile touch)
  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target;
      if (!target || !(target instanceof Node)) return;

      // Click/tap is inside trigger element
      if (triggerRef.current && triggerRef.current.contains(target)) {
        return;
      }

      // Click/tap is inside menu element
      if (menuRef?.current && menuRef.current.contains(target)) {
        return;
      }

      setIsOpen(false);
      onClose?.();
    };

    // Small delay ensures event bubbling from trigger click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutsideClick, true);
      document.addEventListener('touchstart', handleOutsideClick, { passive: true, capture: true });
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
    };
  }, [isOpen, closeOnOutsideClick, triggerRef, menuRef, setIsOpen, onClose]);
}

/**
 * Calculates responsive position for dropdowns ensuring:
 * - Never overflows screen boundaries horizontally (left/right)
 * - Automatically flips upward when vertical space below is limited
 * - Dynamically bounds maxHeight and enables internal scrolling
 */
export function useResponsiveDropdownPosition({
  isOpen,
  triggerRef,
  minWidth = 180,
  preferredMaxHeight = 320,
  align = 'auto',
  offset = 6,
}: {
  isOpen: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuRef?: React.RefObject<HTMLElement | null>;
  minWidth?: number;
  preferredMaxHeight?: number;
  align?: 'left' | 'right' | 'auto';
  offset?: number;
}) {
  const [position, setPosition] = useState<{
    openUpward: boolean;
    maxHeight: number;
    width: number;
    top?: number;
    bottom?: number;
    left: number;
  }>({
    openUpward: false,
    maxHeight: preferredMaxHeight,
    width: minWidth,
    left: 12,
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Determine width: match trigger width or minWidth, clamped to viewport width - padding
    const triggerWidth = rect.width;
    const computedWidth = Math.max(minWidth, Math.min(triggerWidth || minWidth, vw - 24));

    // Determine horizontal alignment
    let left = rect.left;
    if (align === 'right' || (align === 'auto' && rect.left + computedWidth > vw - 12)) {
      left = rect.right - computedWidth;
    }
    // Clamp to screen boundaries (at least 12px margin on left and right)
    if (left + computedWidth > vw - 12) {
      left = Math.max(12, vw - computedWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    // Determine vertical placement: space below vs above
    const spaceBelow = vh - rect.bottom - offset - 12;
    const spaceAbove = rect.top - offset - 12;

    const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(preferredMaxHeight, availableSpace));

    setPosition({
      openUpward,
      maxHeight,
      width: computedWidth,
      top: openUpward ? undefined : rect.bottom + offset,
      bottom: openUpward ? vh - rect.top + offset : undefined,
      left,
    });
  }, [triggerRef, minWidth, preferredMaxHeight, align, offset]);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleResizeOrScroll = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleResizeOrScroll, { passive: true });
    window.addEventListener('scroll', handleResizeOrScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [isOpen, updatePosition]);

  return { ...position, updatePosition };
}
