const SYSTEM_PROMPT = `You are Secunova's AI Security Copilot. You help security teams understand alerts,
explain attacks in plain language, and recommend concrete remediation steps. Be concise, specific,
and always structure your answer as: 1) what happened, 2) the underlying vulnerability, 3) the fix.
Never invent specific CVEs or log lines that were not provided to you in context.`;

async function askCopilot({ question, context }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return mockResponse(question);
  }

  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Context from the environment:\n${JSON.stringify(context || {}, null, 2)}\n\nQuestion: ${question}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return {
    answer: data.choices?.[0]?.message?.content ?? '',
    source: 'openai',
  };
}

// Used when no OPENAI_API_KEY is configured, so the API is still testable end-to-end locally.
function mockResponse(question) {
  return {
    answer:
      `[Mock response — set OPENAI_API_KEY to get real answers]\n\n` +
      `Regarding "${question}": recent logs show a spike in failed SSH logins from a small ` +
      `set of IP ranges, consistent with an automated brute-force attempt.\n\n` +
      `Vulnerability: port 22 is exposed with no rate limiting.\n` +
      `Fix: restrict inbound SSH to known IP ranges and enable fail2ban-style throttling.`,
    source: 'mock',
  };
}

module.exports = { askCopilot };
