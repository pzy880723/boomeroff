export interface DeepSeekJsonRequest {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
}

export class DeepSeekRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DeepSeekRequestError';
    this.status = status;
  }
}

function extractJsonObject(value: unknown): Record<string, unknown> {
  let raw = String(value || '').trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) raw = match[0];
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DeepSeek 返回的不是 JSON object');
  }
  return parsed as Record<string, unknown>;
}

export async function requestDeepSeekJson(request: DeepSeekJsonRequest): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || 'deepseek-v4-pro',
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      temperature: request.temperature ?? 0.85,
      stream: false,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new DeepSeekRequestError(`DeepSeek ${response.status}: ${body.slice(0, 300)}`, response.status);
  }
  const data = await response.json();
  return extractJsonObject(data?.choices?.[0]?.message?.content);
}
