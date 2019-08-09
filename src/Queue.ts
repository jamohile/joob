import fs from "fs";
import { Job, Events as JobEvents } from "./Job";
import { Events as OperationEvents } from "./Operation";
import { EventEmitter } from "events";
/**
 * The highest level of job-containerization for a process.
 * A queue maintains a set of jobs, keeping track of each of their status.
 * TODO: Load balance jobs.
 *
 * Seperate queues are independent of eachother.
 * For now, jobs are execute synchronously.
 */

export interface QueueParams {
  /** An optional directory to output completed jobs. */
  exportCompletedJobsDir: undefined | string;
}

export class Queue {
  private queuedJobs: Job[];
  private completedJobs: Job[];
  currentJob: undefined | Job;
  events: EventEmitter;

  private jobIndex: { [key: string]: Job } = {};

  exportCompletedJobsDir: undefined | string;

  constructor({ exportCompletedJobsDir = undefined }: QueueParams) {
    this.queuedJobs = [];
    this.completedJobs = [];
    this.currentJob = undefined;

    this.exportCompletedJobsDir = exportCompletedJobsDir;
    this.makeExportDirIfNeeded();

    this.events = new EventEmitter();
  }

  /** Add a new job to the queue. */
  queueJob(job: Job): Promise<string> {
    this.queuedJobs.push(job);
    this.jobIndex[job.name] = job;
    // This will check to make sure nothing is running right now.
    this.startNextJob();
    return new Promise((resolve, reject) => {
      job.onComplete((...args) => {
        // Respond to listeners.
        resolve(...args);

        this.exportJobIfNeeded(job);
      });
    });
  }

  /** Whether a job is currently executing. */
  isRunning() {
    return !!this.currentJob;
  }

  /** Whether there are jobs waiting to be run. */
  isPending() {
    return this.queuedJobs.length > 0;
  }

  startNextJob(): string | undefined {
    if (!this.isRunning() && this.isPending()) {
      const currentJob = this.queuedJobs.shift() as Job;
      this.currentJob = currentJob;

      currentJob.events.on(JobEvents.JOB_COMPLETED, name => {
        this.handleJobComplete();
      });

      /** SET UP EVENT FORWARDING */
      this.forwardJobEvents(currentJob);

      currentJob.start();
      return currentJob.name;
    }
    return undefined;
  }

  handleJobComplete(): void {
    this.completedJobs.push(this.currentJob as Job);
    this.currentJob = undefined;
    this.startNextJob();
  }

  forwardJobEvents(job: Job) {
    const combinedEvents = { ...OperationEvents, ...JobEvents };
    for (let event in combinedEvents) {
      job.events.on(event, (...args) => {
        this.events.emit(event, ...args);
      });
    }
  }

  makeExportDirIfNeeded() {
    if (this.exportCompletedJobsDir) {
      if (!fs.existsSync(this.exportCompletedJobsDir)) {
        fs.mkdirSync(this.exportCompletedJobsDir);
      }
    }
  }

  exportJobIfNeeded(job: Job) {
    if (this.exportCompletedJobsDir) {
      fs.writeFile(
        `${this.exportCompletedJobsDir}/${job.name}.json`,
        JSON.stringify(job.export(), null, 2),
        () => {}
      );
    }
  }
}
