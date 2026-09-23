function createContinuation(provider, prepare = async chain => chain) {
  const jobs = new Map(), queue = [];
  let visible = true, disposed = false;
  const cancelled = () => Object.assign(new Error('CANCELLED'), { cancelled: true });
  function trim() {
    const completed = Array.from(jobs.values()).filter(job => job.state === 'done');
    while (completed.length > 24) jobs.delete(completed.shift().key);
  }
  function cancel(job) {
    if (job.state === 'done' || job.state === 'cancelled') return;
    job.state = 'cancelled'; if (job.request?.cancel) job.request.cancel();
    const queued = queue.indexOf(job); if (queued >= 0) queue.splice(queued, 1);
    jobs.delete(job.key); job.reject(cancelled());
  }
  function pump() {
    if (!visible || disposed) return;
    const active = Array.from(jobs.values()).filter(job => job.state === 'running');
    if (active.length >= 2) return;
    const job = queue.filter(item => item.state === 'queued').sort((a, b) => Number(b.foreground) - Number(a.foreground))
      .find(item => !active.some(running => running.foreground === item.foreground));
    if (!job) return;
    queue.splice(queue.indexOf(job), 1); job.state = 'running';
    try { job.request = provider[job.method](job.input, { onEvent: event => {
      if (job.state !== 'running') return;
      if (event.type === 'head') { job.head = event.chain; deliverHead(job); }
    } }); }
    catch (error) { jobs.delete(job.key); job.state = 'failed'; job.reject(error); pump(); return; }
    Promise.resolve(job.request).then(chain => {
      if (job.state !== 'running') throw cancelled();
      return prepare(chain);
    }).then(chain => {
      if (job.state !== 'running') return;
      job.value = chain; job.state = 'done'; job.resolve(chain); trim();
    }, error => {
      if (job.state !== 'running') return;
      job.state = 'failed'; jobs.delete(job.key); job.reject(error);
    }).finally(pump);
    pump();
  }
  function deliverHead(job) {
    if (job.state !== 'running' || !job.foreground || !job.head || !job.onHead || job.headDelivered) return;
    job.headDelivered = true;
    // A foreground head can prepare its glyphs beside its one content request.
    // Unrelated background work yields this second network slot.
    for (const other of jobs.values()) if (other !== job && other.state !== 'done' && !other.foreground) cancel(other);
    Promise.resolve(prepare(job.head)).then(chain => {
      if (job.state === 'running' && !disposed) job.onHead(chain);
    }).catch(() => {});
  }
  function run(method, input, foreground = true, hooks = {}) {
    if (disposed || !visible) return Promise.reject(cancelled());
    const key = method + ':' + JSON.stringify(input);
    const existing = jobs.get(key);
    if (foreground) for (const other of jobs.values()) if (other !== existing && other.foreground && other.state !== 'done') cancel(other);
    if (existing) {
      if (existing.state === 'done') return Promise.resolve(prepare(existing.value));
      if (foreground) { existing.foreground = true; existing.onHead = hooks.onHead; deliverHead(existing); }
      pump(); return existing.promise;
    }
    const job = { key, method, input, foreground, onHead: hooks.onHead, state: 'queued' };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    job.promise.cancel = () => { cancel(job); pump(); };
    jobs.set(key, job); queue.push(job); pump(); return job.promise;
  }
  function background(method, input) { const promise = run(method, input, false); promise.catch(() => {}); return promise; }
  return {
    open: (seed, hooks) => run('open', seed, true, hooks), branch: (input, hooks) => run('branch', input, true, hooks), next: input => run('next', input),
    resume: input => run('resume', input),
    prefetch: (chain, active) => {
      if (!visible || disposed) return;
      for (const job of jobs.values()) if (!job.foreground && job.state !== 'done' &&
        (job.input.chainId !== chain.chainId || (job.method === 'branch' && job.input.fromFrameId !== active?.id))) cancel(job);
      if (chain.cursor && !chain.exhausted) background('next', { chainId: chain.chainId, cursor: chain.cursor });
      for (const anchor of (active?.anchors || []).slice(0, 2)) background('branch', { chainId: chain.chainId, fromFrameId: active.id, anchorId: anchor.id });
    },
    setVisible: value => { visible = value; if (!value) { for (const job of jobs.values()) if (job.state !== 'done') cancel(job); } pump(); },
    cancelUnrelated: chainId => { for (const job of jobs.values()) if (job.state !== 'done' && !job.foreground && job.input?.chainId !== chainId) cancel(job); },
    dispose: () => { disposed = true; for (const job of jobs.values()) if (job.state !== 'done') cancel(job); queue.length = 0; jobs.clear(); },
    stats: () => ({ active: Array.from(jobs.values()).filter(job => job.state === 'running').length, cached: Array.from(jobs.values()).filter(job => job.state === 'done').length,
      queued: queue.length, visible, disposed }),
  };
}

module.exports = { createContinuation };
