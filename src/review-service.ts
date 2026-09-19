import { CHECK_CRITERIA } from "./config";
import { jevProvider } from "./providers/jev";
import { openAIProvider } from "./providers/openai";
import type {
  ProviderId,
  ProviderReviewResult,
  ReviewMode,
  ReviewResponse,
} from "./review-types";

const providers = {
  jev: jevProvider,
  "gpt-5.6-luna": openAIProvider,
} as const;

function selectedProviderIds(mode: ReviewMode): ProviderId[] {
  return mode === "both" ? ["gpt-5.6-luna", "jev"] : [mode];
}

function errorResult(provider: ProviderId, error: unknown): ProviderReviewResult {
  const message = error instanceof Error ? error.message : "モデル実行に失敗しました。";
  return {
    provider,
    requestedModel: provider,
    resolvedModel: null,
    latencyMs: 0,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    items: [],
    error: message,
  };
}

export async function runReview(params: {
  contractText: string;
  criteriaIds: string[];
  executionMode: ReviewMode;
}): Promise<ReviewResponse> {
  const criteria = CHECK_CRITERIA.filter((criterion) => params.criteriaIds.includes(criterion.id));
  if (!criteria.length) throw new Error("チェック項目を1つ以上選択してください。");

  const startedAt = performance.now();
  const input = { contractText: params.contractText, criteria };
  const results = await Promise.all(
    selectedProviderIds(params.executionMode).map(async (providerId) => {
      try {
        const result = await providers[providerId].review(input);
        return result;
      } catch (error) {
        return errorResult(providerId, error);
      }
    }),
  );

  return {
    executionMode: params.executionMode,
    overallLatencyMs: Math.round(performance.now() - startedAt),
    results,
  };
}
