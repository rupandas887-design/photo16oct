import React, { useState } from 'react';
import { DatePreset, DateRange, getPresetDateRange } from './DateFilterHelper';
import { Calendar, Filter } from 'lucide-react';
import { DateFilterInput } from '../ui/DateFilterInput';

interface DatePresetSelectorProps {
  selectedPreset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  customRange: DateRange;
  onCustomRangeChange: (range: DateRange) => void;
}

const PRESETS: DatePreset[] = [
  'Today',
  'Yesterday',
  'Last 7 Days',
  'Last 30 Days',
  'This Month',
  'Last Month',
  'This Year',
  'Custom Range'
];

export const DatePresetSelector: React.FC<DatePresetSelectorProps> = ({
  selectedPreset,
  onPresetChange,
  customRange,
  onCustomRangeChange
}) => {
  const [internalStart, setInternalStart] = useState(customRange.start);
  const [internalEnd, setInternalEnd] = useState(customRange.end);

  const handlePresetClick = (preset: DatePreset) => {
    onPresetChange(preset);
  };

  const handleApplyCustom = () => {
    onCustomRangeChange({ start: internalStart, end: internalEnd });
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-850 p-4 rounded-2xl flex flex-col gap-3.5 shadow-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Filter className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-zinc-300 font-mono tracking-wider">
              Temporal Bound Filters
            </h4>
            <p className="text-[10px] text-zinc-500 font-sans">
              Apply a global time range filter to refresh core analytics counters.
            </p>
          </div>
        </div>

        {/* Date Presets Row */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset;
            return (
              <button
                key={preset}
                onClick={() => handlePresetClick(preset)}
                className={`px-3 py-1.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/15 text-indigo-455 border-indigo-500/40 font-bold shadow-sm'
                    : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200 hover:border-zinc-800'
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Inputs Panel (Conditional) */}
      {selectedPreset === 'Custom Range' && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-850/50 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2 text-[10px] text-zinc-450 font-mono">
            <span className="uppercase font-bold">Start Date:</span>
            <div className="w-36">
              <DateFilterInput
                value={internalStart}
                onChange={setInternalStart}
                className="bg-zinc-950/80 border border-zinc-850 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-450 font-mono">
            <span className="uppercase font-bold">End Date:</span>
            <div className="w-36">
              <DateFilterInput
                value={internalEnd}
                onChange={setInternalEnd}
                className="bg-zinc-950/80 border border-zinc-850 rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>
          </div>
          <button
            onClick={handleApplyCustom}
            className="px-3.5 py-1 text-[10px] uppercase font-mono font-bold rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors cursor-pointer"
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  );
};
