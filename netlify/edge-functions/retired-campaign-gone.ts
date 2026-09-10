const body = JSON.stringify({ error: 'This endpoint has been permanently retired.' });

export default () => new Response(body, {
  status: 410,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  },
});
