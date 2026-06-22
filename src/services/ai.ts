export interface GemmaResponse {
  speech?: string;
  emotion_state?: string;
  functionCall?: any;
  base64Audio?: string;
}

const safeParseResponse = async (response: Response, defaultError: string): Promise<any> => {
  const text = await response.text();
  if (!response.ok) {
    let errorMsg = defaultError;
    try {
      const parsed = JSON.parse(text);
      errorMsg = parsed.error || parsed.message || defaultError;
    } catch {
      if (text) {
        errorMsg = text;
      }
    }
    throw new Error(errorMsg);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${text || "empty body"}`);
  }
};

export const generateEnvironment = async (prompt: string): Promise<string> => {
  const response = await fetch('/api/generate-environment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });
  const data = await safeParseResponse(response, 'Failed to generate environment');
  return data.imageUrl;
};

export const generateGemmaResponse = async (chatHistory: string, newMessage: string, envContext: string = ""): Promise<GemmaResponse> => {
  const response = await fetch('/api/generate-gemma-response', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chatHistory, newMessage, envContext }),
  });
  return await safeParseResponse(response, 'Failed to generate response');
};

export const generateGemmaAudio = async (text: string): Promise<string> => {
  const response = await fetch('/api/generate-gemma-audio', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const data = await safeParseResponse(response, 'Failed to generate audio');
  return data.base64Audio;
};
