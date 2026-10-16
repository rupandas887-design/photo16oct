import React, { useState, useEffect } from 'react';

interface TimePicker12HourProps {
  value?: string; // 24-hour format like "13:30" or "09:15"
  onChange: (value24: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export const TimePicker12Hour: React.FC<TimePicker12HourProps> = ({
  value = '',
  onChange,
  required = false,
  disabled = false,
  className = '',
  id
}) => {
  const parseValue = (val: string) => {
    if (!val) return { hour: '', minute: '', ampm: 'AM' };
    const clean = val.trim();
    const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      return {
        hour: ampmMatch[1].padStart(2, '0'),
        minute: ampmMatch[2],
        ampm: ampmMatch[3].toUpperCase()
      };
    }
    const parts = clean.split(':');
    if (parts.length >= 2) {
      let h24 = parseInt(parts[0], 10);
      if (isNaN(h24)) return { hour: '', minute: '', ampm: 'AM' };
      const min = parts[1].slice(0, 2).padStart(2, '0');
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      let h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      return {
        hour: String(h12).padStart(2, '0'),
        minute: min,
        ampm
      };
    }
    return { hour: '', minute: '', ampm: 'AM' };
  };

  const initial = parseValue(value);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [ampm, setAmpm] = useState(initial.ampm);

  useEffect(() => {
    const parsed = parseValue(value);
    setHour(parsed.hour);
    setMinute(parsed.minute);
    setAmpm(parsed.ampm);
  }, [value]);

  const updateTime = (newH: string, newM: string, newA: string) => {
    if (!newH && !newM) {
      onChange('');
      return;
    }
    const h = newH || '12';
    const m = newM || '00';
    
    let hNum = parseInt(h, 10);
    if (isNaN(hNum)) hNum = 12;
    if (newA === 'PM' && hNum < 12) {
      hNum += 12;
    } else if (newA === 'AM' && hNum === 12) {
      hNum = 0;
    }
    const h24Str = String(hNum).padStart(2, '0');
    const mStr = (m || '00').padStart(2, '0');
    onChange(`${h24Str}:${mStr}`);
  };

  const hoursList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  if (!minutesList.includes(minute) && minute) {
    minutesList.push(minute);
    minutesList.sort();
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`} id={id}>
      <select
        disabled={disabled}
        required={required}
        value={hour}
        onChange={(e) => {
          setHour(e.target.value);
          updateTime(e.target.value, minute, ampm);
        }}
        className="bg-slate-950 border border-slate-750 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
      >
        <option value="" disabled className="text-slate-500">HH</option>
        {hoursList.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-400 font-bold">:</span>
      <select
        disabled={disabled}
        required={required}
        value={minute}
        onChange={(e) => {
          setMinute(e.target.value);
          updateTime(hour, e.target.value, ampm);
        }}
        className="bg-slate-950 border border-slate-750 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
      >
        <option value="" disabled className="text-slate-500">MM</option>
        {minutesList.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        disabled={disabled}
        required={required}
        value={ampm}
        onChange={(e) => {
          setAmpm(e.target.value);
          updateTime(hour, minute, e.target.value);
        }}
        className="bg-slate-950 border border-slate-750 rounded-lg px-2 py-1.5 text-xs text-amber-400 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};
