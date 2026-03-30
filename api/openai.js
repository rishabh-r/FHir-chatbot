// Vercel serverless proxy — keeps Azure OpenAI key server-side
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const body = req.body;
  const isStream = body.stream === true;

  // Remove model from body — Azure uses deployment name in the URL
  const { model, ...azureBody } = body;

  const AZURE_ENDPOINT = "https://care-coordination-project.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2025-01-01-preview";

  let oaiRes;
  try {
    oaiRes = await fetch(AZURE_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": process.env.AZURE_OPENAI_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(azureBody)
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Azure OpenAI" });
    return;
  }

  if (isStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = oaiRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
  } else {
    const data = await oaiRes.json();
    res.status(oaiRes.status).json(data);
  }
};
