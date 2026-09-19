import { JEV_MODEL } from "../config";
import type {
  Criterion,
  ProviderReviewResult,
  ReviewInput,
  ReviewItem,
} from "../review-types";
import { riskScoreFromProbability, statusFromProbability } from "./provider";

const JEV_ENDPOINT = process.env.TYPESAFE_API_URL ?? "https://api.typesafe.ai/v1/systemone";

type JevAnswer = {
  type?: string;
  noul?: number;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

function buildQuestions(criteria: Criterion[]) {
  return Object.fromEntries(
    criteria.map((criterion) => [
      criterion.id,
      {
        type: "noul",
        instructions: criterion.instructions,
        criteria: {
          true: "契約書本文に、確認対象の必要な記述が具体的に存在する",
          false: "必要な記述がない、必要な要素が欠けている、または一般的・曖昧な表現で具体的に確認できない",
        },
      },
    ]),
  );
}

function toItems(criteria: Criterion[], answers: Record<string, JevAnswer> | undefined): ReviewItem[] {
  return criteria.map((criterion) => {
    const probability = answers?.[criterion.id]?.noul ?? 0.5;
    return {
      criterionId: criterion.id,
      criterionName: criterion.name,
      status: statusFromProbability(probability),
      riskScore: riskScoreFromProbability(probability),
    };
  });
}

export class JevProvider {
  readonly id = "jev" as const;
  readonly requestedModel = JEV_MODEL;

  async review(input: ReviewInput): Promise<ProviderReviewResult> {
    const startedAt = performance.now();
    const apiKey = process.env.TYPESAFE_API_KEY;

    if (!apiKey) {
      throw new Error("TYPESAFE_API_KEY が設定されていません。.env を確認してください。");
    }

    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.requestedModel,
        state: input.contractText,
        questions: buildQuestions(input.criteria),
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const body = (await response.json()) as JevResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(body.error?.message ?? `Jev API error (${response.status})`);
    }

    const inputTokens = body.usage?.input_tokens ?? null;
    const outputTokens = body.usage?.output_tokens ?? null;

    return {
      provider: this.id,
      requestedModel: this.requestedModel,
      resolvedModel: body.model ?? null,
      latencyMs: Math.round(performance.now() - startedAt),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null,
      },
      items: toItems(input.criteria, body.answers),
    };
  }
}

export const jevProvider = new JevProvider();
