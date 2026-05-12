exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const payload = JSON.parse(event.body || '{}');
  return { statusCode: 200, body: JSON.stringify({ ok: true, savedDesign: payload, savedAt: new Date().toISOString() }) };
};
