exports.handler = async (event) => {
  const envVars = Object.keys(process.env)
    .filter(key => key.includes('SUPABASE') || key.includes('DATABASE'))
    .reduce((obj, key) => {
      obj[key] = process.env[key]?.substring(0, 20) + '...';
      return obj;
    }, {});

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ envVars }, null, 2),
  };
};
