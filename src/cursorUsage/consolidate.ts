import type {
  ConsolidatedUsage,
  CurrentPeriodUsageResponse,
  PlanUsage,
  UsageSummaryResponse,
} from './types';

/**
 * Maps dashboard API payloads into ConsolidatedUsage for the status bar.
 */
export function consolidateUsage(
  period: CurrentPeriodUsageResponse | null,
  summary: UsageSummaryResponse | null
): ConsolidatedUsage {
  const result: ConsolidatedUsage = {};

  if (period?.planUsage) {
    result.planUsage = { ...period.planUsage };
  }

  if (summary) {
    result.membershipType =
      typeof summary.membershipType === 'string' ? summary.membershipType : undefined;
    result.resetsAt =
      typeof summary.billingCycleEnd === 'string' ? summary.billingCycleEnd : undefined;

    const plan = summary.individualUsage?.plan;
    if (plan && typeof plan.used === 'number' && typeof plan.limit === 'number') {
      result.includedRequests = { used: plan.used, limit: plan.limit };
    }

    const onDemand = summary.individualUsage?.onDemand ?? summary.teamUsage?.onDemand;
    if (onDemand) {
      const usedCents = typeof onDemand.used === 'number' ? onDemand.used : 0;
      const limitCents = typeof onDemand.limit === 'number' ? onDemand.limit : null;
      result.onDemand = {
        state: onDemand.enabled ? 'enabled' : 'disabled',
        spendDollars: usedCents / 100,
        limitDollars: limitCents !== null ? limitCents / 100 : null,
      };
    }

    if (!result.planUsage && plan) {
      const planUsage: PlanUsage = {};
      if (typeof plan.autoPercentUsed === 'number') {
        planUsage.autoPercentUsed = plan.autoPercentUsed;
      }
      if (typeof plan.apiPercentUsed === 'number') {
        planUsage.apiPercentUsed = plan.apiPercentUsed;
      }
      if (typeof plan.used === 'number') {
        planUsage.totalSpend = plan.used;
      }
      if (typeof plan.remaining === 'number') {
        planUsage.remaining = plan.remaining;
      }
      if (plan.breakdown?.bonus) {
        planUsage.bonusTooltip = `Bonus usage: ${plan.breakdown.bonus}`;
      }
      if (Object.keys(planUsage).length > 0) {
        result.planUsage = planUsage;
      }
    }
  }

  return result;
}
