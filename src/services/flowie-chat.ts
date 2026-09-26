import { ApiError, apiRequest } from './api';
export type FlowieHistoryEntry = { role: 'user' | 'assistant'; text: string };
export async function requestFlowieChat(token: string, message: string, history: FlowieHistoryEntry[]) {
  const result = await apiRequest<{ reply: string }>('/flowie/chat', {
    token, method: 'POST', body: { message, history: history.slice(-6) }, timeoutMs: 40000,
  });
  if (typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 4000) {
    throw new ApiError('Flowie could not reply. Please try again.');
  }
  return result;
}
