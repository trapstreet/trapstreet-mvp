import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { eq, and } from "drizzle-orm";
import { db } from "./db/client";
import { users } from "./db/schema";

// Auth.js v5 with JWT strategy. We persist a lightweight `users` row on first
// signin so other tables can FK to it; sessions live in the JWT cookie, no
// session table required.

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub, Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || !profile) return false;
      const provider = account.provider; // "github" | "google"
      const providerAccountId = account.providerAccountId;

      const existing = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.provider, provider),
            eq(users.provider_account_id, providerAccountId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        const id = `u_${provider}_${providerAccountId}`;
        await db.insert(users).values({
          id,
          provider,
          provider_account_id: providerAccountId,
          email: user.email ?? null,
          name: user.name ?? null,
          image: user.image ?? null,
        });
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.userId = `u_${account.provider}_${account.providerAccountId}`;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// Augment the JWT type so callbacks can read `token.userId` with type safety.
import type {} from "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
