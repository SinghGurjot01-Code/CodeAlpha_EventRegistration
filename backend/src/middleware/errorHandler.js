function notFound(req, res) {
  res.status(404).json({ error: 'Endpoint not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large.' });
  }
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error('[EventHub Error]', err);
  }
  const body = { error: status < 500 ? err.message : 'Something went wrong. Please try again.' };
  if (err.registration) body.registration = err.registration;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
