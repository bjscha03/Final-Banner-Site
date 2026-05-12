exports.handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const ratio = Number(body.aspectRatio || 1);
  const aspectRatio = Math.abs(ratio-1)<0.01 ? '1:1' : Math.abs(ratio-2)<0.05 ? '2:1' : ratio>1 ? '16:9' : '9:16';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ instances:[{ prompt: body.prompt }], parameters:{ sampleCount:1, aspectRatio } }) });
  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  return { statusCode: 200, body: JSON.stringify({ imageUrl: `data:image/png;base64,${b64}` }) };
};
