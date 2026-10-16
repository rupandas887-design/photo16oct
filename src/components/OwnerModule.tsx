import React from 'react';
import { OwnerRevenueDetailed } from './analytics/owner/OwnerRevenueDetailed';
import { OwnerSalesDetailed } from './analytics/owner/OwnerSalesDetailed';
import { OwnerStaffPerformanceDetailed } from './analytics/owner/OwnerStaffPerformanceDetailed';
import { BusinessOwnerCalendar } from './BusinessOwnerCalendar';

// --- 1. REVENUE ANALYTICS ---
export const OwnerRevenueAnalytics = () => {
  return (
    <div className="animate-in fade-in duration-300">
      <OwnerRevenueDetailed />
    </div>
  );
};

// --- 2. EVENT CALENDAR ---
export const OwnerEventCalendar = () => {
  return (
    <div className="animate-in fade-in duration-300">
      <BusinessOwnerCalendar />
    </div>
  );
};

// --- 3. SALES REPORT & ANALYTICS ---
export const OwnerSalesReport = () => {
  return (
    <div className="animate-in fade-in duration-300">
      <OwnerSalesDetailed />
    </div>
  );
};

// --- 4. STAFF PERFORMANCE REPORT ---
export const OwnerStaffPerformanceReport = () => {
  return (
    <div className="animate-in fade-in duration-300">
      <OwnerStaffPerformanceDetailed />
    </div>
  );
};
