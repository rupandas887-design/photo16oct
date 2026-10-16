import { Order, Lead, Production, Payment } from '../types';

export interface BusinessOwnerReviewValidationResult {
  isValid: boolean;
  pendingItems: string[];
  message: string;
  auditDetails: {
    customerAcceptanceVerified: boolean;
    paymentDetailsVerified: boolean;
    outstandingBalanceConfirmed: boolean;
    workflowCompletionVerified: boolean;
  };
}

export function performBusinessOwnerReview(
  order: Order | null | undefined,
  lead: Lead | null | undefined,
  prod: Production | null | undefined,
  payment: Payment | null | undefined
): BusinessOwnerReviewValidationResult {
  const pendingItems: string[] = [];

  // 1. Customer Acceptance
  const customerAcceptanceVerified = !!(
    prod?.editing_status === 'Client Accepted' ||
    prod?.editing_status === 'Client Acceptance' ||
    prod?.production_status === 'Client Accepted' ||
    prod?.production_status === 'Client Acceptance' ||
    (prod as any)?.current_status === 'Client Accepted' ||
    (prod as any)?.current_status === 'Client Acceptance' ||
    prod?.editing_status === 'Project Completed' ||
    prod?.editing_status === 'Completed' ||
    prod?.editing_status === 'Editing Complete' ||
    prod?.editing_status === 'Final Approval' ||
    prod?.editing_status === 'Project Delivered' ||
    prod?.customer_review_status === 'Approved' ||
    prod?.production_status === 'Approved' ||
    prod?.production_status === 'Project Completed' ||
    order?.order_status === 'Completed' ||
    order?.order_status === 'Project Completed' ||
    order?.order_status === 'Delivered' ||
    order?.current_stage === 'Delivered' ||
    order?.current_stage === 'Client Accepted' ||
    order?.current_stage === 'Client Acceptance' ||
    order?.current_stage === 'Final Approval'
  );

  if (!customerAcceptanceVerified) {
    pendingItems.push("Customer Acceptance: Customer has not accepted the work yet.");
  }

  // 2. Payment Details
  const paymentDetailsVerified = !!(
    payment?.payment_id ||
    (payment?.payment_status && payment.payment_status !== 'Pending') ||
    lead?.payment_mode ||
    order?.order_status === 'Paid' ||
    (payment?.final_payment_received !== undefined && payment.final_payment_received > 0) ||
    (payment?.advance_received !== undefined && payment.advance_received > 0) ||
    (order?.advance_received !== undefined && order.advance_received > 0)
  );

  if (!paymentDetailsVerified) {
    pendingItems.push("Payment Details: Payment details are not verified.");
  }

  // 3. Outstanding Balance
  const balanceDue = payment?.balance_due ?? order?.balance_amount ?? 0;
  const paymentStatus = payment?.payment_status;

  const outstandingBalanceConfirmed = balanceDue <= 0 || paymentStatus === 'Fully Paid' || order?.order_status === 'Paid';

  if (!outstandingBalanceConfirmed) {
    pendingItems.push(`Outstanding Balance: ₹${balanceDue > 0 ? balanceDue.toLocaleString() : 'Pending'} balance remains unpaid.`);
  }

  // 4. Overall Workflow Completion
  const workflowCompletionVerified = !!(
    order?.current_stage === 'Event Completed' ||
    order?.current_stage === 'Footage Handover Verified' ||
    order?.current_stage === 'Raw Footage Received' ||
    order?.current_stage === 'Delivered' ||
    order?.current_stage === 'Business Owner Review' ||
    order?.current_stage === 'Closed' ||
    order?.current_stage === 'Order Closed' ||
    order?.current_stage === 'Completed' ||
    prod?.editing_status === 'Editing Complete' ||
    prod?.editing_status === 'Project Completed' ||
    prod?.editing_status === 'Completed' ||
    prod?.editing_status === 'Closed' ||
    prod?.editing_status === 'Order Closed' ||
    prod?.editing_status === 'Final Approval' ||
    prod?.editing_status === 'Client Accepted' ||
    prod?.editing_status === 'Client Acceptance'
  );

  if (!workflowCompletionVerified) {
    pendingItems.push("Overall Workflow Completion: Prior workflow stages are still pending.");
  }

  const isValid = pendingItems.length === 0;
  const message = isValid
    ? "Business Owner Review Passed: All validation criteria met."
    : `Business Owner Review Pending: Cannot close order until the following items are verified:\n\n${pendingItems.map((item, idx) => `• ${item}`).join('\n')}`;

  return {
    isValid,
    pendingItems,
    message,
    auditDetails: {
      customerAcceptanceVerified,
      paymentDetailsVerified,
      outstandingBalanceConfirmed,
      workflowCompletionVerified
    }
  };
}
