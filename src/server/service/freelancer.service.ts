import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { freelancers } from '@/server/db/schema';
import { AppError } from '@/server/lib/http';

export const freelancerService = {
  async getOrCreate(
    publicKey: string,
    displayName: string,
    walletAddress: string,
  ): Promise<typeof freelancers.$inferSelect> {
    const existing = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (existing) return existing;
    const [created] = await db
      .insert(freelancers)
      .values({
        publicKey,
        displayName,
        walletAddress,
      })
      .returning();
    return created;
  },

  async getByPublicKey(publicKey: string): Promise<typeof freelancers.$inferSelect | undefined> {
    return db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
  },

  async updateProfile(
    publicKey: string,
    data: { displayName?: string; email?: string },
  ): Promise<typeof freelancers.$inferSelect> {
    const existing = await db.query.freelancers.findFirst({
      where: eq(freelancers.publicKey, publicKey),
    });
    if (!existing) throw new AppError('NOT_FOUND', 'Freelancer not found', 404);
    const [updated] = await db
      .update(freelancers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(freelancers.publicKey, publicKey))
      .returning();
    return updated;
  },
};
