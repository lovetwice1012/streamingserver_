const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth.middleware');
const quotaService = require('../services/quota.service');
const streamingService = require('../services/streaming.service');
const rtspService = require('../services/rtsp.service');

const router = express.Router();

const removeTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const sanitizePathSegment = (value = '') => value.toString().replace(/^\/+|\/+$/g, '');
const normalizePlaybackPath = (value = '') => {
  if (!value) return '';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  const normalized = withSlash.replace(/\/+/g, '/');
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
};
const resolveDefaultAppName = () => {
  const raw = process.env.STREAM_DEFAULT_APP_NAME;
  if (raw === undefined || raw === null) {
    return 'live';
  }
  return raw.toString().trim();
};

const shouldOmitPort = (protocol, port) => {
  const numeric = Number(port);
  if (!numeric) return true;
  if (protocol === 'http' && numeric === 80) return true;
  if (protocol === 'https' && numeric === 443) return true;
  if (protocol === 'rtmp' && numeric === 1935) return true;
  if (protocol === 'rtmps' && numeric === 443) return true;
  if (protocol === 'rtsp' && numeric === 554) return true;
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
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedPortHeader = req.headers['x-forwarded-port'];

    const hostHeader = forwardedHost
      ? forwardedHost.split(',')[0].trim()
      : (req.headers.host || '');
    const hostFromRequest = hostHeader.split(':')[0] || 'localhost';
    const protocolFromRequest = (
      forwardedProto
        ? forwardedProto.split(',')[0].trim()
        : (req.protocol || '')
    ).toLowerCase() || 'http';
    const portFromRequest = forwardedPortHeader
      ? forwardedPortHeader.split(',')[0].trim()
      : undefined;

    const ingestBaseOverride = removeTrailingSlash(process.env.STREAM_INGEST_BASE_URL);
    const playbackBaseOverride = removeTrailingSlash(process.env.STREAM_PLAYBACK_BASE_URL);
    const rtspBaseOverride = removeTrailingSlash(process.env.STREAM_RTSP_BASE_URL);

    const ingestProtocol = (process.env.STREAM_INGEST_PROTOCOL || 'rtmp').toLowerCase();
    const playbackProtocol = (
      process.env.STREAM_PLAYBACK_PROTOCOL || protocolFromRequest || 'http'
    ).toLowerCase();
    const rtspProtocol = (process.env.STREAM_RTSP_PROTOCOL || 'rtsp').toLowerCase();

    const ingestHost = process.env.STREAM_INGEST_HOST || process.env.DOMAIN || hostFromRequest;
    const playbackHost = process.env.STREAM_PLAYBACK_HOST || process.env.DOMAIN || hostFromRequest;
    const rtspHost = process.env.STREAM_RTSP_HOST || process.env.DOMAIN || hostFromRequest;

    const ingestPort = process.env.STREAM_INGEST_PORT || process.env.RTMP_PORT || 1935;
    const playbackPort = (
      process.env.STREAM_PLAYBACK_PORT
      || portFromRequest
      || (playbackProtocol === 'https'
        ? 443
        : (process.env.HTTP_FLV_PORT || 8000))
    );
    const rtspPort = process.env.STREAM_RTSP_PORT || process.env.MEDIAMTX_RTSP_PORT || 8554;

    const ingestPortPart = shouldOmitPort(ingestProtocol, ingestPort) ? '' : `:${ingestPort}`;
    const playbackPortPart = shouldOmitPort(playbackProtocol, playbackPort) ? '' : `:${playbackPort}`;
    const rtspPortPart = shouldOmitPort(rtspProtocol, rtspPort) ? '' : `:${rtspPort}`;

    const ingestBase = ingestBaseOverride || `${ingestProtocol}://${ingestHost}${ingestPortPart}`;
    const playbackBase = playbackBaseOverride || `${playbackProtocol}://${playbackHost}${playbackPortPart}`;
    const rtspBase = rtspBaseOverride || `${rtspProtocol}://${rtspHost}${rtspPortPart}`;

    const streamKey = user.streamKey;
    const ingestAppName = sanitizePathSegment(resolveDefaultAppName());
    const ingestUrl = ingestAppName ? `${ingestBase}/${ingestAppName}` : ingestBase;
    const normalizedIngestUrl = ingestUrl.replace(/([^:]\/)\/+/g, '$1');
    const ingestFullUrl = `${normalizedIngestUrl}/${streamKey}`.replace(/([^:]\/)\/+/g, '$1');

    const rtspPath = rtspService.getLivePlaybackPath(streamKey);
    const rtspUrl = `${rtspBase}${rtspPath}`;

    const session = await streamingService.getSessionForUser(user.id);

    const sessionPath = session?.streamPath;
    const normalizedSessionPath = sessionPath && sessionPath.toString().trim().length > 0
      ? normalizePlaybackPath(sessionPath)
      : null;

    const fallbackAppName = resolveDefaultAppName();
    const activeAppName = (
      session && typeof session.appName === 'string' && session.appName.trim().length > 0
    )
      ? session.appName
      : fallbackAppName;
    const sanitizedActiveAppName = sanitizePathSegment(activeAppName);
    const fallbackStreamPathRaw = `${sanitizedActiveAppName ? `/${sanitizedActiveAppName}` : ''}/${streamKey || ''}`;
    const fallbackStreamPathNormalized = normalizePlaybackPath(fallbackStreamPathRaw);
    const fallbackStreamPath = fallbackStreamPathNormalized || (streamKey ? `/${streamKey}` : '/');
    const playbackStreamPath = normalizedSessionPath || fallbackStreamPath;
    const hlsUrl = `${playbackBase}${playbackStreamPath}/index.m3u8`.replace(/([^:]\/)\/+/g, '$1');
    const flvUrl = `${playbackBase}${playbackStreamPath}.flv`.replace(/([^:]\/)\/+/g, '$1');

    const quota = await quotaService.getQuotaStatus(user.id);
    const quotaPayload = quotaService.formatQuotaResponse(quota);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        plan: user.plan,
        streamKey
      },
      ingest: {
        baseUrl: normalizedIngestUrl,
        fullUrl: ingestFullUrl,
        host: ingestHost,
        protocol: ingestProtocol,
        port: Number(ingestPort)
      },
      playback: {
        hls: hlsUrl,
        flv: flvUrl,
        rtsp: {
          url: rtspUrl,
          host: rtspHost,
          protocol: rtspProtocol,
          port: Number(rtspPort),
          path: rtspPath
        },
        streamPath: playbackStreamPath,
        activeAppName: session ? (session.appName || null) : null,
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
