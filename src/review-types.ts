export type ReviewStatus = "pass" | "warning" | "fail";

export type ProviderId = "jev" | "gpt-5.6-luna";

export type ReviewMode = ProviderId | "both";

export type Criterion = {
  id: string;
  name: string;
  description: string;
  instructions: string;
};

export type Usage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type ReviewItem = {
  criterionId: string;
  criterionName: string;
  status: ReviewStatus;
  riskScore: number;
};

export type ProviderReviewResult = {
  provider: ProviderId;
  requestedModel: string;
  resolvedModel: string | null;
  latencyMs: number;
  usage: Usage;
  items: ReviewItem[];
  error?: string;
};

export type ReviewResponse = {
  executionMode: ReviewMode;
  overallLatencyMs: number;
  results: ProviderReviewResult[];
};

export type ReviewInput = {
  contractText: string;
  criteria: Criterion[];
};
