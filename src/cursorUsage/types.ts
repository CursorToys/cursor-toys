export interface PlanUsage {
  autoPercentUsed?: number;
  apiPercentUsed?: number;
  totalSpend?: number;
  includedSpend?: number;
  remaining?: number;
  limit?: number;
  bonusTooltip?: string;
}

export interface CursorCredentials {
  userId: string;
  jwt: string;
  email?: string;
}

export interface IncludedRequests {
  used: number;
  limit: number;
}

export interface OnDemandUsage {
  state: 'enabled' | 'disabled' | string;
  spendDollars: number;
  limitDollars: number | null;
}

export interface ConsolidatedUsage {
  includedRequests?: IncludedRequests;
  onDemand?: OnDemandUsage;
  resetsAt?: string;
  planUsage?: PlanUsage;
  membershipType?: string;
}

export interface StripeAuthResponse {
  teamId?: number;
  userId?: number;
  [key: string]: unknown;
}

export interface UsageSummaryResponse {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  membershipType?: string;
  individualUsage?: {
    plan?: {
      used?: number;
      limit?: number;
      remaining?: number;
      autoPercentUsed?: number;
      apiPercentUsed?: number;
      breakdown?: { bonus?: number; included?: number; total?: number };
    };
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
  teamUsage?: {
    onDemand?: {
      enabled?: boolean;
      used?: number;
      limit?: number | null;
      remaining?: number | null;
    };
  };
  [key: string]: unknown;
}

export interface LegacyUsageResponse {
  'gpt-4'?: {
    numRequests?: number;
    maxRequestUsage?: number | null;
  };
  startOfMonth?: string;
  [key: string]: unknown;
}

export interface FilteredUsageEventsResponse {
  totalUsageEventsCount?: number;
  usageEventsDisplay?: unknown[];
  [key: string]: unknown;
}

export interface CurrentPeriodUsageResponse {
  planUsage?: PlanUsage;
  [key: string]: unknown;
}
