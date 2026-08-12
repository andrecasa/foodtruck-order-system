export type MenuItemStatus = 'ativo' | 'inativo';

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  status: MenuItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuItemRequest {
  name: string;
  price: number;
  category: string;
}

export interface UpdateMenuItemRequest {
  name?: string;
  price?: number;
  category?: string;
}
