import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, ChevronDown, AlertCircle, Wrench, Layers, RefreshCw } from 'lucide-react';
import { Equipment } from '../../types';
import { supabaseClient } from '../../supabaseClient';

interface OtherStaffEquipment {
  staffName?: string;
  equipmentNames: string[];
}

export interface EquipmentConflictDetails {
  staffName: string;
  eventName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
}

export interface EquipmentAvailability {
  isBusy: boolean;
  statusText?: string;
  conflicts: EquipmentConflictDetails[];
  schedule: EquipmentConflictDetails[];
}

interface EquipmentSelectorDropdownProps {
  equipment?: Equipment[];
  selectedEquipmentNames: string[];
  otherStaffEquipments?: { staffName: string; equipmentNames: string[] }[];
  onToggleEquipment: (eqName: string) => void;
  onRemoveEquipment: (eqName: string) => void;
  checkEquipmentAvailability?: (eqName: string, orderId?: string, date?: string, start?: string, end?: string) => any;
  currentOrderId?: string;
  targetEventDate?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  targetStaffName?: string;
  disabled?: boolean;
  placeholder?: string;
}

// Module-level cache for fetched equipment across all dropdown instances
let globalEquipmentCache: any[] | null = null;
let globalEquipmentFetchPromise: Promise<any[]> | null = null;
const globalEquipmentListeners = new Set<(data: any[]) => void>();

export const getCachedOrFetchEquipment = async (forceRefresh = false): Promise<any[]> => {
  if (!forceRefresh && globalEquipmentCache && globalEquipmentCache.length > 0) {
    return globalEquipmentCache;
  }
  if (!globalEquipmentFetchPromise || forceRefresh) {
    globalEquipmentFetchPromise = (async () => {
      try {
        if (supabaseClient) {
          const { data, error } = await supabaseClient
            .from('equipment')
            .select('*');
          if (!error && Array.isArray(data) && data.length > 0) {
            globalEquipmentCache = data;
            globalEquipmentListeners.forEach(fn => fn(data));
            return data;
          }
        }
        const proxyRes = await fetch('/api/db/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'equipment' })
        });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
            globalEquipmentCache = json.data;
            globalEquipmentListeners.forEach(fn => fn(json.data));
            return json.data;
          }
        }
      } catch (err) {
        console.warn('[EquipmentSelectorDropdown] Error fetching equipment:', err);
      } finally {
        globalEquipmentFetchPromise = null;
      }
      return globalEquipmentCache || [];
    })();
  }
  return globalEquipmentFetchPromise;
};

const EquipmentSelectorDropdownComponent: React.FC<EquipmentSelectorDropdownProps> = ({
  equipment = [],
  selectedEquipmentNames = [],
  otherStaffEquipments = [],
  onToggleEquipment,
  onRemoveEquipment,
  checkEquipmentAvailability,
  currentOrderId,
  targetEventDate,
  targetStartTime,
  targetEndTime,
  targetStaffName,
  disabled = false,
  placeholder = "Select equipment..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'busy' | 'selected'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Live fetched equipment directly from Supabase `equipment` table (uses module-level cache)
  const [dbEquipmentList, setDbEquipmentList] = useState<any[]>(() => globalEquipmentCache || []);
  const [isDbLoading, setIsDbLoading] = useState(false);

  // Conflict modal state
  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    equipment: any;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to global cache updates and fetch once if not cached
  useEffect(() => {
    const listener = (data: any[]) => {
      setDbEquipmentList(data);
    };
    globalEquipmentListeners.add(listener);

    if (!globalEquipmentCache || globalEquipmentCache.length === 0) {
      getCachedOrFetchEquipment().then(data => {
        if (data && data.length > 0) {
          setDbEquipmentList(data);
        }
      });
    }

    return () => {
      globalEquipmentListeners.delete(listener);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsDbLoading(true);
    try {
      const data = await getCachedOrFetchEquipment(true);
      setDbEquipmentList(data || []);
    } finally {
      setIsDbLoading(false);
    }
  }, []);

  // Orientation state: open upward if not enough space below
  const [openUpward, setOpenUpward] = useState(false);

  const checkOrientation = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < 280 && spaceAbove > spaceBelow);
  }, []);

  // Click outside to close (handles clicks outside trigger and popover portal)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!target || !(target instanceof Node)) return;
      if (
        triggerRef.current &&
        triggerRef.current.contains(target)
      ) {
        return;
      }
      if (
        popoverRef.current &&
        popoverRef.current.contains(target)
      ) {
        return;
      }
      const conflictModal = document.getElementById('equipment-conflict-modal-overlay');
      if (conflictModal && conflictModal.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen]);

  // Combine and deduplicate equipment records from Supabase query and props
  const allRawEquipment = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Add records from live Supabase query
    (dbEquipmentList || []).forEach((item, idx) => {
      if (!item) return;
      const eqName = String(item.equipment_name || item.Equipment_Name || item.name || '').trim();
      if (eqName) {
        map.set(eqName.toLowerCase(), {
          ...item,
          equipment_id: item.equipment_id || item.id || `EQ-DB-${idx}`,
          equipment_name: eqName,
          equipment_type: item.equipment_type || item.Equipment_Category || item.category || 'Other',
          status: item.status || item.Equipment_Status || 'Active'
        });
      }
    });

    // 2. Add records from props
    (equipment || []).forEach((item, idx) => {
      if (!item) return;
      if (typeof item === 'string' && item.trim()) {
        const eqName = item.trim();
        if (!map.has(eqName.toLowerCase())) {
          map.set(eqName.toLowerCase(), {
            equipment_id: `EQ-PROP-${idx}`,
            equipment_name: eqName,
            equipment_type: 'Other',
            status: 'Available'
          });
        }
      } else if (typeof item === 'object') {
        const eqName = String(item.equipment_name || (item as any).Equipment_Name || (item as any).name || '').trim();
        if (eqName && !map.has(eqName.toLowerCase())) {
          map.set(eqName.toLowerCase(), {
            ...item,
            equipment_id: item.equipment_id || `EQ-PROP-${idx}`,
            equipment_name: eqName,
            equipment_type: item.equipment_type || (item as any).Equipment_Category || (item as any).category || 'Other',
            status: item.status || (item as any).Equipment_Status || 'Active'
          });
        }
      }
    });

    return Array.from(map.values());
  }, [dbEquipmentList, equipment]);

  // Pre-index other staff equipment for O(1) lookup
  const otherStaffMap = useMemo(() => {
    const map = new Map<string, string>();
    (otherStaffEquipments || []).forEach((other) => {
      if (other && other.equipmentNames) {
        other.equipmentNames.forEach((eqName) => {
          if (eqName && !map.has(eqName)) {
            map.set(eqName, other.staffName || 'Crew');
          }
        });
      }
    });
    return map;
  }, [otherStaffEquipments]);

  // Compute availability for each equipment item
  // OPTIMIZATION: When the dropdown is CLOSED, we skip computing availability,
  // conflicts, and filters for unselected items since only selected badges are displayed!
  const equipmentWithAvailability = useMemo(() => {
    if (!isOpen) return [];

    const safeSelectedNames = new Set((selectedEquipmentNames || []).filter(Boolean));

    return allRawEquipment.map((eq) => {
      const eqName = eq.equipment_name;
      const isSelected = safeSelectedNames.has(eqName);

      // Check if assigned to another staff member in the same event (O(1) lookup)
      const assignedOtherStaffName = otherStaffMap.get(eqName);

      // Check maintenance or damaged status in inventory
      const eqStatus = eq.status || 'Active';
      const isMaintenance =
        eqStatus === 'Under Maintenance' || eqStatus === 'Maintenance';
      const isDamagedOrInactive =
        eqStatus === 'Damaged' ||
        eqStatus === 'Lost' ||
        eqStatus === 'Inactive' ||
        eqStatus === 'Retired';

      // Check if busy on another order/event using exact Date + Start Time + End Time overlap logic
      let availability: any = { isBusy: false, conflicts: [], schedule: [] };
      if (typeof checkEquipmentAvailability === 'function') {
        try {
          availability = checkEquipmentAvailability(eqName, currentOrderId, targetEventDate, targetStartTime, targetEndTime) || availability;
        } catch (err) {
          console.warn('Equipment availability check error:', err);
        }
      }
      const isBusyElsewhere = !isSelected && Boolean(availability?.isBusy);

      let statusType: 'selected' | 'available' | 'busy' | 'maintenance' | 'damaged' = 'available';
      let statusLabel = 'Available';
      let canAssign = true;
      let reason = '';

      if (isSelected) {
        statusType = 'selected';
        statusLabel = 'Selected';
        canAssign = true;
      } else if (assignedOtherStaffName) {
        statusType = 'busy';
        statusLabel = `Assigned to ${assignedOtherStaffName}`;
        canAssign = false;
        reason = `Already assigned to ${assignedOtherStaffName} for this shoot.`;
      } else if (isMaintenance) {
        statusType = 'maintenance';
        statusLabel = 'Maintenance';
        canAssign = false;
        reason = `Equipment is currently under maintenance.`;
      } else if (isDamagedOrInactive) {
        statusType = 'damaged';
        statusLabel = eqStatus || 'Unavailable';
        canAssign = false;
        reason = `Equipment status is ${eqStatus}.`;
      } else if (isBusyElsewhere) {
        statusType = 'busy';
        statusLabel = 'Busy / In Use';
        canAssign = false;
        reason = `Assigned to another active event with overlapping time.`;
      }

      return {
        ...eq,
        equipment_name: eqName,
        statusType,
        statusLabel,
        canAssign,
        reason,
        conflicts: availability?.conflicts || [],
        schedule: availability?.schedule || [],
        isSelected
      };
    });
  }, [isOpen, allRawEquipment, selectedEquipmentNames, otherStaffMap, checkEquipmentAvailability, currentOrderId, targetEventDate, targetStartTime, targetEndTime]);

  // Unique categories list
  const availableCategories = useMemo(() => {
    if (!isOpen) return [];
    const cats = new Set<string>();
    const defaults = ['Audio Equipment', 'Batteries', 'Camera', 'Drone', 'Gimbal', 'Lens', 'Light', 'Memory Cards', 'Other'];
    (allRawEquipment || []).forEach(e => {
      const raw = e.equipment_type || 'Other';
      if (raw && typeof raw === 'string') cats.add(raw.trim());
    });
    defaults.forEach(d => cats.add(d));
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [isOpen, allRawEquipment]);

  // Counts for filter pills
  const counts = useMemo(() => {
    if (!isOpen) {
      return {
        all: 0,
        available: 0,
        busy: 0,
        selected: selectedEquipmentNames?.length || 0
      };
    }
    let available = 0;
    let busy = 0;
    let selected = 0;

    equipmentWithAvailability.forEach((eq) => {
      if (eq.isSelected) selected++;
      else if (eq.canAssign) available++;
      else busy++;
    });

    return {
      all: equipmentWithAvailability.length,
      available,
      busy,
      selected
    };
  }, [isOpen, equipmentWithAvailability, selectedEquipmentNames]);

  // Filtered equipment list based on search, status filter, and category filter
  const filteredEquipment = useMemo(() => {
    return equipmentWithAvailability.filter((eq) => {
      // 1. Status Filter
      if (statusFilter === 'available' && (!eq.canAssign || eq.isSelected)) return false;
      if (statusFilter === 'busy' && (eq.canAssign || eq.isSelected)) return false;
      if (statusFilter === 'selected' && !eq.isSelected) return false;

      // 2. Category Filter
      if (categoryFilter !== 'all') {
        const cat = (eq.equipment_type || 'Other').trim().toLowerCase();
        if (cat !== categoryFilter.toLowerCase()) return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (eq.equipment_name || '').toLowerCase().includes(q);
        const typeMatch = (eq.equipment_type || '').toLowerCase().includes(q);
        const brandMatch = (eq.brand || '').toLowerCase().includes(q);
        const modelMatch = (eq.model || '').toLowerCase().includes(q);
        const serialMatch = (eq.serial_number || '').toLowerCase().includes(q);
        const locationMatch = (eq.storage_location || '').toLowerCase().includes(q);
        return nameMatch || typeMatch || brandMatch || modelMatch || serialMatch || locationMatch;
      }

      return true;
    });
  }, [equipmentWithAvailability, statusFilter, categoryFilter, searchQuery]);

  // Group filtered equipment by Category
  const groupedEquipment = useMemo(() => {
    const groups: { category: string; items: typeof filteredEquipment }[] = [];
    const catMap = new Map<string, typeof filteredEquipment>();

    filteredEquipment.forEach((eq) => {
      const cat = eq.equipment_type || 'Other';
      if (!catMap.has(cat)) {
        catMap.set(cat, []);
      }
      catMap.get(cat)!.push(eq);
    });

    catMap.forEach((items, category) => {
      groups.push({ category, items });
    });

    return groups.sort((a, b) => a.category.localeCompare(b.category));
  }, [filteredEquipment]);

  const handleItemClick = (eq: typeof equipmentWithAvailability[0]) => {
    if (eq.isSelected) {
      // Unselect
      onToggleEquipment(eq.equipment_name);
      return;
    }

    if (!eq.canAssign) {
      setConflictModalState({ isOpen: true, equipment: eq });
      return;
    }

    // Assign
    onToggleEquipment(eq.equipment_name);
  };

  return (
    <div className={`relative w-full ${isOpen ? 'z-[60]' : 'z-10'}`}>
      {/* Selected Equipment Badges List */}
      {selectedEquipmentNames && selectedEquipmentNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selectedEquipmentNames.filter(Boolean).map((eqName, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-mono font-medium rounded-lg border border-amber-500/30 transition-all shadow-sm group"
            >
              <Wrench className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[220px]" title={eqName}>
                {eqName}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveEquipment(eqName);
                }}
                disabled={disabled}
                className="text-amber-500 hover:text-amber-200 hover:bg-amber-500/30 p-0.5 rounded transition-colors font-bold text-xs cursor-pointer focus:outline-none"
                title={`Remove ${eqName}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Main Trigger Bar */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            checkOrientation();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900/90 hover:bg-zinc-850/90 border rounded-xl cursor-pointer transition-all duration-150 select-none shadow-sm text-left ${
          isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-zinc-900 shadow-amber-500/5'
            : selectedEquipmentNames && selectedEquipmentNames.length > 0
            ? 'border-zinc-700 hover:border-zinc-600'
            : 'border-zinc-800 hover:border-zinc-700'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Wrench className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-amber-400' : 'text-zinc-500'}`} />
          <span className="text-xs text-zinc-300 truncate">
            {selectedEquipmentNames && selectedEquipmentNames.length > 0
              ? `${selectedEquipmentNames.length} item(s) selected • Click to edit`
              : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pointer-events-none">
          <span className={`p-1 rounded-md text-zinc-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-amber-400' : ''
          }`}>
            <ChevronDown className="w-3.5 h-3.5" />
          </span>
        </div>
      </button>

      {/* Equipment Dropdown Menu directly attached to field */}
      {isOpen && (
        <div
          ref={popoverRef}
          className={`absolute left-0 right-0 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } z-[500] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col ring-2 ring-black/80 backdrop-blur-md`}
          style={{ maxHeight: '380px' }}
        >
            {/* Header with Search Box & Refresh */}
            <div className="p-2.5 sm:p-3 border-b border-zinc-800 bg-zinc-950/95 space-y-2 shrink-0">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search equipment by name, category, model..."
                  className="w-full bg-zinc-900 border border-zinc-750 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 focus:outline-none rounded-xl pl-8 pr-16 py-1.5 text-xs text-white placeholder-zinc-500 font-sans"
                />
                <div className="absolute right-2.5 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-zinc-400 hover:text-zinc-200 p-0.5 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRefresh()}
                    className={`text-zinc-400 hover:text-amber-400 p-0.5 cursor-pointer transition-transform ${isDbLoading ? 'animate-spin text-amber-400' : ''}`}
                    title="Refresh from Supabase equipment table"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] font-mono font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2 py-1 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm'
                      : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  All ({counts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('available')}
                  className={`px-2 py-1 rounded-lg border transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                    statusFilter === 'available'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/15 hover:bg-emerald-500/10'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Available ({counts.available})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('busy')}
                  className={`px-2 py-1 rounded-lg border transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                    statusFilter === 'busy'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm'
                      : 'bg-rose-500/5 text-rose-400 border-rose-500/15 hover:bg-rose-500/10'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Busy ({counts.busy})
                </button>
                {counts.selected > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('selected')}
                    className={`px-2 py-1 rounded-lg border transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                      statusFilter === 'selected'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-amber-500/5 text-amber-400 border-amber-500/15 hover:bg-amber-500/10'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Selected ({counts.selected})
                  </button>
                )}
              </div>
            </div>

            {/* Internally Scrollable Equipment List */}
            <div className="overflow-y-auto divide-y divide-zinc-800/60 flex-1 p-1 scrollbar-thin max-h-[320px]">
              {filteredEquipment.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <AlertCircle className="w-6 h-6 text-zinc-500 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-mono text-zinc-400 font-semibold">
                    {allRawEquipment.length === 0
                      ? 'No equipment registered in Supabase equipment table'
                      : `No equipment found matching "${searchQuery}"`}
                  </p>
                  {(searchQuery || categoryFilter !== 'all' || statusFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCategoryFilter('all');
                        setStatusFilter('all');
                      }}
                      className="mt-2 text-[11px] text-amber-400 hover:underline font-mono cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
              ) : (
                groupedEquipment.map((group) => (
                  <div key={group.category} className="space-y-0.5">
                    {/* Category Group Header */}
                    <div className="px-2.5 py-1 bg-zinc-950/80 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider sticky top-0 z-10 border-b border-zinc-800/80 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span>🏷️</span> {group.category}
                      </span>
                      <span className="text-zinc-500 font-normal">({group.items.length})</span>
                    </div>

                    {/* Group Items */}
                    {group.items.map((eq) => {
                      return (
                        <div
                          key={eq.equipment_id || eq.equipment_name}
                          onClick={() => handleItemClick(eq)}
                          className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all duration-150 gap-2.5 select-none ${
                            eq.isSelected
                              ? 'bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 shadow-sm'
                              : eq.canAssign
                              ? 'hover:bg-zinc-800/80 border border-transparent'
                              : 'opacity-65 hover:bg-zinc-850/60 border border-transparent cursor-not-allowed'
                          }`}
                        >
                          {/* Equipment Details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1">
                                <Wrench className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span className="truncate max-w-[200px] sm:max-w-[260px]">
                                  {eq.equipment_name}
                                </span>
                              </span>

                              {eq.brand && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                                  {eq.brand}
                                </span>
                              )}

                              {eq.model && eq.model !== eq.equipment_name && (
                                <span className="text-[9px] text-zinc-400 font-mono hidden sm:inline">
                                  • {eq.model}
                                </span>
                              )}
                            </div>

                            {/* Sub-info: Serial number or location if available */}
                            <div className="flex flex-col gap-1 mt-1 text-[10px] text-zinc-500 font-mono">
                              <div className="flex items-center gap-2">
                                {eq.serial_number && <span>SN: {eq.serial_number}</span>}
                                {eq.storage_location && <span>Loc: {eq.storage_location}</span>}
                              </div>
                              
                              {eq.reason && !eq.canAssign && eq.conflicts.length === 0 && (
                                <span className="text-rose-400/90 font-sans italic truncate max-w-[220px]">
                                  • {eq.reason}
                                </span>
                              )}

                              {eq.conflicts && eq.conflicts.length > 0 && (
                                <div className="mt-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 text-rose-300">
                                  <div className="font-bold font-sans text-[11px] mb-1.5 flex items-center gap-1.5 text-rose-400">
                                    <AlertCircle size={13} className="shrink-0" />
                                    <span>Equipment Locked / Busy (Time Overlap)</span>
                                  </div>
                                  <div className="text-[10px] space-y-1.5">
                                    {eq.conflicts.map((c: any, i: number) => (
                                      <div key={i} className="pl-2.5 border-l-2 border-rose-500/40 text-rose-200">
                                        <div><strong className="text-zinc-300">Staff:</strong> {c.staffName}</div>
                                        <div><strong className="text-zinc-300">Event:</strong> {c.eventName} ({c.eventDate})</div>
                                        <div><strong className="text-zinc-300">Time:</strong> <span className="font-mono text-rose-300 font-bold">{c.startTime || '?'} – {c.endTime || '?'}</span></div>
                                      </div>
                                    ))}
                                    <div className="mt-1.5 pt-1.5 border-t border-rose-500/20 text-zinc-400 text-[10px]">
                                      <span className="font-semibold text-zinc-300">Current Event:</span> {targetEventDate || 'Selected Date'} {targetStartTime ? `(${targetStartTime} – ${targetEndTime || '?'})` : ''}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {eq.schedule && eq.schedule.length > 0 && eq.conflicts.length === 0 && (
                                <div className="mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-emerald-300">
                                  <div className="font-bold font-sans text-[11px] mb-1 flex items-center gap-1.5 text-emerald-400">
                                    <Check size={13} className="shrink-0" />
                                    <span>Equipment Available (Working on another event)</span>
                                  </div>
                                  <div className="text-[10px] text-emerald-300/90 mb-1.5">
                                    No time conflict with current event: <strong>{targetEventDate}</strong> {targetStartTime ? `(${targetStartTime} – ${targetEndTime || '?'})` : ''}
                                  </div>
                                  <div className="mt-1 pt-1.5 border-t border-emerald-500/20">
                                    <div className="text-[9px] uppercase tracking-wider mb-1 text-zinc-400 font-mono font-semibold">Other Event Schedule on {targetEventDate}:</div>
                                    {eq.schedule.map((s: any, i: number) => (
                                      <div key={i} className="pl-2.5 border-l-2 border-emerald-500/40 text-[10px] text-emerald-200 mb-1">
                                        <div><strong className="text-zinc-300">Event:</strong> {s.eventName} • <strong className="text-zinc-300">Staff:</strong> {s.staffName}</div>
                                        <div><strong className="text-zinc-300">Time:</strong> <span className="font-mono text-emerald-300 font-bold">{s.startTime || '?'} – {s.endTime || '?'}</span></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>

                          {/* Status Badge & Checkbox Indicator */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Availability Badge */}
                            {eq.isSelected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Check className="w-3 h-3 text-amber-400" /> Selected
                              </span>
                            ) : eq.canAssign ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Available
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> {eq.statusLabel}
                              </span>
                            )}

                            {/* Selection Box */}
                            <div
                              className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                                eq.isSelected
                                  ? 'bg-amber-500 border-amber-500 text-black shadow-sm shadow-amber-500/30 font-black'
                                  : eq.canAssign
                                  ? 'border-zinc-700 hover:border-zinc-500 text-transparent'
                                  : 'border-zinc-800 bg-zinc-850/60 text-transparent opacity-50'
                              }`}
                            >
                              {eq.isSelected && <Check className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer Bar */}
            <div className="p-2.5 px-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[11px] font-mono text-zinc-400 shrink-0">
              <span className="text-[10px] text-zinc-500">
                Showing {filteredEquipment.length} of {allRawEquipment.length} equipment items
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

      {/* Conflict Modal Portal */}
      {conflictModalState?.isOpen && conflictModalState.equipment &&
        createPortal(
          <div id="equipment-conflict-modal-overlay" className="fixed inset-0 z-[999999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
               style={{ touchAction: 'none' }}>
            <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[100dvh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-4 border-b border-zinc-800 flex items-start justify-between bg-zinc-950/50 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20 shrink-0">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                      Equipment Busy
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {conflictModalState.equipment.equipment_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConflictModalState(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 overflow-y-auto scrollbar-thin">
                {conflictModalState.equipment.conflicts && conflictModalState.equipment.conflicts.length > 0 ? (
                  <div className="space-y-4">
                    {/* Existing Assignments */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-semibold px-1">
                        Currently Assigned
                      </h4>
                      {conflictModalState.equipment.conflicts.map((c: any, i: number) => (
                        <div key={i} className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                          <div className="grid grid-cols-[60px_1fr] gap-y-1.5 text-xs">
                            <span className="text-zinc-500 font-medium">Staff:</span>
                            <span className="text-zinc-200 font-bold">{c.staffName}</span>
                            
                            <span className="text-zinc-500 font-medium">Event:</span>
                            <span className="text-zinc-200">{c.eventName}</span>
                            
                            <span className="text-zinc-500 font-medium">Date:</span>
                            <span className="text-zinc-200">{c.eventDate}</span>
                            
                            <span className="text-zinc-500 font-medium">Time:</span>
                            <span className="text-rose-300 font-mono font-medium">{c.startTime || '?'} – {c.endTime || '?'}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Requested Assignment */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-semibold px-1">
                        Requested
                      </h4>
                      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                        <div className="grid grid-cols-[60px_1fr] gap-y-1.5 text-xs">
                          <span className="text-zinc-500 font-medium">Staff:</span>
                          <span className="text-zinc-200 font-bold">{targetStaffName || 'Current Staff'}</span>
                          
                          <span className="text-zinc-500 font-medium">Event:</span>
                          <span className="text-zinc-200">Current Assignment</span>
                          
                          <span className="text-zinc-500 font-medium">Date:</span>
                          <span className="text-zinc-200">{targetEventDate || '?'}</span>
                          
                          <span className="text-zinc-500 font-medium">Time:</span>
                          <span className="text-emerald-300 font-mono font-medium">{targetStartTime || '?'} – {targetEndTime || '?'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-950/50 p-3 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
                      <strong className="text-zinc-300 block mb-1 text-xs">Reason:</strong>
                      The requested time overlaps with the existing equipment assignment.
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <AlertCircle className="w-6 h-6 text-rose-500" />
                    </div>
                    <p className="text-rose-400 font-semibold mb-1">
                      Status: BUSY — NOT AVAILABLE
                    </p>
                    <p className="text-sm text-zinc-400 px-4">
                      {conflictModalState.equipment.reason || 'This equipment is currently unavailable due to maintenance, damage, or another assignment.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setConflictModalState(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-bold transition-colors w-full sm:w-auto"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export const EquipmentSelectorDropdown = React.memo(EquipmentSelectorDropdownComponent);
