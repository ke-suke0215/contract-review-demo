import type { ContractClause } from "./review-types";

const CLAUSE_HEADING = /^##\s+(.+)$/gm;

export function extractClauses(contractText: string): ContractClause[] {
  const headings = [...contractText.matchAll(CLAUSE_HEADING)];

  if (!headings.length) {
    return [
      {
        id: "whole-contract",
        label: "契約書本文",
        text: contractText.trim(),
      },
    ];
  }

  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? contractText.length;
    return {
      id: `clause-${index + 1}`,
      label: heading[1].trim(),
      text: contractText.slice(start, end).trim(),
    };
  });
}

export function formatClauseIndex(clauses: ContractClause[]): string {
  return clauses.map((clause) => `[${clause.id}] ${clause.label}`).join("\n");
}
