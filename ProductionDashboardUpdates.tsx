import React, { useEffect } from 'react';
import { useRole } from './RoleContext';
import { ProductionFilters, ProductionFiltersProps } from './production/ProductionFilters';
import { ProductionAssignment, ProductionAssignmentProps } from './production/ProductionAssignment';
import { ProductionProofUpload, ProductionProofUploadProps } from './production/ProductionProofUpload';
import { ProductionTaskActions, ProductionTaskActionsProps } from './production/ProductionTaskActions';
import { ProductionTaskDetails, ProductionTaskDetailsProps } from './production/ProductionTaskDetails';
import { ProductionReassign, ProductionReassignProps } from './production/ProductionReassign';
import { ProductionFullScreenManager } from './production/ProductionFullScreenManager';
import { ProductionNoteManager } from './production/ProductionNoteManager';
import { ProductionEventManager } from './production/ProductionEventManager';
import { ProductionAssignedTeamManager } from './production/ProductionAssignedTeamManager';

/**
 * ProductionDashboardUpdates.tsx
 * 
 * DESIGNATED EXTENSION MODULE FOR FUTURE PRODUCTION DASHBOARD UPDATES.
 * 
 * STRICT ARCHITECTURAL RULES:
 * 1. Do NOT add new code directly to ProductionModule.tsx (which remains untouched as the reference source).
 * 2. Keep this file under 3,000 lines total.
 * 3. Modular feature sub-components reside in src/components/production/*.tsx.
 * 4. Zero change to existing Production UI/UX or workflow.
 */

export interface ProductionExtensionContainerProps {
  children?: React.ReactNode;
  className?: string;
}

export const ProductionExtensionContainer: React.FC<ProductionExtensionContainerProps> = ({
  children,
  className = ''
}) => {
  const { setIsProductionDashboardActive } = useRole();

  useEffect(() => {
    if (setIsProductionDashboardActive) {
      setIsProductionDashboardActive(true);
    }
    return () => {
      if (setIsProductionDashboardActive) {
        setIsProductionDashboardActive(false);
      }
    };
  }, [setIsProductionDashboardActive]);

  return (
    <div className={`production-dashboard-extension ${className}`}>
      <ProductionFullScreenManager />
      <ProductionNoteManager />
      <ProductionEventManager />
      <ProductionAssignedTeamManager />
      {children}
    </div>
  );
};

// Re-export modular components for seamless import by future features
export {
  ProductionFilters,
  ProductionAssignment,
  ProductionProofUpload,
  ProductionTaskActions,
  ProductionTaskDetails,
  ProductionReassign,
  ProductionFullScreenManager,
  ProductionNoteManager,
  ProductionEventManager,
  ProductionAssignedTeamManager
};

export type {
  ProductionFiltersProps,
  ProductionAssignmentProps,
  ProductionProofUploadProps,
  ProductionTaskActionsProps,
  ProductionTaskDetailsProps,
  ProductionReassignProps
};
