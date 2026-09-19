import { JEV_MODEL } from "../config";
import type {
  Criterion,
  ProviderReviewResult,
  ReviewInput,
  ReviewItem,
} from "../review-types";
import { formatClauseIndex } from "../clauses";
import { riskScoreFromProbability, statusFromProbability } from "./provider";

const JEV_ENDPOINT = process.env.TYPESAFE_API_URL ?? "https://api.typesafe.ai/v1/systemone";

type JevAnswer = {
  type?: string;
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, JevAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

function buildQuestions(criteria: Criterion[], clauses: ReviewInput["clauses"]) {
  return Object.fromEntries(
    criteria.flatMap((criterion) => [
      [
        `${criterion.id}__decision`,
        {
          type: "noul",
          instructions: `チェック項目「${criterion.name}」を、契約書全文と条文間の関係を考慮して判定してください。\n\n${criterion.instructions}`,
          criteria: {
            true: "契約書本文に、確認対象の必要な記述が具体的に存在する",
            false: "必要な記述がない、必要な要素が欠けている、または一般的・曖昧な表現で具体的に確認できない",
          },
        },
      ],
      [
        `${criterion.id}__evidence`,
        {
          type: "choice",
          instructions: `契約書全文と「${criterion.name}」の確認内容を踏まえ、判断の根拠となる主な条文を1つ選択してください。条文単体ではなく、定義、例外、期間、責任分担など、他の条文との関係も考慮してください。根拠となる条文が明確でない場合は none を選択してください。`,
          criteria: Object.fromEntries([
            ...clauses.map((clause) => [clause.id, clause.label]),
            ["none", "該当する条文なし"],
          ]),
        },
      ],
    ]),
  );
}

function toItems(
  criteria: Criterion[],
  clauses: ReviewInput["clauses"],
  answers: Record<string, JevAnswer> | undefined,
): ReviewItem[] {
  return criteria.map((criterion) => {
    const probability = answers?.[`${criterion.id}__decision`]?.noul ?? 0.5;
    const evidenceAnswer = answers?.[`${criterion.id}__evidence`];
    const selectedClauseId = evidenceAnswer?.choice;
    const selectedClause = clauses.find((clause) => clause.id === selectedClauseId);
    const selectedProbability = selectedClauseId
      ? evidenceAnswer?.probabilities?.[selectedClauseId] ?? 0
      : 0;

    return {
      criterionId: criterion.id,
      criterionName: criterion.name,
      status: statusFromProbability(probability),
      riskScore: riskScoreFromProbability(probability),
      evidence:
        selectedClauseId && selectedClauseId !== "none" && selectedClause && selectedProbability >= 0.5
          ? selectedClause
          : null,
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
        state: `${input.contractText}\n\n条文ID一覧:\n${formatClauseIndex(input.clauses)}`,
        questions: buildQuestions(input.criteria, input.clauses),
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
      items: toItems(input.criteria, input.clauses, body.answers),
    };
  }
}

export const jevProvider = new JevProvider();
