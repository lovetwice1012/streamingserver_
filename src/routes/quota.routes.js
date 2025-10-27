const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const quotaService = require('../services/quota.service');

const router = express.Router();

// Get quota status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const quota = await quotaService.getQuotaStatus(req.user.id);
    
    if (!quota) {
      return res.status(404).json({ error: 'Quota not found' });
    }

    const recordingUsed = Number(quota.recordingUsedBytes);
    const recordingLimit = Number(quota.recordingLimitBytes);
    const streamingUsed = Number(quota.streamingUsedBytes);
    const streamingLimit = Number(quota.streamingLimitBytes);
    const viewingUsed = Number(quota.viewingUsedBytes ?? 0n);
    const viewingLimit = Number(quota.viewingLimitBytes ?? quota.streamingLimitBytes);

    const toPercent = (used, limit) => {
      if (!limit || limit <= 0) return '0.00';
      return ((used / limit) * 100).toFixed(2);
    };

    res.json({
      recording: {
        used: quota.recordingUsedBytes.toString(),
        limit: quota.recordingLimitBytes.toString(),
        usedGB: recordingUsed / (1024 ** 3),
        limitGB: recordingLimit / (1024 ** 3),
        percentUsed: toPercent(recordingUsed, recordingLimit)
      },
      streaming: {
        used: quota.streamingUsedBytes.toString(),
        limit: quota.streamingLimitBytes.toString(),
        usedGB: streamingUsed / (1024 ** 3),
        limitGB: streamingLimit / (1024 ** 3),
        percentUsed: toPercent(streamingUsed, streamingLimit),
        resetAt: quota.streamingResetAt
      },
      viewing: {
        used: (quota.viewingUsedBytes ?? 0n).toString(),
        limit: (quota.viewingLimitBytes ?? quota.streamingLimitBytes).toString(),
        usedGB: viewingUsed / (1024 ** 3),
        limitGB: viewingLimit / (1024 ** 3),
        percentUsed: toPercent(viewingUsed, viewingLimit),
        resetAt: quota.viewingResetAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
