const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');

class AuthService {
  async register(username, email, password) {
    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate stream key
    const streamKey = require('crypto').randomUUID();

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        streamKey: streamKey,
        role: 'user',
        plan: 'FREE',
        planPrice: 0,
        storageLimit: BigInt(1024 * 1024 * 1024),
        isActive: true
      }
    });

    // Create quota for user
    const streamingLimitBytes = BigInt(process.env.QUOTA_MONTHLY_STREAMING_GB || 100) * 1024n * 1024n * 1024n;
    const viewingLimitBytes = streamingLimitBytes;
    const nextResetAt = this.getNextMonthDate();

    await prisma.quota.create({
      data: {
        userId: user.id,
        recordingUsedBytes: BigInt(0),
        recordingLimitBytes: BigInt(process.env.QUOTA_RECORDING_GB || 1) * 1024n * 1024n * 1024n,
        streamingUsedBytes: BigInt(0),
        streamingLimitBytes,
        streamingResetAt: nextResetAt,
        viewingUsedBytes: BigInt(0),
        viewingLimitBytes,
        viewingResetAt: nextResetAt
      }
    });

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      plan: user.plan,
      streamKey: user.streamKey
    };
  }

  async login(username, password) {
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        plan: user.plan,
        streamKey: user.streamKey,
        isActive: user.isActive
      }
    };
  }

  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        role: user.role,
        streamKey: user.streamKey
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async getUserByStreamKey(streamKey) {
    return await prisma.user.findUnique({
      where: { streamKey },
      include: { quota: true }
    });
  }

  async getUserById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        plan: true,
        planPrice: true,
        storageLimit: true,
        isActive: true,
        streamKey: true,
        createdAt: true,
        quota: true
      }
    });
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    return true;
  }

  getNextMonthDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}

module.exports = new AuthService();
