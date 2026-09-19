import type {
  Criterion,
  ProviderReviewResult,
  ReviewInput,
  ReviewItem,
  Usage,
} from "../review-types";
import { formatClauseIndex } from "../clauses";
import { riskScoreFromProbability, statusFromProbability } from "./provider";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.6-luna";

type OpenAIResponse = {
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

type StructuredReview = {
  passProbability: number;
  evidenceClauseId: string;
};

type CriterionRun = {
  item: ReviewItem;
  usage: Usage;
  resolvedModel: string | null;
};

function buildPrompt(input: ReviewInput, criterion: Criterion): string {
  return `契約書のチェック項目を1つ判定してください。\n\n判定対象:\n- ${criterion.name}\n\n確認する内容:\n${criterion.instructions}\n\n契約書本文に、確認する内容の必要な記述がどの程度存在するかを判断してください。契約書に明示されていない内容を推測で補ってはいけません。条文単体だけでなく、契約書全体の条文間の関係も考慮してください。\n\n確認内容を満たしている確率を passProbability として 0 から 1 の数値で返してください。これは、必要な記述が契約書本文に存在すると考えられる確率です。\n\n次の条文ID一覧から、判断の根拠となる主な条文を1つ選んで evidenceClauseId に設定してください。根拠となる条文が明確でない場合は none を設定してください。条文本文や理由は返さないでください。\n\n条文ID一覧:\n${formatClauseIndex(input.clauses)}\n\npass・warning・failのラベルは返さないでください。\n\n契約書本文:\n${input.contractText}`;
}

function buildSchema(criterion: Criterion, clauses: ReviewInput["clauses"]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      passProbability: { type: "number", minimum: 0, maximum: 1 },
      evidenceClauseId: {
        type: "string",
        enum: [...clauses.map((clause) => clause.id), "none"],
      },
    },
    required: ["passProbability", "evidenceClauseId"],
    title: `contract_review_${criterion.id}`,
  };
}

function extractText(body: OpenAIResponse): string {
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n");
}

function sumUsage(values: Array<number | null>): number | null {
  return values.every((value) => value !== null)
    ? values.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;
}

export class OpenAIProvider {
  readonly id = "gpt-5.6-luna" as const;
  readonly requestedModel = OPENAI_MODEL;

  private async reviewCriterion(input: ReviewInput, criterion: Criterion): Promise<CriterionRun> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY が設定されていません。.env を確認してください。");
    }

    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.requestedModel,
        store: false,
        reasoning: { effort: "medium" },
        instructions: "あなたは契約書レビューの判定器です。指定されたJSONスキーマに厳密に従ってください。",
        input: buildPrompt(input, criterion),
        text: {
          format: {
            type: "json_schema",
            name: `contract_review_${criterion.id}`,
            strict: true,
            schema: buildSchema(criterion, input.clauses),
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const body = (await response.json()) as OpenAIResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `OpenAI API error (${response.status})`);
    }

    let structured: StructuredReview;
    try {
      structured = JSON.parse(extractText(body)) as StructuredReview;
    } catch {
      throw new Error(`${criterion.name} のGPTレスポンスを解釈できませんでした。`);
    }

    const passProbability = structured.passProbability;
    const evidence = input.clauses.find((clause) => clause.id === structured.evidenceClauseId) ?? null;
    const inputTokens = body.usage?.input_tokens ?? null;
    const outputTokens = body.usage?.output_tokens ?? null;

    return {
      resolvedModel: body.model ?? this.requestedModel,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: body.usage?.total_tokens ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
      },
      item: {
        criterionId: criterion.id,
        criterionName: criterion.name,
        status: statusFromProbability(passProbability),
        riskScore: riskScoreFromProbability(passProbability),
        evidence,
      },
    };
  }

  async review(input: ReviewInput): Promise<ProviderReviewResult> {
    const startedAt = performance.now();
    const runs = await Promise.all(
      input.criteria.map((criterion) => this.reviewCriterion(input, criterion)),
    );
    const resolvedModel = runs.find((run) => run.resolvedModel)?.resolvedModel ?? this.requestedModel;

    return {
      provider: this.id,
      requestedModel: this.requestedModel,
      resolvedModel,
      latencyMs: Math.round(performance.now() - startedAt),
      usage: {
        inputTokens: sumUsage(runs.map((run) => run.usage.inputTokens)),
        outputTokens: sumUsage(runs.map((run) => run.usage.outputTokens)),
        totalTokens: sumUsage(runs.map((run) => run.usage.totalTokens)),
      },
      items: runs.map((run) => run.item),
    };
  }
}

export const openAIProvider = new OpenAIProvider();
