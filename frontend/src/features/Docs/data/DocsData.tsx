// features/Docs/data/DocsData.tsx
import { API } from '../../../config/constants';
import { fetchWithAuth } from '../../../utils/fetchWithAuth';

export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  icon?: string;
  categoryId?: string;
  category?: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
  };
  authorId: string;
  author: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  updatedById?: string;
  updatedBy?: {
    id: string;
    name: string;
    email: string;
  };
  tags: string[];
  isPinned: boolean;
  isPublished: boolean;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
  comments?: Array<{
    id: string;
    content: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
    };
    createdAt: string;
  }>;
  _count?: {
    favorites?: number;
    comments?: number;
    attachments?: number;
  };
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: string;
  parent?: KnowledgeCategory;
  children?: KnowledgeCategory[];
  order: number;
  _count?: {
    articles?: number;
    children?: number;
  };
}

// Получить список статей
export const getArticles = async (
  categoryId?: string | null,
  searchQuery?: string,
  authorId?: string | null,
  favoritesOnly?: boolean,
  limit: number = 50,
  offset: number = 0
): Promise<{ articles: KnowledgeArticle[]; total: number }> => {
  const params = new URLSearchParams();
  if (categoryId) params.append('categoryId', categoryId);
  if (searchQuery) params.append('search', searchQuery);
  if (authorId) params.append('authorId', authorId);
  params.append('isPublished', 'true');
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const response = await fetchWithAuth(`${API}/docs/articles?${params.toString()}`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке статей');
  }

  const data = await response.json();
  
  // Если нужны только избранные, получаем их отдельным запросом
  if (favoritesOnly) {
    try {
      const favoritesResponse = await fetchWithAuth(`${API}/docs/favorites`);
      if (favoritesResponse && favoritesResponse.ok) {
        const favoritesData = await favoritesResponse.json();
        const favoriteIds = new Set(favoritesData.map((fav: any) => fav.articleId || fav.id));
        // Фильтруем статьи по ID избранных
        return {
          articles: data.articles.filter((article: KnowledgeArticle) => favoriteIds.has(article.id)),
          total: data.articles.filter((article: KnowledgeArticle) => favoriteIds.has(article.id)).length
        };
      }
    } catch (err) {
      console.error('Ошибка при загрузке избранного:', err);
      // Если не удалось загрузить избранное, возвращаем пустой список
      return { articles: [], total: 0 };
    }
  }

  return data;
};

// Получить статью по ID
export const getArticleById = async (id: string): Promise<KnowledgeArticle> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${id}`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке статьи');
  }

  return response.json();
};

// Получить статью по slug
export const getArticleBySlug = async (slug: string): Promise<KnowledgeArticle> => {
  const response = await fetchWithAuth(`${API}/docs/articles/slug/${slug}`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке статьи');
  }

  return response.json();
};

// Получить список категорий
export const getCategories = async (): Promise<KnowledgeCategory[]> => {
  const response = await fetchWithAuth(`${API}/docs/categories`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке категорий');
  }

  return response.json();
};

// Получить категорию по ID
export const getCategoryById = async (id: string): Promise<KnowledgeCategory> => {
  const response = await fetchWithAuth(`${API}/docs/categories/${id}`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке категории');
  }

  return response.json();
};

// Создать категорию
export const createCategory = async (data: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
  order?: number;
}): Promise<KnowledgeCategory> => {
  // Очищаем данные перед отправкой
  const cleanData: any = {
    name: data.name.trim(),
    order: typeof data.order === 'number' ? data.order : parseInt(String(data.order || 0)),
  };

  // Добавляем опциональные поля только если они есть
  if (data.description?.trim()) {
    cleanData.description = data.description.trim();
  }
  if (data.icon?.trim()) {
    cleanData.icon = data.icon.trim();
  }
  if (data.color?.trim()) {
    cleanData.color = data.color.trim();
  }
  
  // Обрабатываем parentId: null или UUID строка
  if (data.parentId === null || data.parentId === undefined || data.parentId === '') {
    cleanData.parentId = null;
  } else {
    cleanData.parentId = data.parentId;
  }

  const response = await fetchWithAuth(`${API}/docs/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cleanData),
  });
  
  if (!response || !response.ok) {
    const errorData = await response?.json().catch(() => ({ error: 'Ошибка при создании категории' }));
    const errorMessage = errorData.errors 
      ? JSON.stringify(errorData.errors) 
      : (errorData.error || 'Ошибка при создании категории');
    throw new Error(errorMessage);
  }

  return response.json();
};

// Обновить категорию
export const updateCategory = async (
  id: string,
  data: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    parentId?: string | null;
    order?: number;
  }
): Promise<KnowledgeCategory> => {
  // Очищаем данные перед отправкой
  const cleanData: any = {};

  // Добавляем только переданные поля
  if (data.name !== undefined) {
    cleanData.name = data.name.trim();
  }
  if (data.order !== undefined) {
    cleanData.order = typeof data.order === 'number' ? data.order : parseInt(String(data.order || 0));
  }
  if (data.description !== undefined) {
    if (data.description?.trim()) {
      cleanData.description = data.description.trim();
    } else {
      cleanData.description = null;
    }
  }
  if (data.icon !== undefined) {
    if (data.icon?.trim()) {
      cleanData.icon = data.icon.trim();
    } else {
      cleanData.icon = null;
    }
  }
  if (data.color !== undefined) {
    if (data.color?.trim()) {
      cleanData.color = data.color.trim();
    } else {
      cleanData.color = null;
    }
  }
  
  // Обрабатываем parentId: null или UUID строка
  if (data.parentId !== undefined) {
    if (data.parentId === null || data.parentId === '') {
      cleanData.parentId = null;
    } else {
      cleanData.parentId = data.parentId;
    }
  }

  const response = await fetchWithAuth(`${API}/docs/categories/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cleanData),
  });
  
  if (!response || !response.ok) {
    const errorData = await response?.json().catch(() => ({ error: 'Ошибка при обновлении категории' }));
    const errorMessage = errorData.errors 
      ? JSON.stringify(errorData.errors) 
      : (errorData.error || 'Ошибка при обновлении категории');
    throw new Error(errorMessage);
  }

  return response.json();
};

// Удалить категорию
export const deleteCategory = async (id: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/categories/${id}`, {
    method: 'DELETE',
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при удалении категории' }));
    throw new Error(error.error || 'Ошибка при удалении категории');
  }
};

// Создать статью
export const createArticle = async (data: {
  title: string;
  content: string;
  excerpt?: string;
  icon?: string;
  categoryId?: string;
  tags?: string[];
  isPublished?: boolean;
}): Promise<KnowledgeArticle> => {
  const response = await fetchWithAuth(`${API}/docs/articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при создании статьи' }));
    throw new Error(error.error || 'Ошибка при создании статьи');
  }

  return response.json();
};

// Обновить статью
export const updateArticle = async (
  id: string,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    icon?: string;
    categoryId?: string | null;
    tags?: string[];
    isPublished?: boolean;
    changeNote?: string;
  }
): Promise<KnowledgeArticle> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при обновлении статьи' }));
    throw new Error(error.error || 'Ошибка при обновлении статьи');
  }

  return response.json();
};

// Удалить статью
export const deleteArticle = async (id: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${id}`, {
    method: 'DELETE',
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при удалении статьи' }));
    throw new Error(error.error || 'Ошибка при удалении статьи');
  }
};

// Закрепить/открепить статью
export const togglePinArticle = async (id: string): Promise<KnowledgeArticle> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${id}/pin`, {
    method: 'POST',
  });
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при закреплении статьи');
  }

  return response.json();
};

// Добавить в избранное
export const addToFavorites = async (articleId: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${articleId}/favorite`, {
    method: 'POST',
  });
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при добавлении в избранное');
  }
};

// Удалить из избранного
export const removeFromFavorites = async (articleId: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${articleId}/favorite`, {
    method: 'DELETE',
  });
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при удалении из избранного');
  }
};

// Получить избранные статьи
export const getFavorites = async (): Promise<KnowledgeArticle[]> => {
  const response = await fetchWithAuth(`${API}/docs/favorites`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке избранного');
  }

  return response.json();
};

// Интерфейс для комментария
export interface KnowledgeComment {
  id: string;
  content: string;
  articleId: string;
  userId: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
  replies?: KnowledgeComment[];
}

// Получить комментарии к статье
export const getArticleComments = async (
  articleId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ comments: KnowledgeComment[]; total: number; page: number; totalPages: number }> => {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  
  const response = await fetchWithAuth(`${API}/docs/articles/${articleId}/comments?${params.toString()}`);
  
  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке комментариев');
  }

  return response.json();
};

// Создать комментарий
export const createComment = async (
  articleId: string,
  content: string,
  parentId?: string | null
): Promise<KnowledgeComment> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${articleId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      parentId: parentId || null,
    }),
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при создании комментария' }));
    throw new Error(error.error || 'Ошибка при создании комментария');
  }

  return response.json();
};

// Обновить комментарий
export const updateComment = async (
  commentId: string,
  content: string
): Promise<KnowledgeComment> => {
  const response = await fetchWithAuth(`${API}/docs/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при обновлении комментария' }));
    throw new Error(error.error || 'Ошибка при обновлении комментария');
  }

  return response.json();
};

// Удалить комментарий
export const deleteComment = async (commentId: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/comments/${commentId}`, {
    method: 'DELETE',
  });
  
  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при удалении комментария' }));
    throw new Error(error.error || 'Ошибка при удалении комментария');
  }
};

// Интерфейс для вложения
export interface KnowledgeAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

// Загрузить файл к статье
export const uploadAttachment = async (articleId: string, file: File): Promise<KnowledgeAttachment> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('articleId', articleId);

  const response = await fetchWithAuth(`${API}/docs/articles/attachments`, {
    method: 'POST',
    body: formData,
    // Не устанавливаем Content-Type, браузер сам установит с boundary для FormData
  });

  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при загрузке файла' }));
    throw new Error(error.error || 'Ошибка при загрузке файла');
  }

  return response.json();
};

// Удалить вложение
export const deleteAttachment = async (attachmentId: string): Promise<void> => {
  const response = await fetchWithAuth(`${API}/docs/attachments/${attachmentId}`, {
    method: 'DELETE',
  });

  if (!response || !response.ok) {
    const error = await response?.json().catch(() => ({ error: 'Ошибка при удалении файла' }));
    throw new Error(error.error || 'Ошибка при удалении файла');
  }
};

// Получить вложения статьи
export const getArticleAttachments = async (articleId: string): Promise<KnowledgeAttachment[]> => {
  const response = await fetchWithAuth(`${API}/docs/articles/${articleId}/attachments`);

  if (!response || !response.ok) {
    throw new Error('Ошибка при загрузке вложений');
  }

  return response.json();
};
