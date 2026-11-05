import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";

export const defaultCategories = ["Food", "Groceries", "Travel", "Shopping", "Rent", "Utilities", "Health", "Education", "Entertainment", "Other"];
export const categoryNameSchema = z.string().transform(value => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1, "Enter a category name.").max(40, "Use 40 characters or fewer.").regex(/^[^\p{Cc}\p{Cf}]+$/u, "Use a readable category name."));
export const categoryKey = (name: string) => name.toLocaleLowerCase("en-US");

export async function resolveCategory(db: Pick<Prisma.TransactionClient, "expenseCategory">, userId: string, name: string) {
  const normalizedName = categoryKey(name);
  const builtin = defaultCategories.find(category => categoryKey(category) === normalizedName);
  if (builtin) return builtin;
  const custom = await db.expenseCategory.findUnique({ where: { userId_normalizedName: { userId, normalizedName } } });
  if (!custom) throw new z.ZodError([{ code: "custom", path: ["category"], message: "Choose one of your categories or add it first." }]);
  return custom.name;
}
