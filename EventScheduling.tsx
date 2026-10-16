import React, { useState, useEffect } from 'react';
import { useRole } from '../RoleContext';
import { 
  Calendar, Clock, User, Compass, Server, MapPin, AlertCircle, RefreshCw, CheckCircle2
} from 'lucide-react';
import { CurrentStage } from '../../types';
import { formatDateDDMMYY, formatTime12Hour, convertTimeToDbFormat } from '../../utils';
import { ReportingTimeSelector } from './ReportingTimeSelector';

export const EventScheduling: React.FC = () => {
  const { currentRole, orders, operations, assignOperations } = useRole();
  const canEdit = currentRole === 'Operations Team' || currentRole === 'Business Owner';

  // Toggle state
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [reportingTime, setReportingTime] = useState('');
  const [remarks, setRemarks] = useState('');

  const getOpDetails = (orderId: string) => {
    return operations.find((o) => o.order_id === orderId);
  };

  // Only show active orders that have been assigned crew or are in operations workflow
  const scheduledEvents = orders.filter(o => {
    const isAvailableStage = ['Operations Assigned', 'Assigned Crew', 'Event Scheduled', 'Event Started', 'Event Ended', 'Footage Handover', 'Event Completed'].includes(o.current_stage);
    return isAvailableStage && o.current_stage !== 'Closed' && o.current_stage !== 'Verified Footage' && o.current_stage !== 'Footage Handover Verified';
  });

  const handleUpdateSchedule = async (orderId: string) => {
    if (!canEdit) return;
    const op = getOpDetails(orderId);
    
    try {
      // Merge existing details and set stage to Assigned Crew
      await assignOperations(orderId, {
        photographer_assigned: op?.photographer_assigned || '',
        videographer_assigned: op?.videographer_assigned || '',
        drone_operator_assigned: op?.drone_operator_assigned || 'None',
        assistant_assigned: op?.assistant_assigned || 'None',
        equipment_kit: op?.equipment_kit || 'Standard Kit',
        reporting_time: convertTimeToDbFormat(reportingTime),
        remarks: remarks || op?.remarks || '',
        current_stage: 'Assigned Crew' as CurrentStage
      });

      setSchedulingId(null);
      alert(`Shoot schedule successfully locked. Stage updated to [Assigned Crew]`);
    } catch (err: any) {
      if (err.message && (
        err.message.includes('Invalid event status') ||
        err.message.includes('operations_event_status_check') ||
        err.message.includes('violates check constraint') ||
        err.message.includes('status_check')
      )) {
        alert("Invalid event status being sent to database.");
      } else {
        alert(`Error scheduling event: ${err.message}`);
      }
    }
  };

  const handlePrepForm = (orderId: string, time: string, rem: string, currentStage: string) => {
    setSchedulingId(orderId);
    if (currentStage === 'Operations Assigned') {
      // Create/Schedule: starts completely empty!
      setReportingTime('');
      setRemarks('');
    } else {
      // Edit Schedule: loads existing!
      setReportingTime(time ? formatTime12Hour(time) : '');
      setRemarks(rem || '');
    }
  };

  useEffect(() => {
    if (schedulingId) {
      setTimeout(() => {
        const formEl = document.querySelector('.reporting-time-select');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (formEl as HTMLSelectElement).focus();
        }
      }, 150);
    }
  }, [schedulingId]);

  return (
    <div className="space-y-6">
      {/* Overview disclaimer */}
      <div className="bg-zinc-950/40 border border-zinc-850 rounded-2xl p-4 flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-zinc-300">
          <strong className="text-zinc-100 font-mono">CHRONOMETRIC LOCKS:</strong> Review all orders that have operations assigned, update on-site reporting timetables, log any specific site conditions (e.g. sunset timings, golden hours), and click **Lock Schedule** to finalize event coordination.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {scheduledEvents.length > 0 ? (
          scheduledEvents.map((ord) => {
            const op = getOpDetails(ord.order_id);
            const isFinished = ord.current_stage === 'Event Completed' || ord.current_stage === 'Raw Footage Received';

            return (
              <div 
                key={ord.order_id} 
                className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between hover:border-zinc-800 transition-all hover:bg-zinc-900/60"
              >
                {/* Calibration tags */}
                <div className="absolute top-3 right-3 font-mono text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">
                  {ord.order_id}
                </div>

                <div className="space-y-3">
                  {/* Customer details */}
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100 pr-14">{ord.customer_name}</h4>
                    <span className="text-[10px] uppercase font-mono text-zinc-450">{ord.event_type} // {ord.package_name || 'Standard Package'}</span>
                  </div>

                  {/* Datetime row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border-y border-zinc-850 py-3 font-mono">
                    <div className="space-y-1">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-450 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-zinc-550" />
                        <span>Date Lock</span>
                      </div>
                      <div className="font-semibold text-zinc-200">{formatDateDDMMYY(ord.event_date)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-455 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-550" />
                        <span>Reporting</span>
                      </div>
                      <div className="font-semibold text-zinc-200">
                        {op?.reporting_time ? formatTime12Hour(op.reporting_time) : 'Unassigned'}
                      </div>
                    </div>
                  </div>

                  {/* Crew Assignment card */}
                  <div className="space-y-1.5 pt-1 text-xs">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-455 font-mono">Allocated Squad</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-1 text-zinc-300 font-mono text-[11px]">
                      <div>📸 {op?.photographer_assigned || 'Pending'}</div>
                      <div>🎥 {op?.videographer_assigned || 'Pending'}</div>
                      {op?.drone_operator_assigned !== 'None' && op?.drone_operator_assigned && (
                        <div className="col-span-2">🛸 Aerial: {op.drone_operator_assigned}</div>
                      )}
                    </div>
                  </div>

                  {/* Site coordinates */}
                  <div className="space-y-1 pt-1 text-[11px] text-zinc-400">
                    <div className="flex items-start gap-1.5 font-mono">
                      <MapPin className="w-3.5 h-3.5 text-zinc-550 mt-0.5 flex-shrink-0" />
                      <span>{ord.event_location}</span>
                    </div>
                  </div>

                  {/* Safety & Logistics log */}
                  {op?.remarks && (
                    <div className="p-2.5 bg-zinc-950/60 border border-zinc-850 rounded-xl text-[11px] text-zinc-400 font-mono italic">
                      Notes: {op.remarks}
                    </div>
                  )}
                </div>

                {/* Operations interactive locks */}
                <div className="mt-5 pt-4 border-t border-zinc-850 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${ord.current_stage === 'Event Scheduled' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                    <span className="text-[10px] uppercase font-mono text-zinc-400 font-extrabold">
                      {ord.current_stage}
                    </span>
                  </div>

                  {canEdit && !isFinished && (
                    schedulingId === ord.order_id ? (
                      <div className="absolute inset-x-0 bottom-0 bg-zinc-900 border-t border-zinc-800 rounded-b-2xl p-4 space-y-3 z-10 animate-in slide-in-from-bottom duration-200">
                        <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase">TIMETABLE ADJUSTMENT ID: {ord.order_id}</span>
                          <button onClick={() => setSchedulingId(null)} className="text-xs text-zinc-400 hover:text-white cursor-pointer">✕</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-mono text-zinc-450 block">Reporting lock</label>
                            <ReportingTimeSelector
                              value={reportingTime}
                              onChange={(val) => setReportingTime(val)}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-mono text-zinc-450 block">Notes/Alerts</label>
                            <input
                              type="text"
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              placeholder="e.g. Bring extra batteries..."
                              className="w-full bg-zinc-950 border border-zinc-805 rounded-lg px-2.5 py-1 text-xs text-white"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => handleUpdateSchedule(ord.order_id)}
                          className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-[11px] font-mono font-extrabold uppercase rounded-lg cursor-pointer"
                        >
                          Lock Event Schedule
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handlePrepForm(ord.order_id, op?.reporting_time || '', op?.remarks || '', ord.current_stage)}
                        className="px-2.5 py-1 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-[10px] font-mono font-bold rounded cursor-pointer transition-all uppercase"
                      >
                        Adjust & Lock Chronos
                      </button>
                    )
                  )}

                  {isFinished && (
                    <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Shoot Concluded</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-1 md:col-span-3 bg-zinc-900/20 border border-zinc-850 rounded-2xl p-12 text-center text-zinc-550 font-mono text-xs">
            No active project crew deployments currently logged. Onboard assignments on the Leads tab first!
          </div>
        )}
      </div>
    </div>
  );
};
