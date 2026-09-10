export async function saveAIDesign(state: any, adminId: string) {
  return fetch('/.netlify/functions/save-ai-design', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...state, createdBy: adminId, source: 'ai-designer', productType: 'banner' }),
  });
}
