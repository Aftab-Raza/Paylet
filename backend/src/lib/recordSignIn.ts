import { prisma } from "./prisma.js";

// Community ordering must never turn a successful authentication into a failure.
export async function recordSignIn(userId: string) {
  try {
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() }, select: { id: true } });
  } catch {
    console.warn("Unable to update community sign-in ordering.");
  }
}
