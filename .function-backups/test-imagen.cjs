// Test Imagen models specifically
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, error: "No API key" })
      };
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    
    // Test different Imagen model names
    const imageModels = [
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-generate-001', 
      'imagen-3.0-fast-generate-001',
      'imagen-3.0-generate-001',
      'imagen-2.0-generate-001',
      'imagen-generate-001',
      'imagen'
    ];

    const results = {};
    
    for (const modelName of imageModels) {
      try {
        console.log(`Testing ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'red circle' }] }],
          generationConfig: {
            numberOfImages: 1,
            aspectRatio: '1:1'
          }
        });
        
        const response = await result.response;
        results[modelName] = {
          success: true,
          candidates: response.candidates ? response.candidates.length : 0,
          hasContent: response.candidates && response.candidates[0] && response.candidates[0].content
        };
        
      } catch (error) {
        results[modelName] = {
          success: false,
          error: error.message
        };
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        results: results,
        workingModels: Object.keys(results).filter(model => results[model].success)
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
