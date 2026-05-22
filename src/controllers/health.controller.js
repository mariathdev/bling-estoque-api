export function healthCheck(req, res) {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'bling-estoque-api',
  });
}
