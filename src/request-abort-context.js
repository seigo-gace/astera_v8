'use strict';

function createRequestAbortContext(req, res) {
  const controller = new AbortController();
  let completed = false;
  const abort = () => {
    if (!completed && !controller.signal.aborted) controller.abort();
  };
  const onResponseClose = () => {
    if (!res.writableEnded) abort();
  };
  const finish = () => { completed = true; };
  req.once('aborted', abort);
  res.once('finish', finish);
  res.once('close', onResponseClose);
  return {
    signal: controller.signal,
    dispose() {
      completed = true;
      req.removeListener('aborted', abort);
      res.removeListener('finish', finish);
      res.removeListener('close', onResponseClose);
    }
  };
}

module.exports = { createRequestAbortContext };
