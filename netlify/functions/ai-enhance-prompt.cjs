exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const body = JSON.parse(event.body || '{}');
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'Missing GOOGLE_GENAI_API_KEY' }) };
  const prompt = `Enhance this into a production print-ready commercial banner prompt for ${body.width}x${body.height}ft (${(body.width/body.height).toFixed(3)}:1). Keep large readable text zones, no fake contact details, no copyrighted/trademarked content unless user-uploaded. Input: ${body.prompt}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ contents:[{parts:[{text:prompt}]}] }) });
  const data = await res.json();
  const enhancedPrompt = data?.candidates?.[0]?.content?.parts?.[0]?.text || body.prompt;
  return { statusCode: 200, body: JSON.stringify({ enhancedPrompt }) };
};
