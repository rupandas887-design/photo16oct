import React from 'react';
import { UnifiedCalendar } from './UnifiedCalendar';

interface ProductionCalendarProps {
  onOpenAssignEditor?: (targetOrderId: string, targetLeadId?: string) => void;
}

export const ProductionCalendar: React.FC<ProductionCalendarProps> = ({ onOpenAssignEditor }) => {
  return <UnifiedCalendar role="production" onOpenAssignEditor={onOpenAssignEditor} />;
};
