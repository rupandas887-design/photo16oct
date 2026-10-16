import React from 'react';
import { UnifiedCalendar } from './UnifiedCalendar';

interface OperationsCalendarProps {
  onOpenAssignStaff?: (targetOrderId: string, targetLeadId?: string, targetEventId?: string) => void;
}

export const OperationsCalendar: React.FC<OperationsCalendarProps> = ({ onOpenAssignStaff }) => {
  return <UnifiedCalendar role="operations" onOpenAssignStaff={onOpenAssignStaff} />;
};
