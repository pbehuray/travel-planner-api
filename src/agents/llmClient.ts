import dotenv from 'dotenv';

dotenv.config();

import { LLM_CONFIG } from './config.js';

export type Provider = 'groq' | 'gemini';

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlmOptions {
  provider: Provider;
  temperature?: number;
  maxTokens?: number;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const inMemoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function buildCacheKey(provider: string, model: string, messages: LlmMessage[]): string {
  const text = messages.map((m) => `${m.role}:${m.content}`).join('|');
  return `${provider}:${model}:${text}`;
}

function getCache(key: string): string | undefined {
  const entry = inMemoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    inMemoryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache(key: string, value: string): void {
  inMemoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(model: string, apiKey: string, messages: LlmMessage[], maxTokens?: number): Promise<string> {
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens || 4096,
    }),
  });

  if (response.status === 429) {
    throw new Error(`Rate limited: ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '';
}

async function callGemini(model: string, apiKey: string, messages: LlmMessage[], maxTokens?: number): Promise<string> {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const prompt = messages.map((m) => m.content).join('\n\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens || 4096 },
    }),
  });

  if (response.status === 429) {
    throw new Error(`Rate limited: ${response.status}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    if (lines.length > 2 && (lines[0].startsWith('```json') || lines[0].startsWith('```'))) {
      lines.shift();
      if (lines[lines.length - 1].startsWith('```')) {
        lines.pop();
      }
      return lines.join('\n').trim();
    }
  }
  return trimmed;
}

export async function callLLM(messages: LlmMessage[], options: LlmOptions): Promise<string> {
  const config = LLM_CONFIG.providers[options.provider];
  const model = config.model;
  const apiKey = config.apiKey;
  const cacheKey = buildCacheKey(options.provider, model, messages);

  const cached = getCache(cacheKey);
  if (cached) return cached;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = options.provider === 'groq'
        ? await callGroq(model, apiKey, messages, options.maxTokens)
        : await callGemini(model, apiKey, messages, options.maxTokens);
      const cleaned = stripMarkdownFences(raw);
      setCache(cacheKey, cleaned);
      return cleaned;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes('Rate limited') && attempt === 0) {
        const now = new Date();
        const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        const wait = Math.max(msToNextMinute, 2000);
        console.log(`Rate limited on ${options.provider}, waiting ${Math.round(wait / 1000)}s for per-minute window to reset...`);
        await sleep(wait);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('LLM call failed');
}
