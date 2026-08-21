import dotenv from 'dotenv';

dotenv.config();

export const LLM_CONFIG = {
  providers: {
    groq: {
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      apiKey: process.env.GROQ_API_KEY || '',
      rateLimits: {
        rpm: 30,
        rpd: 1000,
        tpm: 8000,
        tpd: 200000,
      },
    },
    gemini: {
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      apiKey: process.env.GEMINI_API_KEY || '',
      rateLimits: {
        rpm: 15,
        rpd: 500,
        tpm: 250000,
      },
    },
  },
  assignments: {
    orchestrator: 'groq' as const,
    research: 'groq' as const,
    accommodation: 'groq' as const,
    budget: 'gemini' as const,
    validator: 'gemini' as const,
  },
};
