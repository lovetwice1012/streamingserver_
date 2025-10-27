require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    // 既存の admin ユーザーを確認
    const existingAdmin = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (existingAdmin) {
      console.log('[Setup] Admin user already exists');
      console.log('[Setup] Username: admin');
      console.log('[Setup] Stream Key:', existingAdmin.streamKey);
      process.exit(0);
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash('admin', 10);
    
    // ストリームキーを生成
    const streamKey = crypto.randomUUID();

    // 管理者ユーザーを作成
    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@localhost',
        password: hashedPassword,
        streamKey: streamKey,
        role: 'admin',
        plan: 'premium',
        planPrice: 0,
        storageLimit: BigInt(1024 * 1024 * 1024 * 1024), // 1TB
        isActive: true
      }
    });

    // クォータを作成
    const resetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.quota.create({
      data: {
        userId: admin.id,
        recordingUsedBytes: BigInt(0),
        recordingLimitBytes: BigInt(1024 * 1024 * 1024 * 1024), // 1TB
        streamingUsedBytes: BigInt(0),
        streamingLimitBytes: BigInt(1024 * 1024 * 1024 * 1024), // 1TB
        streamingResetAt: resetAt, // 30 days
        viewingUsedBytes: BigInt(0),
        viewingLimitBytes: BigInt(1024 * 1024 * 1024 * 1024), // 1TB
        viewingResetAt: resetAt
      }
    });

    console.log('[Setup] ✓ Admin user created successfully');
    console.log('[Setup] Username: admin');
    console.log('[Setup] Password: admin');
    console.log('[Setup] Email: admin@localhost');
    console.log('[Setup] Stream Key:', streamKey);
    console.log('[Setup] ⚠️  Please change the password after first login!');
    
  } catch (error) {
    console.error('[Setup] Error creating admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();
