// Claude via Anthropic's official TypeScript SDK, called straight from the browser with the
// user's own API key. The key stays on this device (localStorage) and never reaches our API.
import type Anthropic from '@anthropic-ai/sdk';

const KEY = 'tt-anthropic-key';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

export const getClaudeKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setClaudeKey = (k: string) => { try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); } catch { /* ignore */ } };

// Loaded on first use so the SDK isn't part of the main bundle.
async function sdk() { return (await import('@anthropic-ai/sdk')).default; }
async function client(apiKey: string) {
  const Client = await sdk();
  // Browser use is intentional: it's the user's own key, used only by the user.
  return new Client({ apiKey, dangerouslyAllowBrowser: true });
}

export async function listClaudeModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  const c = await client(apiKey);
  const out: { id: string; name: string }[] = [];
  for await (const m of c.models.list()) out.push({ id: m.id, name: m.display_name });
  return out;
}

export async function claudeReview(apiKey: string, model: string, system: string, prompt: string): Promise<string> {
  const c = await client(apiKey);
  // Opus 5 / Fable 5.1 can decline a request; the server-side fallback retries it on another model.
  const fallback = model === 'claude-opus-5' || model === 'claude-fable-5-1';
  const res = await c.beta.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer this request.');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  if (!text) throw new Error('Claude returned an empty answer.');
  return text;
}

/** Human-readable message for SDK errors (most specific first). */
export async function describeClaudeError(e: unknown): Promise<string> {
  const A: typeof Anthropic = await sdk();
  if (e instanceof A.AuthenticationError) return 'Your Anthropic API key was rejected. Check it in Settings.';
  if (e instanceof A.PermissionDeniedError) return "Your Anthropic key doesn't have access to this model.";
  if (e instanceof A.NotFoundError) return 'That Claude model is not available. Pick another in Settings.';
  if (e instanceof A.RateLimitError) return 'Anthropic rate limit reached. Try again in a minute.';
  if (e instanceof A.APIConnectionError) return "Couldn't reach Anthropic. Check your connection.";
  if (e instanceof A.APIError) return `Anthropic error: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}
