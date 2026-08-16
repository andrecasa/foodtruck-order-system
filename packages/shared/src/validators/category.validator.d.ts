import { z } from 'zod';
export declare const createCategoryRequestSchema: z.ZodObject<{
    name: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const updateCategoryRequestSchema: z.ZodObject<{
    name: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const reorderCategoriesRequestSchema: z.ZodObject<{
    categoryIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    categoryIds: string[];
}, {
    categoryIds: string[];
}>;
//# sourceMappingURL=category.validator.d.ts.map