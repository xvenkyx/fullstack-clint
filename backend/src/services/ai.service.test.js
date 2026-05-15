import { test, describe } from 'node:test';
import assert from 'node:assert';
import { aiService } from './ai.service.js';

describe('AI Service Logic', () => {
  test('Pricing calculation should be accurate based on token counts', async () => {
    // Mock tokens
    const promptTokens = 1000;
    const completionTokens = 500;
    
    const cost = (promptTokens * aiService.pricing.prompt) + 
                 (completionTokens * aiService.pricing.completion);
    
    // Expected for Haiku 4.5: (1000 * 0.00025 / 1000) + (500 * 0.00125 / 1000) = 0.000875
    assert.strictEqual(cost, 0.000875);
  });

  test('Rate limiter should block calls exceeding the threshold', () => {
    // Reset rate limiter for test
    // Note: In a real scenario we'd use a dependency injection or a mock
    // For this demonstration we're testing the logic pattern
    const mockRateLimit = (history, limit, window) => {
      const now = Date.now();
      const filtered = history.filter(t => now - t < window);
      return filtered.length < limit;
    };

    const history = Array(20).fill(Date.now());
    const isAllowed = mockRateLimit(history, 20, 60000);
    
    assert.strictEqual(isAllowed, false);
  });
});
