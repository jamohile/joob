>**Note**: this package is stable, but documentation is a work in progress.

<img src="https://raw.githubusercontent.com/jamohile/joob/master/static/logo.png"/>

## What's Joob?
Joob is a package to run batch jobs. Say you have an app that lets a user request your server to:

- Process lots of files.
- Get data from a bunch of endpoints.
- Scrape a set of websites

Joob lets you add **jobs** (batches) which contain multiple **operations** (individual tasks). It will keep track of each job's status, and intelligently manage the operations in each one.

## Common Headaches that Joob handles

- Parallel, Sequential, or Anywhere in Between.
- Cooldown between operations.
- Handling errors without stopping the rest of the operations.

- Retrying failed operations while isolating them from other ongoing operations.

Joob provides a flexible and robust API to solve each of these headaches and others.

## Installation

Joob is extremely lightweight and contains no external dependencies.

```bash
npm install joob
```

If you use typescript, joob also has full typings.

## Usage

We'll demonstrate how to use Joob by making a simple script to scrape a bunch of URLs.

In your node app, import the following.

```javascript
const { Queue, Job, JobEvents } = require("joob");

//This is only for the example we're making.
const request = require("request");
```

Each batch of work we want to perform is called a **Job**. Multiple jobs are added to a **Queue**. If you only need to perform one type of job, a single queue should be enough.

```javascript
const queue = new Queue();
```

Now, the goal of our example app is to ping a bunch of websites.
Let's start by defining those sites. In a real app you'd probably accept these through an API, website, or command line tool, but we'll hardcode it to demonstrate.

```javascript
const SITES = [
  "example.org",
  "example.net",
  "example.io",
  "example.com",
  "example.co"
];
```

Note that some of these exist, others don't. We'll use this to demonstrate Joob's error handling.

For any given site (an **operation**) we need to give Joob a function that takes in the site, and returns a promise with success or failure.

```javascript
function visitSite(site) {
  return new Promise((resolve, reject) => {
    request(site, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
}
```

Now, let's get to actually creating a job.

```javascript
// Somewhere else, such as in a route handler
const job = new Job("My First Job", visitSite, sites);

queue.queueJob(job);

// At any time while the job is pending, running, or completed
const data = job.export();
```

Above, we passed in:

- A name for our job.
- A function mapping each operation of our job to a promise.
- An array of operations for our job.

With just that, joob will start running the job as soon as existing jobs are complete.

### But how do I know when it's done?

Joob has a few ways to track events like this. No matter which of these methods you use, you need to add your listeners **before** queueing the job.

#### Promises

This only tell you when a job is finished.

```javascript
    await queue.queueJob(...)
    OR
    queue.queueJob(...)
        .then(name => {

        });
```

#### Callbacks

These are a bit more flexible, and tell you when a job starts and finishes.

```javascript
    const job = new Job(...);

    job.onStart(handler);
    job.onComplete(handler);

```

#### Event Listeners

Joob supports the javascript Event API, which provides the most detailed events.

```
    queue.events.on([EVENT], (args) => {

    })
```

The following events are supported. You can use them as strings, or by importing `JobEvents` and `OperationEvents` respectively.

##### JOB_STARTED

Emitted when a job starts running.

##### JOB_COMPLETED

Emmitted when all operations within a job are done running.

##### OPERATION_STARTED

Emitted when an operation begins running.

##### OPERATION_COMPLETED

Emitted (if) an operation completes successfully.

##### OPERATION_FAILED

Emitted if an operation throws an error, it may be retried.

## Advanced Use

### Options
When creating a job, we passed in something like this.

```javascript
const job = new Job(name, dataToPromise, dataArray);
```

We can also pass in a fourth parameter, an object with any of the following options.

```javascript
const job = new Job(
    name,
    dataToPromise,
    dataArray,
    {
      dataToId = (data, index) => d.id,
      maxConcurrentOperations = 1,
      maxFailuresPerOperation = 1,
      cooldown = 0,
      throttle = 500
    }
);
```
#### dataToId
A function that returns a unique for each element of data. This can be anything, but no two operations in the same job should have the same id. 
##### Possible IDs
* Database key
* File name
* Array index

#### maxConcurrentOperations
The maximum operations we can run in parallel.

#### maxFailuresPerOperation
The maximum number of times an operation can fail and still be retried.

#### cooldown
A delay before each operation is started.

#### throttle
A delay imposed only on operations that are being retried after failure.

