module.exports = {
  "rethinkdb": {
    "host": process.env.RDB_HOST,
    "port": process.env.RDB_PORT,
    "db": "prosync"
  },
  "qOptions": {
    "name": "product_sync_worker",
    "masterInterval": 60000,
    "changeFeed": true,
    "concurrency": 1,
    "removeFinishedJobs": false
  },
  "ProductSyncWorker": "product_sync_worker",
  // "flowz_table": "flowzinstance",
  // "scheduler_table": "scheduler",
  // "syetem_logs_table": "flowz_system_logs",
  "qJobTimeout": 3600000,
  "qJobRetryMax": 0,
  'mediaUrl': 'http://www.flowzcluster.tk/images/'
}