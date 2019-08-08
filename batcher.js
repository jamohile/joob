/**
 * High Level Plan:
 * - Allow creation of jobs.
 * -- Each job will have a function that maps some data to a promise, and an array of data.
 * --- A job maintains a data object. With status and results for all operations.
 * --- A job consists of many Operations.
 * ---- Operations have multiple statuses: PENDING, STARTED, DONE, FAILED.
 * ---- After each operation is complete, will update a data object on the job.
 */

/**
 * Queue Object
 * Contains multiple jobs.
 * Has a "current" job.
 * Jobs can be added by queue.add().
 * If no queue is "current", adding will also start.
 * Once a job ends, the next one will start.
 *
 * Job Object
 * {
 *     name: "",
 *     dateStarted: Date,
 *     status: PENDING | STARTED | DONE <-- may include some failed operations.
 *     resolver: The function to transform data to an operation promise.
 *     operations: {id to Operation Object},
 *     events() an event emitter.
 * }
 *
 * Operation Object
 * {
 *     id,
 *     data: Data used to create the promise.
 *     status: PENDING | STARTED | DONE | FAILED
 *     result: The result of the job resolver, or, the error.
 * }
 */

/*
 * Planned API
 * const job =  new Job(name, resolver, data)
 * const events = job.events;
 * events.on("operation-started", "operation-done", "operation-failed", "job-done")...
 */

/**
 * Queueing Process
 * Once a job is reached:
 * It will either be done synchronous async (batch size, cooldown).
 * When done, if there are remaining operations in the job, they'll be done. Otherwise the next job will be called.
 */

const EventEmitter = require("events");

const STATUSES = {
  PENDING: "PENDING",
  STARTED: "STARTED",
  DONE: "DONE",
  FAILED: "FAILED"
};

class Queue {
  constructor() {
    this.queuedJobs = [];
    this.completedJobs = [];
    this.currentJob = undefined;
  }

  queueJob(job) {
    this.queuedJobs.push(job);
    // This will check to make sure nothing is running right now.
    this.startNextJob();
  }

  startNextJob() {
    if (!this.currentJob && this.queuedJobs.length > 0) {
      const currentJob = this.queuedJobs.shift();
      this.currentJob = currentJob;

      currentJob.events.on("job-started", name => {
        console.log(name);
      });

      currentJob.start();
    }
  }
}

exports.Queue = Queue;

class Job {
  constructor({
    name,
    resolver,
    data,
    dataToId = d => d.id,
    maxConcurrentOperations = 1,
    cooldown = 0
  }) {
    this.name = name;
    this.resolver = resolver;
    this.data = data;

    this.currentOperation = undefined;

    /* We need an object and a counter because
     *  We don't know what order operations will complete in.
     */
    this.currentOperations = {};
    this.numCurrentOperations = 0;
    this.maxConcurrentOperations = maxConcurrentOperations;

    this.cooldown = cooldown;

    this.status = STATUSES.PENDING;

    this.operationIndex = {};

    this.queuedOperations = data.map(d => {
      const id = dataToId(d);
      const operation = new Operation(dataToId(d), resolver, d);
      this.operationIndex[id] = operation;
      return operation;
    });
    this.completedOperations = [];

    this.events = new EventEmitter();
  }

  start() {
    this.status = STATUSES.STARTED;
    this.events.emit("job-started", this.name);
    this.startNextOperation();
  }
  startNextOperation(cooled = false) {
    if (this.cooldown && !cooled) {
      return setTimeout(() => this.startNextOperation(true), this.cooldown);
    }

    if (
      this.numCurrentOperations >= this.maxConcurrentOperations &&
      this.queuedOperations.length
    ) {
      return;
    }
    if (this.numCurrentOperations < this.maxConcurrentOperations) {
      if (
        this.numCurrentOperations === 0 &&
        this.queuedOperations.length === 0
      ) {
        this.status = STATUSES.DONE;
        this.events.emit("job-done", this.name);
        return;
      }
      if (this.queuedOperations.length > 0) {
        const newOperation = this.queuedOperations.shift();
        this.currentOperations[newOperation.id] = newOperation;
        this.numCurrentOperations += 1;

        newOperation.events.on("operation-started", id => {
          this.events.emit("operation-started", id);
        });
        newOperation.events.on("operation-done", id => {
          this.events.emit("operation-done", id);
          this.handleOperationComplete(id);
        });
        newOperation.events.on("operation-failed", id => {
          this.events.emit("operation-failed", id);
          this.handleOperationComplete(id);
        });

        newOperation.start();
        // Called just in case we have concurrency enabled.
        this.startNextOperation();
      }
    }
  }

  handleOperationComplete(id) {
    this.completedOperations.push(this.currentOperations[id]);
    delete this.currentOperations[id];
    this.numCurrentOperations -= 1;
    this.startNextOperation();
  }
}

class Operation {
  constructor(id, resolver, data) {
    this.id = id;
    this.data = data;
    this.status = STATUSES.PENDING;
    this.events = new EventEmitter();
    this.result = undefined;

    this.execute = () => resolver(data);
  }

  start() {
    this.status = STATUSES.STARTED;
    this.events.emit("operation-started", this.id);

    this.execute()
      .then(result => {
        this.status = STATUSES.DONE;
        this.result = result;
        this.events.emit("operation-done", this.id);
      })
      .catch(error => {
        this.status = STATUSES.FAILED;
        this.result = error;
        this.events.emit("operation-failed", this.id);
      });
  }
}

exports.Job = Job;
