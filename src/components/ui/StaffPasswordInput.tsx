import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Key } from 'lucide-react';

interface StaffPasswordInputProps {
  isEditing: boolean;
  resetKey?: string | number | null;
  value: string;
  onChange: (val: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  label?: React.ReactNode;
  labelClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
  overlayPaddingClass?: string;
  name?: string;
  required?: boolean;
  minLength?: number;
  placeholderNew?: string;
  helperTextEdit?: string;
}

export const StaffPasswordInput: React.FC<StaffPasswordInputProps> = ({
  isEditing,
  resetKey,
  value,
  onChange,
  showPassword,
  onToggleShow,
  label,
  labelClassName = 'block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono',
  inputClassName = 'w-full bg-zinc-900 border border-zinc-850 pl-4 pr-10 py-2.5 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-sans',
  buttonClassName = 'absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white focus:outline-none cursor-pointer p-1',
  name,
  required = false,
  minLength,
  placeholderNew = 'Enter password',
  helperTextEdit = 'Existing password remains unchanged unless you save a new password (min 6 chars).'
}) => {
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false);

  useEffect(() => {
    setIsSettingNewPassword(false);
  }, [isEditing, resetKey]);

  const showInputField = !isEditing || isSettingNewPassword;

  const resolvedPlaceholder = isEditing
    ? 'Enter new password (min 6 chars)'
    : placeholderNew;

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClassName}>
          {label}
        </label>
        {isEditing && !isSettingNewPassword && (
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 font-bold shrink-0">
            <Lock className="w-3 h-3" />
            Existing Password Set
          </span>
        )}
        {isEditing && isSettingNewPassword && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsSettingNewPassword(false);
            }}
            className="text-[10px] text-zinc-400 hover:text-white font-mono underline cursor-pointer shrink-0"
          >
            Cancel Change
          </button>
        )}
      </div>

      {showInputField ? (
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            name={name}
            autoComplete="new-password"
            required={isEditing ? false : required}
            minLength={minLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={resolvedPlaceholder}
            className={inputClassName}
          />
          <button
            type="button"
            onClick={onToggleShow}
            title={showPassword ? 'Hide password' : 'Show password'}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={buttonClassName}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-850 rounded-xl px-3.5 py-2">
          <span className="text-[11px] text-zinc-400 font-sans truncate">
            Current password is securely protected
          </span>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setIsSettingNewPassword(true);
            }}
            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 border border-zinc-700 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Key className="w-3 h-3" />
            <span>Set New Password</span>
          </button>
        </div>
      )}

      {isEditing && helperTextEdit && (
        <p className="text-[10px] text-zinc-500 font-sans">
          {helperTextEdit}
        </p>
      )}
    </div>
  );
};
