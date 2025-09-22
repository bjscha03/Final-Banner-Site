// Test function to verify Google AI API key and available models
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    console.log('=== GOOGLE AI API TEST ===');
    console.log('GOOGLE_AI_API_KEY present:', process.env.GOOGLE_AI_API_KEY ? 'Yes (length: ' + process.env.GOOGLE_AI_API_KEY.length + ')' : 'No');
    console.log('GEMINI_API_KEY present:', process.env.GEMINI_API_KEY ? 'Yes (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'No');
    
    if (!process.env.GOOGLE_AI_API_KEY) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ 
          success: false, 
          error: "GOOGLE_AI_API_KEY not found",
          availableVars: Object.keys(process.env).filter(key => key.includes('API') || key.includes('KEY')).sort()
        })
      };
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    
    // Test simple text model first
    console.log('Testing Gemini text model...');
    const textModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const textResult = await textModel.generateContent('Say "API key working" if you can read this.');
    const textResponse = await textResult.response;
    console.log('Gemini text test successful:', textResponse.text());

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: true,
        message: "Google AI API key is working",
        keyLength: process.env.GOOGLE_AI_API_KEY.length,
        keyPrefix: process.env.GOOGLE_AI_API_KEY.substring(0, 10),
        textResponse: textResponse.text()
      })
    };

  } catch (error) {
    console.error('Google AI test error:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        keyFormat: process.env.GOOGLE_AI_API_KEY ? process.env.GOOGLE_AI_API_KEY.substring(0, 10) + '...' : 'No key'
      })
    };
  }
};
