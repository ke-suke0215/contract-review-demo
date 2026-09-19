import type {
  ProviderId,
  ProviderReviewResult,
  ReviewInput,
} from "../review-types";

export interface ReviewProvider {
  readonly id: ProviderId;
  readonly requestedModel: string;
  review(input: ReviewInput): Promise<ProviderReviewResult>;
}

export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function statusFromProbability(probability: number) {
  if (probability >= 0.8) return "pass" as const;
  if (probability >= 0.5) return "warning" as const;
  return "fail" as const;
}

export function riskScoreFromProbability(probability: number): number {
  return Math.round((1 - clampProbability(probability)) * 100);
}
