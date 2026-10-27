import { apiRequest } from './api';
import type { AnnouncementDocument } from './donations';

export type EducationalArticle = {
  id: number; title: string; category: string; category_label: string; short_description: string;
  description: string; description_document: AnnouncementDocument | null; image_url: string | null;
  status: 'published'; deleted_at?: string | null; published_at: string; updated_at: string;
};
export type EducationalPage = { data: EducationalArticle[]; meta: { current_page: number; last_page: number; total: number; per_page: number }; categories: Record<string, string> };
export const educationalArticlesApi = {
  list: (token: string, page = 1) => apiRequest<EducationalPage>(`/educational-articles?page=${page}`, { token }),
  detail: (token: string, id: number) => apiRequest<{ article: EducationalArticle }>(`/educational-articles/${id}`, { token }),
};

export function publishedArticle(value: EducationalArticle): boolean {
  return Number.isSafeInteger(value?.id) && value.id > 0 && value.status === 'published' && !value.deleted_at;
}
