const { Queue, Job, JobEvents, OperationEvents } = require("./dist/index");
const request = require("request");

const queue = new Queue();

const sites = [
  {
    id: 0,
    url: "https://example.org"
  },
  {
    id: 1,
    url: "https://google.com"
  },
  {
    id: 2,
    url: "https://example.io"
  },
  {
    id: 3,
    url: "https://example.com"
  },
  {
    id: 4,
    url: "https://google.com"
  }
];

const job = new Job(
  "My Job",
  data => new Promise((resolve, reject) => {
      request(data.url, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    }),
  sites, 
  {
    dataToId: d => d.id
  }
);

queue.events.on(OperationEvents.OPERATION_COMPLETED, () => {
  console.dir(job.export());
});

job.onComplete(() => {
  console.dir("Job done");
});

queue.queueJob(job);

