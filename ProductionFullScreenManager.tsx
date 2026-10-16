import React, { useEffect, useRef } from 'react';

/**
 * ProductionFullScreenManager.tsx
 * 
 * SCROLL-LOCKING & FULL-SCREEN VIEWPORT MANAGER FOR PRODUCTION ASSIGNMENT INTERFACES
 * 
 * Target Interfaces:
 * 1. Production Lead • Assigned Team
 * 2. Reassign
 * 3. Assign Editor
 * 4. Assign Operations Staff
 * 
 * STRICT CONSTRAINTS:
 * - src/components/ProductionModule.tsx is UNTOUCHED (0 edits).
 * - Background Production Dashboard is LOCKED when open.
 * - Scroll position restored cleanly when closed.
 */
export const ProductionFullScreenManager: React.FC = () => {
  const isLockedRef = useRef(false);
  const savedScrollYRef = useRef(0);

  useEffect(() => {
    const updateHeaderHeight = () => {
      const headerElem = document.querySelector<HTMLElement>('header');
      if (headerElem) {
        const rect = headerElem.getBoundingClientRect();
        const height = Math.round(rect.height || headerElem.offsetHeight || 64);
        if (height > 0) {
          document.documentElement.style.setProperty('--prod-nav-header-height', `${height}px`);
        }
      }
    };

    updateHeaderHeight();

    let headerObserver: ResizeObserver | null = null;
    const headerElem = document.querySelector<HTMLElement>('header');
    if (headerElem && typeof ResizeObserver !== 'undefined') {
      headerObserver = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      headerObserver.observe(headerElem);
    }

    const checkIsTargetOverlay = (overlay: HTMLElement): boolean => {
      // Never match Action Dropdown Menu or any backdrop created for dropdown menus
      if (
        overlay.id === 'production-action-dropdown' ||
        overlay.querySelector('#production-action-dropdown') !== null ||
        overlay.querySelector('[id*="action-dropdown"]') !== null
      ) {
        return false;
      }

      const text = (overlay.textContent || '').toLowerCase();
      // Never match Image Preview / Proof Viewer as a fullscreen card, and ensure it always sits on top
      if (
        text.includes('uploaded proof / image') ||
        text.includes('uploaded proof') ||
        text.includes('image preview') ||
        text.includes('view full confirmation image') ||
        overlay.classList.contains('z-[130]') ||
        overlay.classList.contains('z-[140]') ||
        overlay.classList.contains('z-[150]')
      ) {
        overlay.style.setProperty('z-index', '1000005', 'important');
        return false;
      }

      // If text contains 'action menu' header of dropdown, exclude it
      if (text.includes('action menu') && !text.includes('step workflow wizard')) {
        return false;
      }

      // Never match Assigned Team modal popup - let it open normally as a dialog modal with backdrop
      if (
        text.includes('production lead • assigned team') ||
        (text.includes('assigned team') && (text.includes('server upload') || text.includes('assigned deliverable') || text.includes('staff name') || text.includes('prd-') || text.includes('ord-')))
      ) {
        return false;
      }

      const hasWorkflowModalCard = overlay.querySelector('#production_workflow_modal') !== null;
      const isWorkflowWizardModal = text.includes('step workflow wizard') || hasWorkflowModalCard;
      
      const isAssignOpsModal = (text.includes('assign operations staff') || text.includes('assign operations')) && 
                               (text.includes('order id') || text.includes('customer') || text.includes('step workflow wizard'));

      const isAssignEditorModal = text.includes('assign editor') || 
                                  (overlay.querySelector('#production_workflow_modal') !== null && text.includes('assign editor'));

      const isClientAcceptanceModal = text.includes('client acceptance verification deck') ||
                                      (text.includes('client acceptance') && (text.includes('project id') || text.includes('tracking id') || text.includes('approve client acceptance'))) ||
                                      (text.includes('client approval') && (text.includes('project id') || text.includes('footage deleted') || text.includes('content usage'))) ||
                                      overlay.querySelector('#production_client_approval_modal') !== null ||
                                      overlay.id === 'production_client_approval_overlay';

      return hasWorkflowModalCard || isWorkflowWizardModal || isAssignOpsModal || isClientAcceptanceModal || isAssignEditorModal;
    };

    const lockBackground = () => {
      if (isLockedRef.current) return;
      savedScrollYRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollYRef.current}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      isLockedRef.current = true;
    };

    const unlockBackground = () => {
      if (!isLockedRef.current) return;

      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';

      window.scrollTo(0, savedScrollYRef.current);
      document.querySelectorAll('.prod-fullscreen-ancestor').forEach((elem) => {
        elem.classList.remove('prod-fullscreen-ancestor');
      });
      isLockedRef.current = false;
    };

    const handleDOMCheck = () => {
      updateHeaderHeight();
      const overlays = document.querySelectorAll<HTMLElement>('div.fixed.inset-0');
      let hasActiveTargetModal = false;
      const activeAncestors = new Set<HTMLElement>();

      overlays.forEach((overlay) => {
        if (checkIsTargetOverlay(overlay)) {
          hasActiveTargetModal = true;
          const overlayText = (overlay.textContent || '').toLowerCase();
          const isClientAcceptanceModal = overlayText.includes('client acceptance verification deck') ||
                                          (overlayText.includes('client acceptance') && (overlayText.includes('project id') || overlayText.includes('tracking id') || overlayText.includes('approve client acceptance'))) ||
                                          (overlayText.includes('client approval') && (overlayText.includes('project id') || overlayText.includes('footage deleted') || overlayText.includes('content usage'))) ||
                                          overlay.querySelector('#production_client_approval_modal') !== null ||
                                          overlay.id === 'production_client_approval_overlay';

          // Add ancestor class to all parent elements up to document.body
          // to neutralize transform/filter/will-change containing blocks
          let parent = overlay.parentElement;
          while (parent && parent !== document.body && parent !== document.documentElement) {
            activeAncestors.add(parent);
            if (!parent.classList.contains('prod-fullscreen-ancestor')) {
              parent.classList.add('prod-fullscreen-ancestor');
            }
            parent = parent.parentElement;
          }

          // 1. Mark overlay as full screen page view
          if (isClientAcceptanceModal) {
            overlay.classList.remove('prod-fullscreen-overlay');
            overlay.classList.remove('prod-client-acceptance-overlay');
            overlay.style.setProperty('z-index', '9999999', 'important');
            overlay.style.setProperty('align-items', 'center', 'important');
            overlay.style.setProperty('justify-content', 'center', 'important');
          } else {
            if (!overlay.classList.contains('prod-fullscreen-overlay')) {
              overlay.classList.add('prod-fullscreen-overlay');
            }
          }
          const isAssignEditorModal = overlayText.includes('assign editor') || 
                                      (overlay.querySelector('#production_workflow_modal') !== null && overlayText.includes('assign editor'));
          if (isAssignEditorModal && !overlay.classList.contains('prod-assign-editor-overlay')) {
            overlay.classList.add('prod-assign-editor-overlay');
          }

          // 2. Mark inner card as full screen container
          const modalCard = overlay.querySelector<HTMLElement>('#production_workflow_modal') ||
            overlay.querySelector<HTMLElement>('#production_client_approval_modal') ||
            overlay.querySelector<HTMLElement>('div.bg-zinc-950') ||
            (overlay.firstElementChild as HTMLElement);

          if (modalCard) {
            if (isClientAcceptanceModal) {
              modalCard.classList.remove('prod-fullscreen-card');
              modalCard.classList.remove('prod-client-acceptance-card');
              modalCard.style.setProperty('max-height', 'min(92vh, 92dvh, calc(100vh - var(--prod-nav-header-height, 64px) - 24px))', 'important');
              modalCard.style.setProperty('margin-top', '0', 'important');
              modalCard.style.setProperty('display', 'flex', 'important');
              modalCard.style.setProperty('flex-direction', 'column', 'important');
            } else {
              if (!modalCard.classList.contains('prod-fullscreen-card')) {
                modalCard.classList.add('prod-fullscreen-card');
              }
            }
          }

          // 3. Mark header element
          if (modalCard) {
            const header = modalCard.querySelector<HTMLElement>('div.p-5.border-b') ||
              modalCard.querySelector<HTMLElement>('div.border-b') ||
              (modalCard.firstElementChild as HTMLElement);

            if (header) {
              if (isClientAcceptanceModal) {
                header.classList.remove('prod-fullscreen-header');
                header.classList.remove('prod-client-acceptance-header');
              } else {
                if (!header.classList.contains('prod-fullscreen-header')) {
                  header.classList.add('prod-fullscreen-header');
                }
              }
            }

            // 4. Mark body element
            const body = modalCard.querySelector<HTMLElement>('form.overflow-y-auto') ||
              modalCard.querySelector<HTMLElement>('form') ||
              modalCard.querySelector<HTMLElement>('div.overflow-y-auto') ||
              modalCard.querySelector<HTMLElement>('div.p-6.space-y-5') ||
              modalCard.querySelector<HTMLElement>('div.p-5') ||
              modalCard.querySelector<HTMLElement>('div.p-4') ||
              modalCard.querySelector<HTMLElement>('div.p-3\\.5');

            if (body) {
              if (isClientAcceptanceModal) {
                body.classList.remove('prod-fullscreen-body');
                body.classList.remove('prod-client-acceptance-body');
              } else {
                if (!body.classList.contains('prod-fullscreen-body')) {
                  body.classList.add('prod-fullscreen-body');
                }
              }
              const isAssignEditorModal = overlayText.includes('assign editor') || 
                                          (modalCard.querySelector('#production_workflow_modal') !== null && overlayText.includes('assign editor'));
              if (isAssignEditorModal && !body.classList.contains('prod-assign-editor-body')) {
                body.classList.add('prod-assign-editor-body');
              }
            }

            // 5. Mark footer / action button containers if present
            if (body) {
              const actionContainers = body.querySelectorAll<HTMLElement>('div.flex.gap-3, div.flex.items-center.gap-3, div.pt-2, div.pt-4');
              actionContainers.forEach((container) => {
                const buttons = container.querySelectorAll('button');
                if (buttons.length > 0) {
                  if (isClientAcceptanceModal) {
                    container.classList.remove('prod-fullscreen-footer');
                    container.classList.remove('prod-client-acceptance-footer');
                    
                    // SAVE button logic modification
                    let cancelBtn: HTMLButtonElement | null = null;
                    let saveBtn: HTMLButtonElement | null = null;
                    buttons.forEach(btn => {
                      const txt = (btn.textContent || '').trim().toLowerCase();
                      if (txt === 'cancel') cancelBtn = btn as HTMLButtonElement;
                      if (txt === 'save' || txt === 'saving...') saveBtn = btn as HTMLButtonElement;
                    });
                    
                    if (saveBtn && cancelBtn && !saveBtn.dataset.saveFixAttached) {
                      saveBtn.dataset.saveFixAttached = 'true';
                      saveBtn.addEventListener('click', () => {
                        let alertShown = false;
                        const originalAlert = window.alert;
                        window.alert = function(msg) {
                          alertShown = true;
                          originalAlert(msg);
                        };
                        
                        const obs = new MutationObserver((mutations) => {
                          for (const m of mutations) {
                            if (m.attributeName === 'disabled' && !saveBtn!.disabled) {
                              window.alert = originalAlert; // restore alert
                              if (!alertShown) {
                                cancelBtn!.click();
                              }
                              obs.disconnect();
                            }
                          }
                        });
                        obs.observe(saveBtn!, { attributes: true });
                      });
                    }
                  } else {
                    if (!container.classList.contains('prod-fullscreen-footer')) {
                      container.classList.add('prod-fullscreen-footer');
                    }
                  }
                }
              });

              const tables = body.querySelectorAll('table');
              tables.forEach((table) => {
                const parent = table.parentElement;
                if (parent && !parent.classList.contains('prod-fullscreen-table-wrapper')) {
                  parent.classList.add('prod-fullscreen-table-wrapper');
                }
              });
            }

            // 6. Client Acceptance Verification Deck specific UI adjustments
            if (isClientAcceptanceModal) {
              // 6a. UI REMOVAL: Remove "Upload Link / Path:" display section
              const allSpans = overlay.querySelectorAll<HTMLElement>('span, label');
              allSpans.forEach((span) => {
                const sText = (span.textContent || '').trim().toLowerCase();
                if (sText === 'upload link / path:' || sText === 'upload link / path') {
                  const parentDiv = span.closest('div');
                  if (parentDiv && !parentDiv.classList.contains('ca-upload-link-hidden')) {
                    parentDiv.classList.add('ca-upload-link-hidden');
                    parentDiv.style.setProperty('display', 'none', 'important');
                  }
                }
              });

              // 6b. UI REMOVAL: Remove "Event Date *" input & label from "Edited Folder Upload Confirmation"
              const dateInputs = overlay.querySelectorAll<HTMLInputElement>('input[type="date"]');
              dateInputs.forEach((dateInput) => {
                const formGroup = dateInput.closest('div.space-y-1') as HTMLElement | null;
                const label = formGroup?.querySelector('label');
                const labelText = (label?.textContent || '').toLowerCase();
                if (labelText.includes('event date')) {
                  // Ensure input is not blocking form submission
                  dateInput.required = false;
                  dateInput.removeAttribute('required');
                  if (formGroup) {
                    formGroup.style.setProperty('display', 'none', 'important');
                  }
                }
              });
            }
          }
        } else {
          if (overlay.classList.contains('prod-fullscreen-overlay')) {
            overlay.classList.remove('prod-fullscreen-overlay');
          }
        }
      });

      document.querySelectorAll('.prod-fullscreen-ancestor').forEach((elem) => {
        if (!activeAncestors.has(elem as HTMLElement)) {
          elem.classList.remove('prod-fullscreen-ancestor');
        }
      });

      // Guarantee any proof preview or image popups get top layer z-index
      overlays.forEach((overlay) => {
        const text = (overlay.textContent || '').toLowerCase();
        if (
          text.includes('uploaded proof / image') ||
          text.includes('uploaded proof') ||
          text.includes('image preview') ||
          overlay.classList.contains('z-[130]') ||
          overlay.classList.contains('z-[140]')
        ) {
          overlay.style.setProperty('z-index', '1000005', 'important');
        }
      });

      if (hasActiveTargetModal) {
        lockBackground();
      } else {
        unlockBackground();
      }
    };

    // Prevent mouse wheel scrolling on backdrop when locked
    const handleWheel = (e: WheelEvent) => {
      if (!isLockedRef.current) return;
      const activeModal = document.querySelector('.prod-fullscreen-overlay');
      if (!activeModal) return;

      const bodyElem = activeModal.querySelector('.prod-fullscreen-body');
      if (bodyElem && e.target instanceof Node && bodyElem.contains(e.target)) {
        return;
      }
      e.preventDefault();
    };

    // Prevent touch dragging on backdrop when locked
    const handleTouchMove = (e: TouchEvent) => {
      if (!isLockedRef.current) return;
      
      const target = e.target;
      if (!target || !(target instanceof Node)) return;
      const el = target instanceof Element ? target : target.parentElement;
      if (!el) return;

      // Allow touch gestures inside scrollable or interactive containers (including bodies, tables, and full modals)
      if (
        el.closest(
          '.prod-fullscreen-body, .prod-client-acceptance-body, .proof-preview-modal-layer, [class*="overflow-y-auto"], [class*="overflow-x-auto"], table, tbody, tr, td, th, .prod-fullscreen-card, .prod-client-acceptance-card'
        )
      ) {
        return;
      }

      const activeModal = document.querySelector('.prod-fullscreen-overlay, .prod-client-acceptance-overlay');
      if (activeModal && (el === activeModal || (el instanceof Node && activeModal.contains(el)))) {
        const card = activeModal.querySelector('.prod-fullscreen-card, .prod-client-acceptance-card');
        if (card && el instanceof Node && card.contains(el)) {
          return;
        }
      }

      e.preventDefault();
    };

    handleDOMCheck();

    const observer = new MutationObserver(() => {
      handleDOMCheck();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener('resize', handleDOMCheck);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      if (headerObserver) headerObserver.disconnect();
      observer.disconnect();
      window.removeEventListener('resize', handleDOMCheck);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchmove', handleTouchMove);
      if (isLockedRef.current) {
        unlockBackground();
      }
    };
  }, []);

  return null;
};
