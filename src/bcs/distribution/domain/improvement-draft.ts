export const DRAFT_STATUSES = ["pending", "accepted", "dismissed"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Context caps so one draft request has bounded cost (016/004 open question 5). */
export const MAX_DRAFT_NOTES = 20;
export const MAX_DRAFT_CONTEXT_CHARS = 100_000;
export const DRAFT_TIMEOUT_MS = 60_000;

export interface ImprovementDraftInput {
  skillName: string;
  /** The version's main file (SKILL.md) the draft improves. */
  currentContent: string;
  /** Open feedback notes for that version, oldest first. */
  notes: string[];
}

export interface DraftedImprovement {
  /** Proposed replacement main file. */
  content: string;
  /** One short paragraph: what changed and why. */
  rationale: string;
}

/** The model call, behind a port so the BC stays provider-agnostic and tests use a stub. */
export interface ImprovementDrafter {
  /** Provider/model id, stored with the draft, e.g. `anthropic/claude-sonnet-5-5`. */
  readonly model: string;
  draft(input: ImprovementDraftInput, signal: AbortSignal): Promise<DraftedImprovement>;
}

export interface ImprovementDraft {
  id: string;
  promptId: string;
  baseVersionId: string;
  status: DraftStatus;
  proposedContent: string;
  rationale: string;
  sourceFeedbackIds: string[];
  model: string;
  createdBy: string;
  createdAt: Date;
  decidedAt: Date | null;
  acceptedVersionId: string | null;
}

export class DraftingUnavailableError extends Error {
  constructor(reason: string) {
    super(`Drafting improvements is unavailable: ${reason}`);
    this.name = "DraftingUnavailableError";
  }
}

export class DraftNotDraftableError extends Error {
  constructor(reason: string) {
    super(`This version cannot be drafted: ${reason}`);
    this.name = "DraftNotDraftableError";
  }
}

export class DraftFailedError extends Error {
  constructor(reason: string) {
    super(`The model could not draft an improvement: ${reason}`);
    this.name = "DraftFailedError";
  }
}

export class DraftNotFoundError extends Error {
  constructor(draftId: string) {
    super(`No draft found with id "${draftId}".`);
    this.name = "DraftNotFoundError";
  }
}

export class DraftNotPendingError extends Error {
  constructor(status: DraftStatus) {
    super(`This draft was already ${status}.`);
    this.name = "DraftNotPendingError";
  }
}

export type DiffLine = { type: "same" | "add" | "del"; text: string };

/** Line diff (LCS) of two texts; fine for skill files, not meant for huge inputs. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: a[i++]! });
    } else {
      out.push({ type: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ type: "del", text: a[i++]! });
  while (j < b.length) out.push({ type: "add", text: b[j++]! });
  return out;
}

/** Next plain-number label after the highest numeric label ("v3" and "3" both count). */
export function nextVersionLabel(labels: string[]): string {
  const numbers = labels.map((l) => /^v?(\d+)$/.exec(l)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  return String((numbers.length ? Math.max(...numbers) : 0) + 1);
}
