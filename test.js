const { Queue, Job, JobEvents, OperationEvents } = require("./dist");
const q = new Queue({
  exportCompletedJobsDir: "my-logs"
});

const data = [1, 2, 3];

function myFunction(data) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (data !== 3) {
        resolve("Yoo: " + data);
      } else {
        reject("Noo: " + data);
      }
    }, 1000);
  });
}

const job = new Job("My Job", myFunction, data, {
  dataToId: d => d,
  maxConcurrentOperations: 2,
  maxFailuresPerOperation: 2,
  cooldown: 200,
  throttle: 100
});

q.events.on(JobEvents.JOB_COMPLETED, name => {
  console.log(`${name} complete.`);
  console.log(job.export());
});
q.events.on(OperationEvents.OPERATION_STARTED, (oID, jName) => {
  console.log(`Started ${oID} for ${jName}`);
  console.log(job.export());
});

q.queueJob(job);
