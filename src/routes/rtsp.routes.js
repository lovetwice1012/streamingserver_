const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const rtspService = require('../services/rtsp.service');

const router = express.Router();

// Start RTSP proxy for live stream
router.post('/live/:streamKey', authMiddleware, async (req, res) => {
  try {
    const { streamKey } = req.params;
    const { port } = req.body;

    if (!port) {
      return res.status(400).json({ error: 'Port is required' });
    }

    const stream = rtspService.startLiveRTSP(streamKey, port);
    
    res.json({
      message: 'RTSP proxy started',
      streamKey,
      port,
      rtspUrl: `rtsp://localhost:${port}/live/${streamKey}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start RTSP proxy for VOD recording
router.post('/vod/:recordingId', authMiddleware, async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { port } = req.body;

    if (!port) {
      return res.status(400).json({ error: 'Port is required' });
    }

    const stream = await rtspService.startVODRTSP(recordingId, port);
    
    res.json({
      message: 'RTSP VOD proxy started',
      recordingId,
      port,
      rtspUrl: `rtsp://localhost:${port}/vod/${recordingId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop RTSP stream
router.delete('/:streamId', authMiddleware, (req, res) => {
  try {
    const { streamId } = req.params;
    rtspService.stopRTSP(streamId);
    
    res.json({ message: 'RTSP stream stopped', streamId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active RTSP streams
router.get('/active', authMiddleware, (req, res) => {
  try {
    const streams = rtspService.getActiveStreams();
    res.json({ streams });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
