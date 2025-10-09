exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'DEPLOYMENT TEST SUCCESS',
      timestamp: new Date().toISOString(),
      buildId: 'BUILD_' + Date.now()
    })
  };
};
