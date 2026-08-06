const response = Object.freeze({
  statusCode: 410,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  },
  body: JSON.stringify({ error: 'This endpoint has been permanently retired.' }),
});

export const handler = async () => response;
