import React from 'react';
import { UnifiedCalendar } from './UnifiedCalendar';

export interface ProductionStaffCalendarProps {
  staffMemberId?: string;
  staffMemberName?: string;
}

export const ProductionStaffCalendar: React.FC<ProductionStaffCalendarProps> = ({ 
  staffMemberId, 
  staffMemberName 
}) => {
  return (
    <UnifiedCalendar 
      role="production_staff" 
      staffMemberId={staffMemberId} 
      staffMemberName={staffMemberName} 
    />
  );
};
