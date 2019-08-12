import fs, { exists } from "fs";
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
  /** An optional directory to persist completed jobs. */
  persistCompletedJobsToDir: undefined | string;
}

export class Queue {
  private queuedJobs: Job[];
  private completedJobs: Job[];
  currentJob: undefined | Job;
  events: EventEmitter;

  private jobIndex: { [key: string]: Job } = {};

  persistCompletedJobsToDir: undefined | string;

  constructor({ persistCompletedJobsToDir = undefined }: QueueParams) {
    this.queuedJobs = [];
    this.completedJobs = [];
    this.currentJob = undefined;

    this.persistCompletedJobsToDir = persistCompletedJobsToDir;
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

  /** Starts the next job if the queue is ready. */
  private startNextJob(): string | undefined {
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
  /** When a job is complete, moves it to the correct queue and starts next job. */
  private handleJobComplete(): void {
    this.completedJobs.push(this.currentJob as Job);
    this.currentJob = undefined;
    this.startNextJob();
  }

  /** Forwards all events from child jobs to the queue event emitter. */
  private async forwardJobEvents(job: Job) {
    const combinedEvents = { ...OperationEvents, ...JobEvents };
    for (let event in combinedEvents) {
      job.events.on(event, (...args) => {
        this.events.emit(event, ...args);
      });
    }
  }

  /**
   * Whether the queue has a specific job.
   * @param name - The name of the job to check for.
   * @param includeExported - If true, locally exported jobs will also be considered.
   */
  async hasJob(
    name: string,
    includePersisted: boolean = false
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.jobIndex[name]) {
        resolve(true);
      }
      if (includePersisted) {
        if (!this.persistCompletedJobsToDir) {
          reject(new Error("No export directory passed into queue."));
        }
        fs.access(`${this.persistCompletedJobsToDir}/${name}.json`, err => {
          resolve(!err);
        });
      } else {
        resolve(false);
      }
    });
  }

  /**
   * Get the names of all jobs.
   * @param includeExported - Whether to include locally exported jobs.
   */
  async getAllJobs(includePersisted: boolean = false): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (includePersisted) {
        if (!this.persistCompletedJobsToDir) {
          reject(new Error("No export directory passed into queue."));
        }
        fs.readdir(this.persistCompletedJobsToDir as string, (err, files) => {
          if (err) {
            reject(err);
          } else {
            resolve(
              Array.from(
                new Set([
                  ...Object.keys(this.jobIndex),
                  ...files.map(f => f.split(".")[0])
                ])
              )
            );
          }
        });
      } else {
        /** If we aren't including exported, we can just to the in memory jobs. */
        resolve(Object.keys(this.jobIndex));
      }
    });
  }

  /**
   * Get JSON export for a particular job. This assumes you've checked using hasJob().
   * @param name - The name of the job to get.
   * @param includeExported - Whether to include locally exported jobs.
   */
  async getJobExport(
    name: string,
    includePersisted: boolean = false
  ): Promise<object> {
    return new Promise(async (resolve, reject) => {
      if (!(await this.hasJob(name, includePersisted))) {
        reject(new Error("Job not found."));
      }
      if (this.jobIndex[name]) {
        return this.jobIndex[name].export();
      }
      if (includePersisted) {
        if (!this.persistCompletedJobsToDir) {
          throw new Error("No export directory passed into queue.");
        }
        fs.readFile(
          `${this.persistCompletedJobsToDir}/${name}.json`,
          (err, data) => {
            if (err) {
              reject(err);
            }
            try {
              resolve(JSON.parse(String(data)));
            } catch (e) {
              reject(e);
            }
          }
        );
      } else {
        reject();
      }
    });
  }

  /** Called to create an export directory if the option is provided. */
  private makeExportDirIfNeeded() {
    if (this.persistCompletedJobsToDir) {
      if (!fs.existsSync(this.persistCompletedJobsToDir)) {
        fs.mkdirSync(this.persistCompletedJobsToDir);
      }
    }
  }

  /** Export a completed job if the option is provided. */
  private exportJobIfNeeded(job: Job) {
    if (this.persistCompletedJobsToDir) {
      fs.writeFile(
        `${this.persistCompletedJobsToDir}/${job.name}.json`,
        JSON.stringify(job.export(), null, 2),
        () => {}
      );
    }
  }
}
