const { Queue, Job } = require("./batcher");

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
      }, 2000);
    });
  },
  data: [1, 2, 3],
  dataToId: d => d,
  maxConcurrentOperations: 2,
  cooldown: 200
});

job.events.on("job-done", console.log);
job.events.on("operation-started", console.log);

q.queueJob(job);


