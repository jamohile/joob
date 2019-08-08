import EventEmitter from "events";
import { DataToPromise, DataToId } from "./types";
import { Operation, Events as OperationEvents } from "./Operation";
import { STATUSES } from "./index";

export const Events = {
  JOB_STARTED: "JOB_STARTED",
  JOB_COMPLETED: "JOB_COMPLETED"
};

/**
 * A job bundles multiple Operations.
 * It monitors their execution, schedules them, and retries them if they fail.
 * It also forwards all events they emit.
 *
 */

interface JobParams {
  /** A unique name for this job. */
  name: string;
  /** A function that maps an arbitrary piece of data to a promise for execution. */
  resolver: DataToPromise;
  /** An array of data elements, each one will be an operation. */
  data: any[];
  /** A function to map each data element to an ID used to identify the operation*/
  dataToId: DataToId;
  /** Maximum operations we can run at one time. */
  maxConcurrentOperations: number;
  /** Maximum times an operation can fail and be retried */
  maxFailuresPerOperation: number;

  /** In ms, a delay that will be enforced before each request runs. */
  cooldown: number;
  /** In ms, how much to delay a failed operation to isolate it from others. */
  throttle: number;
}

export class Job {
  /** A unique name for this job. */
  name: string;
  /** A function that maps an arbitrary piece of data to a promise for execution. */
  resolver: DataToPromise;

  /** An array of data elements, each one will be a request. */
  data: any[];

  /** A map of id:operation of operations currently being run. */
  currentOperations: { [key: string]: Operation } = {};
  /** The number of operations in currentOperations. We need a counter because the above needs to be a map. */
  numCurrentOperations: number = 0;

  /** Maximum operations we can run at one time. */
  maxConcurrentOperations: number;
  /** Maximum times an operation can fail and be retried */
  maxFailuresPerOperation: number;

  /** In ms, a delay that will be enforced before each request runs. */
  cooldown: number;
  /** In ms, how much to delay a failed operation to isolate it from others. */
  throttle: number;

  /** The current status of the job.
   * PENDING: This job has not started yet.
   * STARTED: This job has started running.
   * COMPLETED: This job has finished all operations. Some operations may have failed.
   */
  status: string;

  /**
   * We also keep a dictionary of jobs for easy id access.
   */
  operationIndex: { [key: string]: Operation } = {};

  /**
   * All operations start here, in a queue. This are waiting to be run.
   */
  queuedOperations: Operation[] = [];
  /**
   * Completed operations go here.
   */
  completedOperations: Operation[] = [];

  events: EventEmitter;

  constructor({
    name,
    resolver,
    data,
    dataToId = d => d.id,
    maxConcurrentOperations = 1,
    maxFailuresPerOperation = 1,
    cooldown = 0,
    throttle = 500
  }: JobParams) {
    this.name = name;
    this.resolver = resolver;
    this.data = data;

    this.maxConcurrentOperations = maxConcurrentOperations;
    this.maxFailuresPerOperation = maxFailuresPerOperation;

    this.cooldown = cooldown;
    this.throttle = throttle;

    this.status = STATUSES.PENDING;

    /**
     * We convert the input set of data into a set of operations that can be executed.
     */
    this.queuedOperations = data.map((d: any) => {
      const id = dataToId(d);
      const operation = new Operation(dataToId(d), resolver, d);
      this.operationIndex[id] = operation;
      return operation;
    });

    this.events = new EventEmitter();
  }

  /**
   * Start execution for the job.
   * @returns {Promise<string> | undefined} A promise wrapper around the event.
   */
  start(): Promise<string> | undefined {
    /**
     * Prevents double execution.
     */
    if (this.status === STATUSES.STARTED) {
      return undefined;
    }
    this.status = STATUSES.STARTED;
    this.emit(Events.JOB_STARTED);
    this.startNextOperation();
    return new Promise((resolve, reject) => {
      this.events.on(Events.JOB_COMPLETED, resolve);
    });
  }

  /**
   * Whether the maximum number of concurrent operations is being run.
   */
  isFull(): boolean {
    return this.numCurrentOperations >= this.maxConcurrentOperations;
  }

  /**
   * Whether there are any queued operations remaining.
   */
  hasPending(): boolean {
    return this.queuedOperations.length > 0;
  }

  /**
   * Whether this job is done.
   */
  isComplete(): boolean {
    return this.numCurrentOperations === 0 && !this.hasPending();
  }

  /**
   * Start the next operation if applicable.
   * This will check internally that all conditions are met.
   * @param {boolean} cooled - Used to implement cooling. By default this is false, and the function will be recalled with cooled = true after a timeout.
   */

  private startNextOperation(cooled: boolean = false): void {
    /** If called without cooldown, add a cooldown. */
    if (this.cooldown && !cooled) {
      setTimeout(() => this.startNextOperation(true), this.cooldown);
      return;
    }

    /** Don't start operation if max are running. */
    if (this.isFull()) {
      return;
    }

    /** This function is always called after an operation, including the last one. If this is the case, signal done. */
    if (this.isComplete()) {
      if (this.status === STATUSES.COMPLETED) {
        return;
      }
      this.status = STATUSES.COMPLETED;
      this.emit(Events.JOB_COMPLETED);
      return;
    }

    /** Only run if there are new operations to run. */
    if (this.hasPending()) {
      const newOperation = this.queuedOperations.shift() as Operation;
      this.currentOperations[newOperation.id] = newOperation;
      this.numCurrentOperations += 1;

      /** Using .once so that these don't get recreated if we re-run the operation. */
      /** We also forward any child operation events. */
      newOperation.events.once(
        OperationEvents.OPERATION_STARTED,
        (id: number | string) => {
          this.emitOperation(OperationEvents.OPERATION_STARTED, id);
        }
      );
      newOperation.events.once(
        OperationEvents.OPERATION_COMPLETED,
        (id: number | string) => {
          this.emitOperation(OperationEvents.OPERATION_COMPLETED, id);
          this.handleOperationComplete(id, true);
        }
      );
      newOperation.events.once(
        OperationEvents.OPERATION_FAILED,
        (id: number | string) => {
          this.emitOperation(OperationEvents.OPERATION_FAILED, id);
          /** Requeue the operation if it is within the rety limit. */
          if (newOperation.timesFailed < this.maxFailuresPerOperation) {
            this.queuedOperations.push(newOperation);
            this.handleOperationComplete(id, false);
          } else {
            this.handleOperationComplete(id, true);
          }
        }
      );

      /**
       * If the operation failed before, this adds a throttle proportional to number of failures.
       * Otherwise, it sets a timeout of 0 (right away)
       */
      setTimeout(
        () => newOperation.start(),
        newOperation.timesFailed * this.throttle
      );
      /**
       * If we have concurrency enabled this will take care of batching.
       */
      this.startNextOperation();
    }
  }

  /**
   *
   * @param id - The id of the completed operation.
   * @param final - If false, the operation will be retried.
   */
  private handleOperationComplete(id: number | string, final: boolean) {
    /** Only consider it completed if we're not gonna try again. */
    if (final) {
      this.completedOperations.push(this.currentOperations[id]);
    }
    delete this.currentOperations[id];
    this.numCurrentOperations -= 1;
    this.startNextOperation();
  }

  /** Emit an event */
  private emit(status: string) {
    this.events.emit(status, this.name);
  }

  /** Forward an Operation Emit */
  private emitOperation(status: string, operationId: string | number) {
    this.events.emit(status, operationId, this.name);
  }

  /** Exports this classful job to a JSON object */
  export() {
    return {
      name: this.name,
      operations: [...this.completedOperations, ...this.queuedOperations].map(
        operation => operation.export()
      )
    };
  }
}
