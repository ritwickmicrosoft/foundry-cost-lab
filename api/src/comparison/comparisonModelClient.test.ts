import type { AccessToken, GetTokenOptions, TokenCredential } from '@azure/identity'
import { describe, expect, it, vi } from 'vitest'
import { AzureOpenAIComparisonClient } from './comparisonModelClient.js'

const credential: TokenCredential = {
  async getToken(_scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken> {
    return { token: 'managed-identity-token', expiresOnTimestamp: Date.now() + 60_000 }
  },
}

const request = {
  buyerLens: 'executive' as const,
  competitorLens: 'aws' as const,
  facts: Array.from({ length: 6 }, (_, index) => ({
    id: `fact:${index}`,
    category: index % 2 ? 'coverage' as const : 'economics' as const,
    scenarioKeys: ['A'] as const,
    text: `Scenario A fact ${index}.`,
  })),
}

describe('Azure OpenAI comparison client', () => {
  it('uses the keyless v1 GPT-5 request contract and bounded structured output', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: { text: 'Grounded summary.', factIds: ['fact:0'] },
        microsoftWinThemes: [{ text: 'Conditional theme.', factIds: ['fact:1'] }],
        competitiveExposure: [{ text: 'Evidence is incomplete.', factIds: ['fact:2'] }],
        proofGaps: [{ text: 'Validate implementation effort.', factIds: [] }],
        discoveryQuestions: [
          { text: 'Where does governed data reside?', factIds: [] },
          { text: 'Which outcome defines success?', factIds: [] },
        ],
      }) } }],
      usage: { prompt_tokens: 300, completion_tokens: 120 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const client = new AzureOpenAIComparisonClient(
      'https://comparison.openai.azure.com/',
      'comparison-gpt-5-4-nano',
      credential,
      fetcher,
    )
    const result = await client.explain(request)

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(url).toBe('https://comparison.openai.azure.com/openai/v1/chat/completions')
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer managed-identity-token' })
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'comparison-gpt-5-4-nano',
      reasoning_effort: 'none',
      max_completion_tokens: 1_000,
    })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('max_tokens')
    expect(JSON.stringify(body)).toContain('Do not mention buyer lenses, competitor lenses, or internal sales terminology.')
    expect(JSON.stringify(body)).toContain('Always finish complete sentences.')
    expect(result).toMatchObject({ promptTokens: 300, completionTokens: 120 })
  })

  it('rejects a response truncated at the completion-token cap', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: '{"summary":' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
    const client = new AzureOpenAIComparisonClient(
      'https://comparison.openai.azure.com/',
      'comparison-gpt-5-4-nano',
      credential,
      fetcher,
    )

    await expect(client.explain(request)).rejects.toMatchObject({ code: 'model-output-truncated' })
  })
})