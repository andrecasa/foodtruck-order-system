export type CategoryStatus = 'ativo' | 'inativo';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  status: CategoryStatus;
  itemCount: number;
  createdAt: string;
}

export interface CreateCategoryRequest {
  name: string;
}

export interface UpdateCategoryRequest {
  name: string;
}

export interface ReorderCategoriesRequest {
  categoryIds: string[];
}
