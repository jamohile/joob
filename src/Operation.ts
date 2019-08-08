import EventEmitter from "events";
import { STATUSES } from "./index";
import { DataToPromise } from "./types";

export const Events = {
  OPERATION_STARTED: "OPERATION_STARTED",
  OPERATION_COMPLETED: "OPERATION_COMPLETED",
  OPERATION_FAILED: "OPERATION_FAILED"
};

/**
 * A single operation request.
 * Some asynchronous task representing one unit of work in your batch.
 */

export class Operation {
  /** A unique identifier for the operation */

  id: number | string;
  /** The raw data used by this operation to make a promise request */
  data: any;
  /** The status of this operation. */
  status: string;
  /** Used to emit events based on progress. */
  events: EventEmitter;
  /** The result of execution. This can be either the error data or the final result. */
  result: any;

  timesFailed: number = 0;

  /** An internal method used to actually create the request promise. */
  private execute: () => Promise<any>;

  /**
   *
   * @param id - The unique identifier for this operation.
   * @param resolver - A function to map data to an async promise.
   * @param data - Some arbitrary piece of data used by your resolver to create a promise.
   */
  constructor(id: string | number, resolver: DataToPromise, data: any) {
    this.id = id;
    this.data = data;
    this.status = STATUSES.PENDING;
    this.events = new EventEmitter();
    this.result = undefined;

    this.execute = () => resolver(data);
  }

  /**
   * Start execution for this operation.
   */
  start() {
    /** Prevents duplicate execution. */
    if (this.status === STATUSES.STARTED) {
      return;
    }
    this.status = STATUSES.STARTED;
    this.emit(Events.OPERATION_STARTED);

    this.execute()
      .then(result => {
        this.status = STATUSES.COMPLETED;
        this.result = result;
        this.emit(Events.OPERATION_COMPLETED);
      })
      .catch(error => {
        this.status = STATUSES.FAILED;
        this.result = error;
        this.timesFailed += 1;
        this.emit(Events.OPERATION_FAILED);
        this.emit(Events.OPERATION_FAILED);
      });
  }

  /** A utility to emit events. */
  private emit(status: string) {
    this.events.emit(status, this.id);
  }

  /** Exports this class object to a JSON object */
  export() {
    const { id, data, status, result } = this;
    return {
      id,
      data,
      status,
      result
    };
  }
}
