require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const plans = [
  {
    name: 'FREE',
    description: '無料プラン - ローカルストレージに1GBまで',
    price: 0,
    maxStreams: 1,
    maxResolution: '720p',
    features: {
      recordingStorageGB: 1,
      streamingDataGB: 1,
      storageType: 'local',
      support: 'community'
    }
  },
  {
    name: 'PLUS',
    description: 'Plusプラン - クラウドストレージ10GB、配信容量10GB',
    price: 1,
    maxStreams: 2,
    maxResolution: '1080p',
    features: {
      recordingStorageGB: 10,
      streamingDataGB: 10,
      storageType: 'cloud',
      support: 'email'
    }
  },
  {
    name: 'PRO',
    description: 'Proプラン - クラウドストレージ100GB、配信容量100GB',
    price: 10,
    maxStreams: 5,
    maxResolution: '1080p',
    features: {
      recordingStorageGB: 100,
      streamingDataGB: 100,
      storageType: 'cloud',
      support: 'priority',
      customBranding: true
    }
  },
  {
    name: 'PRO_PLUS',
    description: 'Pro+プラン - クラウドストレージ330GB、配信容量1TB',
    price: 30,
    maxStreams: 10,
    maxResolution: '4k',
    features: {
      recordingStorageGB: 330,
      streamingDataGB: 1024,
      storageType: 'cloud',
      support: 'priority',
      customBranding: true,
      dedicatedSupport: true
    }
  }
];

async function seedPlans() {
  try {
    console.log('[Seed] プランデータを投入中...');

    for (const plan of plans) {
      // 既存のプランを確認
      const existing = await prisma.plan.findUnique({
        where: { name: plan.name }
      });

      if (existing) {
        // 既存の場合は更新
        await prisma.plan.update({
          where: { name: plan.name },
          data: plan
        });
        console.log(`[Seed] ✓ プラン更新: ${plan.name}`);
      } else {
        // 新規作成
        await prisma.plan.create({
          data: plan
        });
        console.log(`[Seed] ✓ プラン作成: ${plan.name}`);
      }
    }

    console.log('[Seed] ✓ すべてのプランを投入しました');
    
    // 確認
    const allPlans = await prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });
    
    console.log('\n[Seed] 現在のプラン一覧:');
    allPlans.forEach(p => {
      console.log(`  - ${p.name}: $${p.price}/月 (${p.description})`);
    });

  } catch (error) {
    console.error('[Seed] エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedPlans();
