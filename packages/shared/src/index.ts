export type {
  OrderStatus,
  PaymentStatus,
  OrderOrigin,
  PaymentMethod,
  OrderItem,
  Order,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  RegisterPaymentRequest,
  UpdateOrderItemsRequest,
  MenuItemStatus,
  MenuItem,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  DailySummary,
  MonthlySummaryResponse,
  DayBreakdown,
  ThemeConfig,
  CategoryStatus,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoriesRequest,
  TenantStatus,
  Tenant,
  TenantBrandingResponse,
} from './types/index';

export {
  createOrderRequestSchema,
  updateOrderStatusRequestSchema,
  updateOrderItemsRequestSchema,
} from './validators/order.validator';

export {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from './validators/menu.validator';

export { registerPaymentRequestSchema } from './validators/payment.validator';

export {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  reorderCategoriesRequestSchema,
} from './validators/category.validator';

export {
  themeConfigPartialSchema,
  tenantSchema,
  tenantBrandingResponseSchema,
} from './validators/tenant.validator';

export {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  ORDER_ORIGINS,
  PAYMENT_METHODS,
  VALID_TRANSITIONS,
  isValidTransition,
} from './constants/status';

export {
  MAX_QUANTITY,
  MIN_PRICE,
  MAX_PRICE,
  MAX_NAME_LENGTH,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
  SESSION_DURATION_HOURS,
  WHATSAPP_SESSION_TIMEOUT_MS,
  REALTIME_RECONNECT_INTERVAL_MS,
} from './constants/config';

export {
  BADGE_BG_PAGO,
  BADGE_BG_PENDENTE,
  BADGE_BG_ENTREGUE,
  BADGE_BG_PRESENCIAL,
  BADGE_BG_WHATSAPP,
  BADGE_TEXT_PAGO,
  BADGE_TEXT_PENDENTE,
  BADGE_TEXT_ENTREGUE,
  BADGE_TEXT_PRESENCIAL,
  BADGE_TEXT_WHATSAPP,
  TEXT_SECONDARY,
  DIVIDER,
  SURFACE,
  DISABLED_BG,
  DISABLED_TEXT,
} from './constants/colors';
