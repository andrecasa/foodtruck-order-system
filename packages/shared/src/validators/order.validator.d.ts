import { z } from 'zod';
export declare const createOrderRequestSchema: z.ZodObject<{
    customerName: z.ZodString;
    origin: z.ZodEnum<["presencial", "whatsapp"]>;
    items: z.ZodArray<z.ZodObject<{
        menuItemId: z.ZodString;
        quantity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        menuItemId: string;
        quantity: number;
    }, {
        menuItemId: string;
        quantity: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    customerName: string;
    origin: "presencial" | "whatsapp";
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}, {
    customerName: string;
    origin: "presencial" | "whatsapp";
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}>;
export declare const updateOrderStatusRequestSchema: z.ZodObject<{
    status: z.ZodEnum<["aguardando", "preparando", "pronto", "entregue"]>;
}, "strip", z.ZodTypeAny, {
    status: "aguardando" | "preparando" | "pronto" | "entregue";
}, {
    status: "aguardando" | "preparando" | "pronto" | "entregue";
}>;
export declare const updateOrderItemsRequestSchema: z.ZodObject<{
    items: z.ZodEffects<z.ZodArray<z.ZodObject<{
        menuItemId: z.ZodString;
        quantity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        menuItemId: string;
        quantity: number;
    }, {
        menuItemId: string;
        quantity: number;
    }>, "many">, {
        menuItemId: string;
        quantity: number;
    }[], {
        menuItemId: string;
        quantity: number;
    }[]>;
}, "strip", z.ZodTypeAny, {
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}, {
    items: {
        menuItemId: string;
        quantity: number;
    }[];
}>;
//# sourceMappingURL=order.validator.d.ts.map