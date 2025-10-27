const prisma = require('../db');

class QuotaService {
  async checkAndUpdateStreamingQuota(userId, bytesAdded) {
    const quota = await this.ensureQuota(userId);
    return this.applyUsage(quota, 'streaming', bytesAdded);
  }

  async checkAndUpdateViewingQuota(userId, bytesAdded) {
    const quota = await this.ensureQuota(userId);
    // viewing limit falls back to streaming limit if not explicitly set
    if (quota.viewingLimitBytes == null) {
      quota.viewingLimitBytes = quota.streamingLimitBytes;
    }
    return this.applyUsage(quota, 'viewing', bytesAdded);
  }

  async checkRecordingQuota(userId, bytesNeeded) {
    const quota = await this.ensureQuota(userId);
    const increment = this.normalizeBytes(bytesNeeded);
    if (increment <= 0n) return true;
    const newUsed = quota.recordingUsedBytes + increment;
    return newUsed <= quota.recordingLimitBytes;
  }

  async updateRecordingQuota(userId, bytesAdded) {
    const quota = await this.ensureQuota(userId);
    const increment = this.normalizeBytes(bytesAdded);
    if (increment <= 0n) {
      return {
        used: quota.recordingUsedBytes,
        limit: quota.recordingLimitBytes,
        remaining: quota.recordingLimitBytes - quota.recordingUsedBytes
      };
    }

    const newUsed = quota.recordingUsedBytes + increment;
    const updated = await prisma.quota.update({
      where: { userId },
      data: { recordingUsedBytes: newUsed }
    });

    return {
      used: updated.recordingUsedBytes,
      limit: updated.recordingLimitBytes,
      remaining: updated.recordingLimitBytes - updated.recordingUsedBytes
    };
  }

  async deleteOldestRecording(userId) {
    const oldestRecording = await prisma.recording.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });

    if (oldestRecording) {
      await prisma.recording.delete({
        where: { id: oldestRecording.id }
      });

      await prisma.quota.update({
        where: { userId },
        data: {
          recordingUsedBytes: {
            decrement: oldestRecording.sizeBytes
          }
        }
      });

      return oldestRecording;
    }

    return null;
  }

  async getQuotaStatus(userId) {
    return this.ensureQuota(userId);
  }

  async ensureQuota(userId) {
    let quota = await prisma.quota.findUnique({
      where: { userId }
    });

    if (!quota) {
      throw new Error('Quota not found');
    }

    const updates = {};
    const now = new Date();
    const nextReset = this.getNextMonthDate();

    if (!quota.streamingResetAt || now >= quota.streamingResetAt) {
      updates.streamingUsedBytes = 0n;
      updates.streamingResetAt = nextReset;
    }

    if (quota.viewingLimitBytes == null) {
      updates.viewingLimitBytes = quota.streamingLimitBytes;
    }

    if (quota.viewingUsedBytes == null || quota.viewingUsedBytes < 0) {
      updates.viewingUsedBytes = 0n;
    }

    if (!quota.viewingResetAt || now >= quota.viewingResetAt) {
      updates.viewingUsedBytes = 0n;
      updates.viewingResetAt = nextReset;
    }

    if (Object.keys(updates).length > 0) {
      quota = await prisma.quota.update({
        where: { userId },
        data: updates
      });
    }

    return quota;
  }

  async applyUsage(quota, type, bytesAdded) {
    const increment = this.normalizeBytes(bytesAdded);
    if (increment <= 0n) {
      const limit = quota[`${type}LimitBytes`] ?? quota.streamingLimitBytes ?? 0n;
      const used = quota[`${type}UsedBytes`] ?? 0n;
      return {
        allowed: true,
        remaining: limit - used,
        limit
      };
    }

    const usedField = `${type}UsedBytes`;
    const limitField = `${type}LimitBytes`;

    const currentUsed = quota[usedField] ?? 0n;
    const limit = quota[limitField] ?? quota.streamingLimitBytes ?? 0n;
    const newUsed = currentUsed + increment;

    if (limit > 0n && newUsed > limit) {
      return {
        allowed: false,
        remaining: 0n,
        exceeded: true,
        limit
      };
    }

    const updated = await prisma.quota.update({
      where: { userId: quota.userId },
      data: {
        [usedField]: newUsed
      }
    });

    const finalLimit = updated[limitField] ?? updated.streamingLimitBytes ?? 0n;
    const finalUsed = updated[usedField] ?? 0n;

    return {
      allowed: true,
      remaining: finalLimit - finalUsed,
      limit: finalLimit
    };
  }

  normalizeBytes(value) {
    if (typeof value === 'bigint') {
      return value >= 0n ? value : 0n;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return 0n;
      return BigInt(Math.floor(value));
    }
    if (typeof value === 'string') {
      try {
        const parsed = BigInt(value);
        return parsed >= 0n ? parsed : 0n;
      } catch (err) {
        return 0n;
      }
    }
    return 0n;
  }

  getNextMonthDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}

module.exports = new QuotaService();
