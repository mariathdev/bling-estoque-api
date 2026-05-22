export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.path} does not exist.` });
}

export function errorHandler(err, req, res, _next) {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error.' });
}
