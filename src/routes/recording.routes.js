const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const prisma = require('../db');
const recordingService = require('../services/recording.service');

const router = express.Router();

// Get user's recordings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const recordings = await prisma.recording.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json(recordings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recording by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const recording = await prisma.recording.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(recording);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete recording
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const recording = await prisma.recording.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Delete from S3
    const recordingService = require('../services/recording.service');
    await recordingService.deleteFromS3(recording.s3Key);

    // Update quota
    await prisma.quota.update({
      where: { userId: req.user.id },
      data: {
        recordingUsedBytes: {
          decrement: recording.sizeBytes
        }
      }
    });

    // Delete from DB
    await prisma.recording.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Recording deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recording MP4 URL (proxy to S3)
router.get('/:id/play', authMiddleware, async (req, res) => {
  try {
    const recording = await prisma.recording.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    await recordingService.streamRecordingToResponse(recording, req, res, {
      viewerId: req.user.id,
      enforceQuota: true
    });
  } catch (error) {
    console.error('[Recording] Play error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream recording' });
    } else {
      res.end();
    }
  }
});

module.exports = router;
