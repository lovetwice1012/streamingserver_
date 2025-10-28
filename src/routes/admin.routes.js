const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');
const recordingService = require('../services/recording.service');

let streamingService;
try {
  streamingService = require('../services/streaming.service');
} catch (error) {
  console.error('[Admin] Failed to load streaming service:', error);
  streamingService = null;
}

// BigInt を JSON に変換するヘルパー関数
function serializeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    )
  );
}

// すべてのユーザーを取得（管理者のみ）
router.get('/users', authenticate, adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        quota: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // BigInt を数値に変換
    const serializedUsers = users.map(user => ({
      ...user,
      storageLimit: Number(user.storageLimit),
      quota: user.quota ? {
        ...user.quota,
        recordingUsedBytes: Number(user.quota.recordingUsedBytes),
        recordingLimitBytes: Number(user.quota.recordingLimitBytes),
        streamingUsedBytes: Number(user.quota.streamingUsedBytes),
        streamingLimitBytes: Number(user.quota.streamingLimitBytes),
        viewingUsedBytes: Number(user.quota.viewingUsedBytes ?? 0),
        viewingLimitBytes: Number(user.quota.viewingLimitBytes ?? user.quota.streamingLimitBytes)
      } : null,
      password: undefined  // パスワードを除外
    }));

    res.json({ success: true, users: serializedUsers });
  } catch (error) {
    console.error('[Admin] Get users error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ユーザー情報を更新（管理者のみ）
router.put('/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, isActive, role } = req.body;

    const updateData = {};
    if (plan !== undefined) updateData.plan = plan;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (role !== undefined) updateData.role = role;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { quota: true }
    });

    // BigInt を数値に変換
    const serializedUser = {
      ...user,
      storageLimit: Number(user.storageLimit),
      quota: user.quota ? {
        ...user.quota,
        recordingUsedBytes: Number(user.quota.recordingUsedBytes),
        recordingLimitBytes: Number(user.quota.recordingLimitBytes),
        streamingUsedBytes: Number(user.quota.streamingUsedBytes),
        streamingLimitBytes: Number(user.quota.streamingLimitBytes),
        viewingUsedBytes: Number(user.quota.viewingUsedBytes ?? 0),
        viewingLimitBytes: Number(user.quota.viewingLimitBytes ?? user.quota.streamingLimitBytes)
      } : null,
      password: undefined
    };

    res.json({ success: true, user: serializedUser });
  } catch (error) {
    console.error('[Admin] Update user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ユーザーを削除（管理者のみ）
router.delete('/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // 自分自身を削除できないようにする
    if (id === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete your own account' 
      });
    }

    // クォータを削除
    await prisma.quota.deleteMany({
      where: { userId: id }
    });

    // ユーザーを削除
    await prisma.user.delete({
      where: { id }
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Admin] Delete user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 管理画面: アクティブセッション一覧（RTMP/HLS の配信中セッション）
router.get('/sessions', authenticate, adminOnly, async (req, res) => {
  try {
    let activeSessions = [];
    try {
      if (streamingService && typeof streamingService.getActiveSessions === 'function') {
        const maybeActive = await streamingService.getActiveSessions();
        if (Array.isArray(maybeActive)) {
          activeSessions = maybeActive;
        }
      }
    } catch (e) {
      console.error('[Admin] sessions: streamingService error', e);
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '100', 10) || 100, 500));
    const recentSessions = await prisma.streamSession.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            plan: true
          }
        }
      },
      orderBy: { startedAt: 'desc' },
      take: limit
    });

    const activeMap = new Map();
    activeSessions.forEach(active => {
      const key = active.sessionId || active.id || active.streamKey;
      if (key && !activeMap.has(key)) {
        activeMap.set(key, active);
      }
    });

    const merged = recentSessions.map(dbSession => {
      const active = activeMap.get(dbSession.id) || activeMap.get(dbSession.streamKey);
      const base = {
        id: dbSession.id,
        streamKey: dbSession.streamKey,
        status: active?.status || dbSession.status,
        startedAt: active?.startedAt || dbSession.startedAt,
        endedAt: dbSession.endedAt,
        bytesStreamed: active?.bytesStreamed ?? dbSession.bytesStreamed,
        bytesDelivered: active?.bytesDelivered ?? dbSession.bytesDelivered,
        viewerCount: active?.viewerCount ?? 0,
        viewerQuotaExceeded: active?.viewerQuotaExceeded ?? (dbSession.status === 'viewing_quota_exceeded'),
        user: dbSession.user || active?.user
      };
      return serializeBigInt(base);
    });

    activeSessions.forEach(active => {
      const key = active.sessionId || active.id || active.streamKey;
      if (!key) return;
      const exists = merged.find(session => session.id === key);
      if (exists) return;
      merged.unshift(
        serializeBigInt({
          id: key,
          streamKey: active.streamKey,
          status: active.status,
          startedAt: active.startedAt,
          endedAt: null,
          bytesStreamed: active.bytesStreamed,
          bytesDelivered: active.bytesDelivered,
          viewerCount: active.viewerCount,
          viewerQuotaExceeded: active.viewerQuotaExceeded ?? false,
          user: active.user
        })
      );
    });

    res.json({ success: true, sessions: merged });
  } catch (error) {
    console.error('[Admin] Get sessions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 管理画面: 録画一覧
router.get('/recordings', authenticate, adminOnly, async (req, res) => {
  try {
    // 優先: DB に recordings テーブルがあれば利用
    let recordings = [];
    try {
      if (prisma && prisma.recording && typeof prisma.recording.findMany === 'function') {
        recordings = await prisma.recording.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                plan: true
              }
            }
          }
        });
        // BigInt を数値に変換
        recordings = recordings.map(r => {
          const sizeBytes = r.sizeBytes != null
            ? Number(r.sizeBytes)
            : 0;

          return {
            ...r,
            sizeBytes,
            duration: Number(r.duration),
            user: r.user ? {
              id: r.user.id,
              username: r.user.username,
              plan: r.user.plan
            } : null
          };
        });
      } else {
        // フォールバック: filesystem の /opt/streamingserver/recordings を走査
        const recordingsDir = path.join(__dirname, '../../recordings');
        if (fs.existsSync(recordingsDir)) {
          const files = fs.readdirSync(recordingsDir);
          recordings = files.map(f => {
            const stat = fs.statSync(path.join(recordingsDir, f));
            return {
              filename: f,
              size: stat.size,
              createdAt: stat.mtime
            };
          }).sort((a,b) => b.createdAt - a.createdAt);
        }
      }
    } catch (e) {
      console.error('[Admin] recordings: error fetching', e);
    }

    res.json({ success: true, recordings: Array.isArray(recordings) ? recordings : [] });
  } catch (error) {
    console.error('[Admin] Get recordings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/recordings/:id/play', authenticate, adminOnly, async (req, res) => {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: req.params.id }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    await recordingService.streamRecordingToResponse(recording, req, res, {
      enforceQuota: false
    });
  } catch (error) {
    console.error('[Admin] Play recording error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream recording' });
    } else {
      res.end();
    }
  }
});

// システム統計を取得（管理者のみ）
router.get('/stats', authenticate, adminOnly, async (req, res) => {
  try {
    // 基本統計
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({
      where: { isActive: true }
    });

    // プラン別ユーザー数
    const usersByPlan = await prisma.user.groupBy({
      by: ['plan'],
      _count: {
        plan: true
      }
    });

    // ロール別ユーザー数
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: {
        role: true
      }
    });

    // 総使用容量を計算
    const quotas = await prisma.quota.findMany({
      select: {
        recordingUsedBytes: true,
        streamingUsedBytes: true,
        viewingUsedBytes: true
      }
    });

    let totalRecordingUsed = 0;
    let totalStreamingUsed = 0;
    let totalViewingUsed = 0;

    quotas.forEach(q => {
      totalRecordingUsed += Number(q.recordingUsedBytes);
      totalStreamingUsed += Number(q.streamingUsedBytes);
      totalViewingUsed += Number(q.viewingUsedBytes ?? 0);
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        usersByPlan: usersByPlan.map(p => ({
          plan: p.plan,
          count: p._count.plan
        })),
        usersByRole: usersByRole.map(r => ({
          role: r.role,
          count: r._count.role
        })),
        storage: {
          totalRecordingUsed,
          totalStreamingUsed,
          totalViewingUsed,
          totalRecordingUsedGB: (totalRecordingUsed / (1024 ** 3)).toFixed(2),
          totalStreamingUsedGB: (totalStreamingUsed / (1024 ** 3)).toFixed(2),
          totalViewingUsedGB: (totalViewingUsed / (1024 ** 3)).toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('[Admin] Get stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// システムログを取得（管理者のみ）
router.get('/logs', authenticate, adminOnly, async (req, res) => {
  try {
    const { limit = 100, level, category } = req.query;

    const where = {};
    if (level) where.level = level;
    if (category) where.category = category;

    const logs = await prisma.systemLog.findMany({
      where,
      orderBy: {
        timestamp: 'desc'
      },
      take: parseInt(limit)
    });

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[Admin] Get logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
