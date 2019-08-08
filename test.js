const { Queue, Job, JobEvents, OperationEvents } = require("./dist");

const q = new Queue();

const job = new Job({
  name: "My Job",
  resolver: d => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
          if(d !== 3){
              resolve("Yay: " + d);
          }else{
              reject("NOO: " + d)
          }
      }, 100);
    });
  },
  data: [1, 2, 3],
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


