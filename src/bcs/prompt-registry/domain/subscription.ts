/**
 * Domain types and errors for skill sharing — subscribe & fork
 * (020-prompt-sharing, PDR-016). A universal mechanism, symmetric whether
 * the source or recipient is a user or a team.
 */

import type { PromptOwnerType } from "./prompt";

/** Reuses Prompt's owner-type discriminator — the same "user" | "team" split. */
export type OwnerType = PromptOwnerType;
export type SubscriberType = PromptOwnerType;

export interface Subscription {
  id: string;
  organizationId: string;
  sourceSkillId: string;
  subscriberType: SubscriberType;
  subscriberId: string;
  createdAt: Date;
}

export interface SubscribeSkillParams {
  subscriberType: SubscriberType;
  subscriberId: string;
}

export interface ForkSkillParams {
  ownerType: OwnerType;
  ownerId: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the source skill does not exist, or belongs to a different organization (M3). */
export class SourceSkillNotFoundError extends Error {
  constructor() {
    super("No skill found with this id in the caller's organization.");
    this.name = "SourceSkillNotFoundError";
  }
}

/** Thrown when a subscription lookup by id fails, or the caller has no authority over it (FR-007). */
export class SubscriptionNotFoundError extends Error {
  constructor() {
    super("No subscription found with this id, or the caller has no authority over it.");
    this.name = "SubscriptionNotFoundError";
  }
}

/** Thrown on a duplicate (source skill, subscriber) pair (FR-002/SC-006). */
export class DuplicateSubscriptionError extends Error {
  constructor() {
    super("This subscriber is already subscribed to this skill.");
    this.name = "DuplicateSubscriptionError";
  }
}

/** Thrown when the named subscriber/new-owner does not belong to the source skill's organization (FR-003/FR-012/FR-015). */
export class CrossOrgSubscriberError extends Error {
  constructor() {
    super("The subscriber or new owner must belong to the same organization as the source skill.");
    this.name = "CrossOrgSubscriberError";
  }
}

/** Thrown when a subscriber attempts to subscribe to a skill they already own (FR-004). */
export class CannotSubscribeToOwnSkillError extends Error {
  constructor() {
    super("Cannot subscribe to a skill you already own.");
    this.name = "CannotSubscribeToOwnSkillError";
  }
}

/** Thrown when forking would create a new "copy" under an owner that already owns the source (FR-021). */
export class CannotForkOwnSkillError extends Error {
  constructor() {
    super("Cannot fork a skill into an owner that already owns it.");
    this.name = "CannotForkOwnSkillError";
  }
}

/** Thrown when the acting user is not the named user, nor an admin/owner of the named team (FR-005/FR-013). */
export class SubscriberNotAuthorizedError extends Error {
  constructor() {
    super("You do not have permission to act on behalf of this subscriber or owner.");
    this.name = "SubscriberNotAuthorizedError";
  }
}
