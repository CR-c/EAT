import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __eatPrismaClient__: PrismaClient | undefined;
}

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient(
    databaseUrl
      ? {
          datasources: {
            db: {
              url: databaseUrl,
            },
          },
        }
      : undefined,
  );
}

export const prisma =
  globalThis.__eatPrismaClient__ ?? createPrismaClient(process.env.DATABASE_URL);

if (process.env.NODE_ENV !== "production") {
  globalThis.__eatPrismaClient__ = prisma;
}
