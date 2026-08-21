import dotenv from 'dotenv';

dotenv.config();

import { callLLM } from '../agents/llmClient.js';

async function main() {
  try {
    console.log('Testing Groq...');
    const groqResponse = await callLLM(
      [
        { role: 'system', content: 'You are a helpful assistant. Return only valid JSON with no markdown.' },
        { role: 'user', content: 'Return a JSON object with one key "hello" set to "world".' },
      ],
      { provider: 'groq' }
    );
    console.log('Groq raw:', groqResponse);
    console.log('Groq parsed:', JSON.parse(groqResponse));

    console.log('\nTesting Gemini...');
    const geminiResponse = await callLLM(
      [
        { role: 'system', content: 'You are a helpful assistant. Return only valid JSON with no markdown.' },
        { role: 'user', content: 'Return a JSON object with one key "test" set to "ok".' },
      ],
      { provider: 'gemini' }
    );
    console.log('Gemini raw:', geminiResponse);
    console.log('Gemini parsed:', JSON.parse(geminiResponse));

    process.exit(0);
  } catch (error) {
    console.error('LLM test failed:', error);
    process.exit(1);
  }
}

main();
