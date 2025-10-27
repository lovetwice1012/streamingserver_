const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth.middleware');
const quotaService = require('../services/quota.service');
const streamingService = require('../services/streaming.service');

const router = express.Router();

const removeTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const shouldOmitPort = (protocol, port) => {
  const numeric = Number(port);
  if (!numeric) return true;
  if (protocol === 'http' && numeric === 80) return true;
  if (protocol === 'https' && numeric === 443) return true;
  if (protocol === 'rtmp' && numeric === 1935) return true;
  if (protocol === 'rtmps' && numeric === 443) return true;
  return false;
};

router.get('/info', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        streamKey: true,
        plan: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const forwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = forwardedHost
      ? forwardedHost.split(',')[0].trim()
      : (req.headers.host || '');
    const hostFromRequest = hostHeader.split(':')[0] || 'localhost';

    const ingestBaseOverride = removeTrailingSlash(process.env.STREAM_INGEST_BASE_URL);
    const playbackBaseOverride = removeTrailingSlash(process.env.STREAM_PLAYBACK_BASE_URL);

    const ingestProtocol = (process.env.STREAM_INGEST_PROTOCOL || 'rtmp').toLowerCase();
    const playbackProtocol = (process.env.STREAM_PLAYBACK_PROTOCOL || 'http').toLowerCase();

    const ingestHost = process.env.STREAM_INGEST_HOST || process.env.DOMAIN || hostFromRequest;
    const playbackHost = process.env.STREAM_PLAYBACK_HOST || process.env.DOMAIN || hostFromRequest;

    const ingestPort = process.env.STREAM_INGEST_PORT || process.env.RTMP_PORT || 1935;
    const playbackPort = process.env.STREAM_PLAYBACK_PORT || process.env.HTTP_FLV_PORT || 8000;

    const ingestPortPart = shouldOmitPort(ingestProtocol, ingestPort) ? '' : `:${ingestPort}`;
    const playbackPortPart = shouldOmitPort(playbackProtocol, playbackPort) ? '' : `:${playbackPort}`;

    const ingestBase = ingestBaseOverride || `${ingestProtocol}://${ingestHost}${ingestPortPart}`;
    const playbackBase = playbackBaseOverride || `${playbackProtocol}://${playbackHost}${playbackPortPart}`;

    const streamKey = user.streamKey;
    const ingestUrl = `${ingestBase}/live`;
    const ingestFullUrl = `${ingestUrl}/${streamKey}`;

    const hlsUrl = `${playbackBase}/live/${streamKey}/index.m3u8`;
    const flvUrl = `${playbackBase}/live/${streamKey}.flv`;

    const quota = await quotaService.getQuotaStatus(user.id);
    const quotaPayload = quotaService.formatQuotaResponse(quota);

    const session = await streamingService.getSessionForUser(user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        plan: user.plan,
        streamKey
      },
      ingest: {
        baseUrl: ingestUrl,
        fullUrl: ingestFullUrl,
        host: ingestHost,
        protocol: ingestProtocol,
        port: Number(ingestPort)
      },
      playback: {
        hls: hlsUrl,
        flv: flvUrl,
        host: playbackHost,
        protocol: playbackProtocol,
        port: Number(playbackPort)
      },
      session,
      quota: quotaPayload
    });
  } catch (error) {
    console.error('[Streaming] info route error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch streaming info' });
  }
});

module.exports = router;
