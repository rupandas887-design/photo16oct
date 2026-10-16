import React from 'react';

interface AddressData {
  client_residence_address: string;
  city: string;
  state: string;
  pincode: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelectAddress: (data: AddressData) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  isTextArea?: boolean;
  rows?: number;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = '',
  isTextArea = false,
  rows = 2,
}) => {
  return (
    <div className="relative w-full">
      {isTextArea ? (
        <textarea
          rows={rows}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500`}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500`}
          placeholder={placeholder}
        />
      )}
    </div>
  );
};
