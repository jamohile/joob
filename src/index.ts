import { DataToPromise } from "./types";
import { JobParams } from "./Job";

export { Queue } from "./Queue";
export { Job, Events as JobEvents } from "./Job";
export { Operation, Events as OperationEvents } from "./Operation";

/**
 * Possible statuses for an entity to be in.
 * These are managed internally, and should not be set.
 *
 * PENDING: something is queued for execution but has not been started.
 * STARTED: execution has started.
 * COMPLETED: execution has completed. If for a job, the job may contain failed operations.
 * FAILED: execution has completed and failed.
 */
export const STATUSES = {
  PENDING: "PENDING",
  STARTED: "STARTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
};