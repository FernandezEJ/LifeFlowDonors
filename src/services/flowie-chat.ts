import { ApiError, apiRequest, errorMessage } from './api';
import { localFlowieResponse, type FlowieMessage } from './flowie-preview';

export type FlowieHistoryEntry = { role: 'user' | 'assistant'; text: string };
export type FlowieConversation = {
  id: number; title: string; status: 'active' | 'ended';
  created_at: string; updated_at: string; ended_at: string | null; last_message_at: string | null;
  deleted_at?: string; permanent_delete_at?: string; days_remaining?: number; recoverable?: boolean;
};
export type FlowieStoredMessage = { id: number; role: 'user' | 'assistant'; content: string; created_at: string };
export type FlowiePage<T> = { data: T[]; current_page: number; last_page: number; total: number };
export type FlowieDetail = { conversation: FlowieConversation; messages: FlowiePage<FlowieStoredMessage> };
export type FlowieChatResult = { reply: string; conversation_id: number };
export type FlowieMutation = { message: string; conversation: FlowieConversation };
export type FlowieReader = {
  flowieHistory: (page?: number) => Promise<FlowiePage<FlowieConversation>>;
  flowieDetail: (id: number, page?: number) => Promise<FlowieDetail>;
};

function validId(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError('This conversation is unavailable.', 422);
  return id;
}
function conversation(value: FlowieConversation): FlowieConversation {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 || !['active', 'ended'].includes(value.status) || typeof value.title !== 'string') {
    throw new ApiError('LifeFlow returned an unreadable conversation. Please refresh.');
  }
  return value;
}
function page<T>(value: FlowiePage<T>): FlowiePage<T> {
  if (!value || !Array.isArray(value.data) || !Number.isInteger(value.current_page) || value.current_page < 1 || !Number.isInteger(value.last_page) || value.last_page < 1) {
    throw new ApiError('LifeFlow returned unreadable history. Please refresh.');
  }
  return value;
}
async function list(token: string, deleted: boolean, number: number) {
  const result = page(await apiRequest<FlowiePage<FlowieConversation>>('/flowie/conversations' + (deleted ? '/recently-deleted' : '') + '?page=' + validId(number), { token }));
  result.data.forEach(conversation);
  return result;
}
async function mutate(token: string, id: number, action: 'end' | 'delete' | 'restore') {
  const result = await apiRequest<FlowieMutation>('/flowie/conversations/' + validId(id) + (action === 'delete' ? '' : '/' + action),
    { token, method: action === 'delete' ? 'DELETE' : 'POST' });
  conversation(result.conversation);
  return result;
}

export async function requestFlowieChat(token: string, message: string, history: FlowieHistoryEntry[], conversationId?: number): Promise<FlowieChatResult> {
  const result = await apiRequest<FlowieChatResult>('/flowie/chat', {
    token, method: 'POST', body: { message, history: history.slice(-6), ...(conversationId === undefined ? {} : { conversation_id: validId(conversationId) }) }, timeoutMs: 40000,
  });
  if (typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 4000 || !Number.isSafeInteger(result.conversation_id) || result.conversation_id < 1) {
    throw new ApiError('Flowie could not confirm the saved reply. Refresh your conversation before sending again.');
  }
  return result;
}
export const flowieApi = {
  history: (token: string, number = 1) => list(token, false, number),
  deleted: (token: string, number = 1) => list(token, true, number),
  detail: async (token: string, id: number, number = 1): Promise<FlowieDetail> => {
    const result = await apiRequest<FlowieDetail>('/flowie/conversations/' + validId(id) + '?page=' + validId(number), { token });
    conversation(result.conversation);
    page(result.messages);
    if (result.conversation.id !== id || result.messages.data.some(item => !Number.isSafeInteger(item.id) || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string')) {
      throw new ApiError('LifeFlow returned unreadable messages. Please refresh.');
    }
    return result;
  },
  end: (token: string, id: number) => mutate(token, id, 'end'),
  remove: (token: string, id: number) => mutate(token, id, 'delete'),
  restore: (token: string, id: number) => mutate(token, id, 'restore'),
};

// Collect every message page before replacing the visible snapshot; partial loads never erase an existing chat.
export async function loadFlowieDetail(reader: FlowieReader, id: number) {
  let result = await reader.flowieDetail(id, 1);
  const records = [...result.messages.data];
  for (let number = 2; number <= result.messages.last_page; number++) {
    result = await reader.flowieDetail(id, number);
    records.push(...result.messages.data);
  }
  const messages = [...new Map(records.map(item => [item.id, item])).values()]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  return { conversation: result.conversation, messages };
}
export async function findActiveFlowie(reader: FlowieReader) {
  let number = 1;
  while (true) {
    const result = await reader.flowieHistory(number);
    const active = result.data.find(item => item.status === 'active' && !item.deleted_at);
    if (active) return loadFlowieDetail(reader, active.id);
    if (number >= result.last_page) return { conversation: null, messages: [] as FlowieStoredMessage[] };
    number++;
  }
}

// Guided buttons remain allowlisted; assistant text always comes from the actual persisted Groq reply.
export function flowieDisplayMessages(records: FlowieStoredMessage[]): FlowieMessage[] {
  let question = '';
  return records.map(item => {
    if (item.role === 'user') { question = item.content; return { id: String(item.id), role: 'user', message: item.content }; }
    const guide = localFlowieResponse(question);
    return { id: String(item.id), role: 'flowie', message: item.content, source: 'ai', ...(guide?.action ? { action: guide.action } : {}) };
  });
}
export function flowieError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'This conversation is unavailable. It may have been deleted.';
    if (error.status === 410) return 'The 30-day recovery period has ended. Refresh Recently Deleted.';
    if (error.status === 409) return 'This conversation changed or Flowie is still replying. Refresh and try again.';
    if (error.status === 503) return 'Flowie is unavailable right now. Please try again shortly.';
  }
  return errorMessage(error);
}
export function flowieDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
}
