import { Job, Events as JobEvents } from "./Job";
import {Events as OperationEvents} from "./Operation";
import { EventEmitter } from "events";
/**
 * The highest level of job-containerization for a process.
 * A queue maintains a set of jobs, keeping track of each of their status.
 * TODO: Load balance jobs.
 *
 * Seperate queues are independent of eachother.
 * For now, jobs are execute synchronously.
 */

export class Queue {
  private queuedJobs: Job[];
  private completedJobs: Job[];
  currentJob: undefined | Job;
  events: EventEmitter;

  private jobIndex: {[key: string]: Job} = {};

  constructor() {
    this.queuedJobs = [];
    this.completedJobs = [];
    this.currentJob = undefined;

    this.events = new EventEmitter();
  }

  /** Add a new job to the queue. */
  queueJob(job: Job): Promise<string> {
    this.queuedJobs.push(job);
    this.jobIndex[job.name] = job;
    // This will check to make sure nothing is running right now.
    this.startNextJob();
    return new Promise((resolve, reject) => {
      job.onComplete(resolve);
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

  forwardJobEvents(job: Job){
    const combinedEvents = {...OperationEvents, ...JobEvents}
    for(let event in combinedEvents){
      job.events.on(event, (...args) => {
        this.events.emit(event, ...args)
      })
    }
  }
}
