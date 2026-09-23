// All content and font traffic shares one native two-request budget.
function createRequestBudget(api, limit = 2) {
  const queue = [], active = new Set();
  let paused = false;
  function pump() {
    if (paused) return;
    while (active.size < limit && queue.length) {
      const job = queue.shift();
      if (job.cancelled) continue;
      active.add(job);
      const finish = () => { active.delete(job); pump(); };
      try {
        job.task = api.request({ ...job.options,
          success: result => { finish(); job.options.success?.(result); },
          fail: error => { finish(); job.options.fail?.(error); },
        });
        if (job.chunk && job.task.onChunkReceived) job.task.onChunkReceived(job.chunk);
      } catch (error) { finish(); job.options.fail?.(error); }
    }
  }
  function cancel(job) {
    if (job.cancelled) return;
    job.cancelled = true;
    if (job.task) job.task.abort();
    else { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); job.options.fail?.({ errMsg: 'request:fail abort' }); }
  }
  const scoped = Object.create(api);
  scoped.abortPending = () => { paused = true; for (const job of [...queue, ...active]) cancel(job); };
  scoped.resumeRequests = () => { paused = false; pump(); };
  scoped.request = options => {
    if (paused) { options.fail?.({ errMsg: 'request:fail background' }); return { abort() {}, onChunkReceived() {} }; }
    const job = { options, cancelled: false };
    queue.push(job); pump();
    return { abort() {
      cancel(job);
    }, onChunkReceived(fn) { job.chunk = fn; if (job.task?.onChunkReceived) job.task.onChunkReceived(fn); } };
  };
  return scoped;
}
module.exports = { createRequestBudget };
