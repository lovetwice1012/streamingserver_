const prisma = require('../db');

const getNextResetDate = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
};

// プラン定義（要件に合わせて修正）
const PLANS = {
  FREE: {
    name: 'FREE',
    displayName: '無料プラン',
    price: 0,
    recordingStorageGB: 1,      // 録画容量: サーバーローカル 1GB
    streamingDataGB: 1,         // 配信容量: 1GB
    maxStreams: 1,
    maxResolution: '720p',
    storageType: 'local',
    features: [
      'サーバーローカルストレージ: 1GB',
      '配信容量: 1GB/月',
      'RTMP/RTSP配信',
      '基本的な録画機能'
    ]
  },
  PLUS: {
    name: 'PLUS',
    displayName: 'Plusプラン',
    price: 1,
    recordingStorageGB: 10,     // 録画容量: 10GB
    streamingDataGB: 10,        // 配信容量: 10GB
    maxStreams: 2,
    maxResolution: '1080p',
    storageType: 'cloud',
    features: [
      'クラウドストレージ: 10GB',
      '配信容量: 10GB/月',
      'RTMP/RTSP配信',
      '高画質録画',
      '優先サポート'
    ]
  },
  PRO: {
    name: 'PRO',
    displayName: 'Proプラン',
    price: 10,
    recordingStorageGB: 100,    // 録画容量: 100GB
    streamingDataGB: 100,       // 配信容量: 100GB
    maxStreams: 5,
    maxResolution: '1080p',
    storageType: 'cloud',
    features: [
      'クラウドストレージ: 100GB',
      '配信容量: 100GB/月',
      'RTMP/RTSP配信',
      '高画質録画',
      '優先サポート',
      '複数同時配信(最大5)'
    ]
  },
  PRO_PLUS: {
    name: 'PRO_PLUS',
    displayName: 'Pro+プラン',
    price: 30,
    recordingStorageGB: 330,    // 録画容量: 330GB
    streamingDataGB: 1024,      // 配信容量: 1TB
    maxStreams: 10,
    maxResolution: '4K',
    storageType: 'cloud',
    features: [
      'クラウドストレージ: 330GB',
      '配信容量: 1TB/月',
      'RTMP/RTSP配信',
      '最高画質録画(4K対応)',
      '優先サポート',
      '複数同時配信(最大10)',
      '高度な分析機能'
    ]
  }
};

class PlanService {
  // すべてのプランを取得
  getPlans() {
    return PLANS;
  }

  // プラン情報を取得
  getPlan(planName) {
    return PLANS[planName] || PLANS.FREE;
  }

  // プランの容量制限を取得（バイト）
  getStorageLimit(planName) {
    const plan = this.getPlan(planName);
    return plan.recordingStorageGB * 1024 * 1024 * 1024; // GB to bytes
  }

  // 配信容量制限を取得（バイト）
  getStreamingLimit(planName) {
    const plan = this.getPlan(planName);
    return plan.streamingDataGB * 1024 * 1024 * 1024; // GB to bytes
  }

  // ユーザーがプランを使用できるか確認
  canUseFeature(user, feature) {
    const plan = this.getPlan(user.plan);
    
    switch (feature) {
      case 'cloud_storage':
        return user.plan !== 'FREE';
      case 'multi_stream':
        return ['PRO', 'PRO_PLUS'].includes(user.plan);
      case 'analytics':
        return user.plan === 'PRO_PLUS';
      case '4k':
        return user.plan === 'PRO_PLUS';
      default:
        return true;
    }
  }

  // ユーザーのプランを変更
  async updateUserPlan(userId, newPlan, adminId = null) {
    try {
      // プランの存在確認
      if (!PLANS[newPlan]) {
        throw new Error(`Invalid plan: ${newPlan}`);
      }

      const planInfo = PLANS[newPlan];
      const recordingLimit = this.getStorageLimit(newPlan);
      const streamingLimit = this.getStreamingLimit(newPlan);

      // ユーザーを更新
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          plan: newPlan,
          planPrice: planInfo.price,
          storageLimit: BigInt(recordingLimit)
        }
      });

      // クォータを更新
      await prisma.quota.upsert({
        where: { userId: userId },
        update: {
          recordingLimitBytes: BigInt(recordingLimit),
          streamingLimitBytes: BigInt(streamingLimit),
          viewingLimitBytes: BigInt(streamingLimit)
        },
        create: {
          userId: userId,
          recordingUsedBytes: BigInt(0),
          recordingLimitBytes: BigInt(recordingLimit),
          streamingUsedBytes: BigInt(0),
          streamingLimitBytes: BigInt(streamingLimit),
          streamingResetAt: getNextResetDate(),
          viewingUsedBytes: BigInt(0),
          viewingLimitBytes: BigInt(streamingLimit),
          viewingResetAt: getNextResetDate()
        }
      });

      // システムログに記録
      await prisma.systemLog.create({
        data: {
          level: 'info',
          category: 'plan',
          message: `User plan changed to ${newPlan}`,
          metadata: {
            userId,
            newPlan,
            planPrice: planInfo.price,
            recordingLimit,
            streamingLimit,
            changedBy: adminId || userId
          }
        }
      });

      console.log(`[Plan] User ${userId} plan changed to ${newPlan}`);
      return user;

    } catch (error) {
      console.error('[Plan] Error updating user plan:', error);
      throw error;
    }
  }

  // 無料プランのストレージ上限を変更（管理者のみ）
  async updateFreeStorageLimit(limitGB) {
    try {
      const limitBytes = BigInt(limitGB * 1024 * 1024 * 1024);

      // すべての無料プランユーザーを更新
      await prisma.user.updateMany({
        where: { plan: 'FREE' },
        data: { storageLimit: limitBytes }
      });

      // 無料プランユーザーのクォータも更新
      const freeUsers = await prisma.user.findMany({
        where: { plan: 'FREE' },
        select: { id: true }
      });

      for (const user of freeUsers) {
        await prisma.quota.upsert({
          where: { userId: user.id },
          update: { 
            recordingLimitBytes: limitBytes,
            viewingLimitBytes: BigInt(1024 * 1024 * 1024)
          },
          create: {
            userId: user.id,
            recordingUsedBytes: BigInt(0),
            recordingLimitBytes: limitBytes,
            streamingUsedBytes: BigInt(0),
            streamingLimitBytes: BigInt(1024 * 1024 * 1024),
            streamingResetAt: getNextResetDate(),
            viewingUsedBytes: BigInt(0),
            viewingLimitBytes: BigInt(1024 * 1024 * 1024),
            viewingResetAt: getNextResetDate()
          }
        });
      }

      // グローバル設定として保存
      await prisma.systemLog.create({
        data: {
          level: 'info',
          category: 'plan',
          message: `Free plan storage limit updated to ${limitGB}GB`,
          metadata: { limitGB, limitBytes: limitBytes.toString() }
        }
      });

      console.log(`[Plan] Free plan storage limit updated to ${limitGB}GB`);
      return { limitGB, limitBytes: limitBytes.toString(), affectedUsers: freeUsers.length };

    } catch (error) {
      console.error('[Plan] Error updating free storage limit:', error);
      throw error;
    }
  }

  // ユーザーの使用状況とプラン情報を取得
  async getUserPlanInfo(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          plan: true,
          planPrice: true,
          storageLimit: true,
          quota: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const planInfo = this.getPlan(user.plan);
      const recordingUsed = user.quota ? Number(user.quota.recordingUsedBytes) : 0;
      const recordingLimit = Number(user.storageLimit);
      const streamingUsed = user.quota ? Number(user.quota.streamingUsedBytes) : 0;
      const streamingLimit = user.quota ? Number(user.quota.streamingLimitBytes) : 0;
      const viewingUsed = user.quota ? Number(user.quota.viewingUsedBytes ?? user.quota.streamingUsedBytes) : 0;
      const viewingLimit = user.quota ? Number(user.quota.viewingLimitBytes ?? user.quota.streamingLimitBytes) : 0;

      const recordingPercent = recordingLimit > 0 ? (recordingUsed / recordingLimit * 100).toFixed(2) : 0;
      const streamingPercent = streamingLimit > 0 ? (streamingUsed / streamingLimit * 100).toFixed(2) : 0;
      const viewingPercent = viewingLimit > 0 ? (viewingUsed / viewingLimit * 100).toFixed(2) : 0;

      return {
        user: {
          id: user.id,
          username: user.username,
          plan: user.plan
        },
        planDetails: {
          ...planInfo,
          price: planInfo.price
        },
        recording: {
          usedBytes: recordingUsed,
          usedGB: (recordingUsed / (1024 * 1024 * 1024)).toFixed(2),
          limitBytes: recordingLimit,
          limitGB: (recordingLimit / (1024 * 1024 * 1024)).toFixed(2),
          percentUsed: recordingPercent
        },
        streaming: {
          usedBytes: streamingUsed,
          usedGB: (streamingUsed / (1024 * 1024 * 1024)).toFixed(2),
          limitBytes: streamingLimit,
          limitGB: (streamingLimit / (1024 * 1024 * 1024)).toFixed(2),
          percentUsed: streamingPercent,
          resetAt: user.quota?.streamingResetAt
        },
        viewing: {
          usedBytes: viewingUsed,
          usedGB: (viewingUsed / (1024 * 1024 * 1024)).toFixed(2),
          limitBytes: viewingLimit,
          limitGB: (viewingLimit / (1024 * 1024 * 1024)).toFixed(2),
          percentUsed: viewingPercent,
          resetAt: user.quota?.viewingResetAt
        },
        features: planInfo.features
      };

    } catch (error) {
      console.error('[Plan] Error getting user plan info:', error);
      throw error;
    }
  }

  // プラン統計（管理者用）
  async getPlanStats() {
    try {
      const stats = await prisma.user.groupBy({
        by: ['plan'],
        _count: {
          plan: true
        },
        _sum: {
          planPrice: true
        }
      });

      const totalUsers = await prisma.user.count();
      const totalRevenue = stats.reduce((sum, stat) => sum + (stat._sum.planPrice || 0), 0);

      return {
        totalUsers,
        totalRevenue,
        plans: stats.map(stat => ({
          plan: stat.plan,
          userCount: stat._count.plan,
          planInfo: this.getPlan(stat.plan),
          revenue: stat._sum.planPrice || 0
        }))
      };

    } catch (error) {
      console.error('[Plan] Error getting plan stats:', error);
      throw error;
    }
  }
}

module.exports = new PlanService();
