import type { OrderStatus, PaymentStatus, OrderOrigin, PaymentMethod } from '../types/order';
export declare const ORDER_STATUSES: readonly OrderStatus[];
export declare const PAYMENT_STATUSES: readonly PaymentStatus[];
export declare const ORDER_ORIGINS: readonly OrderOrigin[];
export declare const PAYMENT_METHODS: readonly PaymentMethod[];
export declare const VALID_TRANSITIONS: Readonly<Partial<Record<OrderStatus, OrderStatus>>>;
export declare function isValidTransition(from: OrderStatus, to: OrderStatus): boolean;
//# sourceMappingURL=status.d.ts.map