import { z } from 'zod';
export declare const createMenuItemRequestSchema: z.ZodObject<{
    name: z.ZodString;
    price: z.ZodNumber;
    category: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    price: number;
    category: string;
}, {
    name: string;
    price: number;
    category: string;
}>;
export declare const updateMenuItemRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    price: z.ZodOptional<z.ZodNumber>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    price?: number | undefined;
    category?: string | undefined;
}, {
    name?: string | undefined;
    price?: number | undefined;
    category?: string | undefined;
}>;
//# sourceMappingURL=menu.validator.d.ts.map