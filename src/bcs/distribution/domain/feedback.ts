export const FEEDBACK_KINDS = ["signal", "note"] as const;
export const FEEDBACK_RATINGS = ["up", "down"] as const;
export const MAX_FEEDBACK_TEXT_LENGTH = 4000;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export interface FileFeedbackParams {
  serveId: string;
  kind: FeedbackKind;
  rating?: FeedbackRating | null;
  text?: string | null;
}

export interface Feedback {
  id: string;
  serveId: string;
  userId: string;
  kind: FeedbackKind;
  rating: FeedbackRating | null;
  text: string | null;
  createdAt: Date;
}

/** The serve id is unknown, malformed, or belongs to another organization (indistinguishable by design). */
export class ServeNotFoundError extends Error {
  constructor(serveId: string) {
    super(`No serve found with id "${serveId}".`);
    this.name = "ServeNotFoundError";
  }
}

export class InvalidFeedbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFeedbackError";
  }
}

/** A signal needs a rating; a note needs non-empty text within the cap. Returns the normalized text. */
export function validateFeedback(params: FileFeedbackParams): string | null {
  const text = params.text?.trim() || null;
  if (params.kind === "signal" && !params.rating) {
    throw new InvalidFeedbackError("A signal needs a rating (up or down).");
  }
  if (params.kind === "note" && !text) {
    throw new InvalidFeedbackError("A note needs text.");
  }
  if (text && text.length > MAX_FEEDBACK_TEXT_LENGTH) {
    throw new InvalidFeedbackError(`Feedback text may be at most ${MAX_FEEDBACK_TEXT_LENGTH} characters.`);
  }
  return text;
}

/** One feedback row as shown on a skill's Feedback tab, with the serve it was filed against. */
export interface SkillFeedbackItem extends Feedback {
  /** Label of the version that was served. */
  version: string;
  versionId: string;
  addressedAt: Date | null;
  addressedInVersionId: string | null;
}

export interface FeedbackVersionCounts {
  version: string;
  versionId: string;
  up: number;
  down: number;
  notes: number;
}

export interface SkillFeedbackSummary {
  /** One entry per version that has feedback. */
  byVersion: FeedbackVersionCounts[];
  /** Notes only, newest first. */
  notes: SkillFeedbackItem[];
}

/** Down ratings over rated feedback for one version; `rate` is null until something is rated. */
export interface DownRate {
  up: number;
  down: number;
  rate: number | null;
}

export class FeedbackNotFoundError extends Error {
  constructor(feedbackId: string) {
    super(`No note found with id "${feedbackId}".`);
    this.name = "FeedbackNotFoundError";
  }
}

export class FeedbackVersionMismatchError extends Error {
  constructor() {
    super("The version must belong to the same skill the note was filed against.");
    this.name = "FeedbackVersionMismatchError";
  }
}

export function computeDownRate(up: number, down: number): DownRate {
  const rated = up + down;
  return { up, down, rate: rated === 0 ? null : down / rated };
}
