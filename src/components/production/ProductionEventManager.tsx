import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateDDMMYY, formatTime12Hour, parseEventDateTimeToTimestamp } from '../../utils';
import { useRole } from '../RoleContext';

interface EventItem {
  event_name: string;
  event_date: string;
  event_start_time?: string;
  event_end_date?: string;
  event_end_time?: string;
  shoot_type?: string;
  location?: string;
}

interface ModalState {
  customerName: string;
  orderId: string;
  events: EventItem[];
}

/**
 * ProductionEventManager.tsx
 * 
 * MODULAR PRODUCTION EXTENSION MODULE FOR EVENT DETAILS CENTERED MODAL & ACTION DROPDOWN INTEGRATION
 * 
 * STRICT ARCHITECTURAL CONSTRAINTS:
 * 1. src/components/ProductionModule.tsx is UNTOUCHED (0 edits).
 * 2. Hides separate "Event Details" column from Production Leads table.
 * 3. Integrates "Event Details" as an option inside the existing "Action" dropdown.
 * 4. Displays Event Details in a proper centered responsive modal popup with backdrop overlay.
 * 5. Shows ALL events for orders with multiple events (Event 1, Event 2, Event 3...) using exact database values.
 * 6. Correctly isolates selected row's lead/order data (Customer Name, Event Name, Event Date, Event Time).
 */
export const ProductionEventManager: React.FC = () => {
  const { leads, orders, production, rawFootage } = useRole();
  const [modalState, setModalState] = useState<ModalState | null>(null);

  useEffect(() => {
    // Helper to get React Fiber node from DOM element
    const getReactFiber = (domEl: HTMLElement | null): any => {
      if (!domEl) return null;
      const key = Object.keys(domEl).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      );
      return key ? (domEl as any)[key] : null;
    };

    // Helper to extract lead/order object from React Fiber tree
    const extractLeadFromFiber = (startFiber: any): any => {
      let curr = startFiber;
      let depth = 0;
      while (curr && depth < 40) {
        const props = curr.memoizedProps || curr.pendingProps;
        if (props) {
          if (props.lead) return props.lead;
          if (props.order) return props.order;
        }
        if (curr.child) {
          let child = curr.child;
          let childDepth = 0;
          while (child && childDepth < 10) {
            const childProps = child.memoizedProps || child.pendingProps;
            if (childProps) {
              if (childProps.lead) return childProps.lead;
              if (childProps.order) return childProps.order;
            }
            child = child.sibling;
            childDepth++;
          }
        }
        curr = curr.return;
        depth++;
      }
      return null;
    };

    // Function to construct accurate ModalState for the selected row
    const buildModalStateForSelection = (
      rawIdText: string,
      targetRow: HTMLTableRowElement | null
    ): ModalState => {
      let fiberLead: any = null;
      let rowCustomerName = '';
      let rowOrderId = '';

      if (targetRow) {
        const cells = targetRow.querySelectorAll('td');
        if (cells[0]) {
          rowOrderId = (cells[0].textContent || '').trim();
        }
        if (cells[1]) {
          const firstChild = cells[1].querySelector('div');
          const rawText = firstChild?.textContent || cells[1].textContent || '';
          rowCustomerName = rawText.split('\n')[0].trim();
        }
        if (cells[2]) {
          const fiber = getReactFiber(cells[2] as HTMLElement);
          if (fiber) {
            fiberLead = extractLeadFromFiber(fiber);
          }
        }
      }

      const lookupId = rawIdText || rowOrderId;

      const prodItem = (production || []).find(
        (p) =>
          p.tracking_id === lookupId ||
          p.production_id === lookupId ||
          (p as any).order_id === lookupId
      );

      const rfItem = (rawFootage || []).find(
        (f) =>
          f.tracking_id === lookupId ||
          f.order_id === lookupId ||
          (prodItem &&
            (f.tracking_id === prodItem.tracking_id ||
              f.order_id === prodItem.tracking_id ||
              f.order_id === prodItem.order_id))
      );

      const targetOrder = (orders || []).find(
        (o) =>
          o.order_id === lookupId ||
          o.lead_id === lookupId ||
          (prodItem &&
            (o.order_id === prodItem.order_id ||
              o.lead_id === prodItem.tracking_id ||
              o.lead_id === prodItem.lead_id)) ||
          (rfItem && o.order_id === rfItem.order_id) ||
          (fiberLead && (o.order_id === fiberLead.order_id || o.lead_id === fiberLead.lead_id))
      );

      const targetLead = (leads || []).find(
        (l) =>
          l.lead_id === lookupId ||
          (prodItem && (l.lead_id === prodItem.tracking_id || l.lead_id === prodItem.lead_id)) ||
          (targetOrder && l.lead_id === targetOrder.lead_id) ||
          (fiberLead && l.lead_id === fiberLead.lead_id) ||
          (rowCustomerName &&
            rowCustomerName !== 'Client' &&
            l.customer_name?.toLowerCase() === rowCustomerName.toLowerCase())
      );

      const customerName =
        targetOrder?.customer_name ||
        targetLead?.customer_name ||
        fiberLead?.customer_name ||
        prodItem?.customer_name ||
        (rowCustomerName && rowCustomerName !== 'Client' ? rowCustomerName : '') ||
        'Customer';

      const orderId =
        targetOrder?.order_id ||
        (targetLead?.order_id && !targetLead.order_id.startsWith('TRK-') ? targetLead.order_id : '') ||
        (rfItem?.order_id && !rfItem.order_id.startsWith('TRK-') ? rfItem.order_id : '') ||
        (prodItem?.order_id && !prodItem.order_id.startsWith('TRK-') ? prodItem.order_id : '') ||
        (targetLead?.lead_id && !targetLead.lead_id.startsWith('TRK-') ? targetLead.lead_id : '') ||
        (fiberLead?.order_id && !fiberLead.order_id.startsWith('TRK-') ? fiberLead.order_id : '') ||
        (fiberLead?.lead_id && !fiberLead.lead_id.startsWith('TRK-') ? fiberLead.lead_id : '') ||
        (lookupId && !lookupId.startsWith('TRK-') ? lookupId : '') ||
        prodItem?.order_id ||
        prodItem?.tracking_id ||
        lookupId ||
        '';

      const rawEventsList =
        (targetLead?.events && Array.isArray(targetLead.events) && targetLead.events.length > 0
          ? targetLead.events
          : null) ||
        (targetOrder?.events && Array.isArray(targetOrder.events) && targetOrder.events.length > 0
          ? targetOrder.events
          : null) ||
        (fiberLead?.events && Array.isArray(fiberLead.events) && fiberLead.events.length > 0
          ? fiberLead.events
          : null) ||
        (prodItem?.events && Array.isArray(prodItem.events) && prodItem.events.length > 0
          ? prodItem.events
          : null);

      let eventsList: EventItem[] = [];

      if (rawEventsList && rawEventsList.length > 0) {
        eventsList = rawEventsList.map((ev: any, idx: number) => ({
          event_name:
            ev.event_name ||
            ev.event_type ||
            ev.Event_Name ||
            ev.custom_event_name ||
            `Event ${idx + 1}`,
          event_date:
            ev.event_date ||
            ev.event_start_date ||
            ev.Event_Date ||
            targetLead?.event_date ||
            targetOrder?.event_date ||
            '',
          event_start_time:
            ev.event_start_time ||
            ev.event_time ||
            ev.reporting_time ||
            ev.Event_Start_Time ||
            targetLead?.event_time ||
            targetOrder?.event_time ||
            '',
          event_end_date: ev.event_end_date || ev.Event_End_Date || '',
          event_end_time: ev.event_end_time || '',
          shoot_type:
            ev.event_shoot_type ||
            ev.shoot_type ||
            targetLead?.shoot_type ||
            targetOrder?.desired_event_shoot_type ||
            '',
          location:
            ev.event_location ||
            ev.location ||
            ev.venue ||
            ev.google_maps_link ||
            targetLead?.event_location ||
            targetOrder?.event_location ||
            '',
        }));

        eventsList.sort((a, b) => {
          const tA = parseEventDateTimeToTimestamp(a.event_date, a.event_start_time);
          const tB = parseEventDateTimeToTimestamp(b.event_date, b.event_start_time);
          return tA - tB;
        });
      } else {
        const singleName =
          targetLead?.event_name ||
          targetLead?.custom_event_name ||
          targetLead?.event_type ||
          targetOrder?.event_type ||
          fiberLead?.event_name ||
          fiberLead?.event_type ||
          prodItem?.event_type ||
          prodItem?.event_name;

        const singleDate =
          targetLead?.event_date ||
          targetOrder?.event_date ||
          fiberLead?.event_date ||
          prodItem?.event_date;

        const singleTime =
          targetLead?.event_time ||
          targetLead?.reporting_time ||
          targetOrder?.event_time ||
          fiberLead?.event_time ||
          prodItem?.event_time;

        const singleShootType =
          targetLead?.shoot_type ||
          targetLead?.desired_event_shoot_type ||
          targetOrder?.desired_event_shoot_type ||
          fiberLead?.shoot_type;

        const singleLocation =
          targetLead?.event_location ||
          targetOrder?.event_location ||
          fiberLead?.event_location;

        if (singleName || singleDate || singleTime) {
          eventsList = [
            {
              event_name: singleName || 'Event',
              event_date: singleDate || '',
              event_start_time: singleTime || '',
              shoot_type: singleShootType || '',
              location: singleLocation || '',
            },
          ];
        } else {
          eventsList = [];
        }
      }

      return {
        customerName,
        orderId,
        events: eventsList,
      };
    };

    const handleProductionDOMUpdates = () => {
      // 1. Locate Production Leads tables and hide "Event Details" column
      const tables = document.querySelectorAll<HTMLTableElement>('table');
      tables.forEach((table) => {
        const headers = table.querySelectorAll('th');
        let eventDetailsColIdx = -1;

        headers.forEach((th, idx) => {
          const text = (th.textContent || '').trim().toLowerCase();
          if (text === 'event details') {
            eventDetailsColIdx = idx;
            if (th.style.display !== 'none') {
              th.style.display = 'none';
            }
          }
        });

        if (eventDetailsColIdx !== -1) {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells[eventDetailsColIdx]) {
              const td = cells[eventDetailsColIdx] as HTMLElement;
              if (td.style.display !== 'none') {
                td.style.display = 'none';
              }
            }
          });
        }
      });

      // 2. Handle Action Dropdown Menu injection & Event Details modal trigger
      const actionDropdown = document.getElementById('production-action-dropdown');
      if (actionDropdown) {
        const existingEventBtn = actionDropdown.querySelector('[data-action-item="event-details"]');
        if (!existingEventBtn) {
          const menuContainer =
            actionDropdown.querySelector('div.flex.flex-col.gap-0\\.5') ||
            actionDropdown.querySelector('div.flex.flex-col');

          if (menuContainer) {
            // Extract Tracking ID / Order ID from Action Menu Header
            const headerIdSpan = actionDropdown.querySelector('span.text-zinc-500');
            const headerText = headerIdSpan?.textContent || '';
            const targetId = headerText.replace(/^ID:\s*/i, '').trim();

            // Find matching row in Production table
            let targetRow: HTMLTableRowElement | null = null;
            const allRows = document.querySelectorAll<HTMLTableRowElement>('table tbody tr');
            allRows.forEach((tr) => {
              const rowText = tr.textContent || '';
              const hasActiveAction =
                tr.querySelector('button.bg-purple-900\\/60') !== null ||
                tr.querySelector('button span:first-child')?.textContent === 'Action';

              if ((targetId && rowText.includes(targetId)) || hasActiveAction) {
                if (!targetRow || (targetId && rowText.includes(targetId))) {
                  targetRow = tr;
                }
              }
            });

            // Create Event Details action menu button
            const eventBtn = document.createElement('button');
            eventBtn.type = 'button';
            eventBtn.setAttribute('data-action-item', 'event-details');
            eventBtn.className =
              'w-full text-left px-2.5 py-2 text-[11px] font-semibold text-amber-300 hover:text-white hover:bg-amber-600/25 rounded-lg transition-colors flex items-center gap-2 cursor-pointer';
            eventBtn.innerHTML = `
              <span class="text-sm">📅</span>
              <span>Event Details</span>
            `;

            eventBtn.onclick = (e) => {
              e.stopPropagation();

              // Close action dropdown
              const backdrop = actionDropdown.parentElement?.querySelector(
                'div.fixed.inset-0.bg-transparent'
              ) as HTMLElement;
              if (backdrop) {
                backdrop.click();
              } else {
                actionDropdown.style.display = 'none';
              }

              const state = buildModalStateForSelection(targetId, targetRow);
              setModalState(state);
            };

            // Insert Event Details button at top of Action menu
            const firstChild = menuContainer.firstElementChild;
            if (firstChild) {
              menuContainer.insertBefore(eventBtn, firstChild);
            } else {
              menuContainer.appendChild(eventBtn);
            }
          }
        }
      }
    };

    handleProductionDOMUpdates();

    const observer = new MutationObserver(() => {
      handleProductionDOMUpdates();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    window.addEventListener('resize', handleProductionDOMUpdates);
    window.addEventListener('scroll', handleProductionDOMUpdates, { capture: true, passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleProductionDOMUpdates);
      window.removeEventListener('scroll', handleProductionDOMUpdates, { capture: true });
    };
  }, [leads, orders, production, rawFootage]);

  return (
    <>
      {modalState &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setModalState(null)}
          >
            <div
              className="bg-zinc-900 border border-zinc-700/90 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden text-zinc-100 font-sans ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/95 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-base shadow-inner">
                    📅
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                      Event Details
                      {modalState.orderId && (
                        <span className="text-xs font-mono font-normal text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          #{modalState.orderId}
                        </span>
                      )}
                    </h3>
                    {modalState.customerName && (
                      <p className="text-xs text-zinc-400 font-sans mt-0.5">
                        Client: <span className="text-zinc-200 font-semibold">{modalState.customerName}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState(null)}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition flex items-center justify-center cursor-pointer border border-zinc-700/60"
                  title="Close Modal"
                >
                  <span className="text-base font-bold leading-none">✕</span>
                </button>
              </div>

              {/* Modal Body - Scrollable Container */}
              <div className="p-5 overflow-y-auto space-y-4 max-h-[calc(85vh-130px)] bg-zinc-950/40">
                {modalState.events.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 font-mono text-xs">
                    No specific event records found for this order.
                  </div>
                ) : (
                  modalState.events.map((ev, idx) => {
                    const rawTime = ev.event_start_time || ev.event_end_time;
                    const formattedDate = ev.event_date ? formatDateDDMMYY(ev.event_date) : '';
                    const formattedTime = rawTime ? formatTime12Hour(rawTime) : '';

                    return (
                      <div
                        key={idx}
                        className="bg-zinc-900/90 border border-zinc-800/90 rounded-xl p-4 shadow-lg space-y-3 relative"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {modalState.events.length > 1 ? `EVENT ${idx + 1}` : 'EVENT INFORMATION'}
                          </span>
                          {ev.shoot_type && (
                            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded border border-zinc-700/50">
                              {ev.shoot_type}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block mb-0.5">
                              Event Name
                            </span>
                            <span className="font-bold text-white text-sm">
                              {ev.event_name || 'Not specified'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block mb-0.5">
                              Event Date
                            </span>
                            <span className="font-bold font-mono text-amber-400 text-sm">
                              {formattedDate || ev.event_date || 'Not specified'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block mb-0.5">
                              Event Time
                            </span>
                            <span className="font-semibold font-mono text-zinc-200">
                              {formattedTime || 'Not specified'}
                            </span>
                          </div>
                          {ev.location && (
                            <div className="sm:col-span-2">
                              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block mb-0.5">
                                Location / Venue
                              </span>
                              <span className="font-normal text-zinc-300 break-words">{ev.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between">
                <span className="text-[11px] font-mono text-zinc-400">
                  Total Events: <span className="font-bold text-amber-400">{modalState.events.length}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setModalState(null)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-mono text-xs font-bold transition cursor-pointer border border-zinc-700/70"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
