import React from 'react';

const generateTimeOptions = () => {
  const times = [];
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 60; j += 15) {
      const h = i % 12 || 12;
      const ampm = i < 12 ? 'AM' : 'PM';
      const m = j === 0 ? '00' : j;
      times.push(`${String(h).padStart(2, '0')}:${m} ${ampm}`);
    }
  }
  return times;
};

export const TIME_OPTIONS = generateTimeOptions();

interface Props {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}

export function ReportingTimeSelector({ value, onChange, className }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`reporting-time-select bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-white appearance-none ${className || ''}`}
      style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right .7rem top 50%', backgroundSize: '.65rem auto', paddingRight: '1.5rem' }}
    >
      <option value="">Select Time</option>
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
