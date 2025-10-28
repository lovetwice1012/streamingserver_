const NodeMediaServer = require('node-media-server');
const path = require('path');
const fs = require('fs');
const authService = require('./auth.service');
const quotaService = require('./quota.service');
const recordingService = require('./recording.service');
const discordService = require('./discord.service');
const websocketService = require('./websocket.service');
const rtspService = require('./rtsp.service');
const prisma = require('../db');
const { ensureFFmpegAvailable } = require('../utils/ffmpeg');

const DEFAULT_FFMPEG_BINARY = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

class StreamingService {
  constructor() {
    this.activeSessions = new Map(); // streamKey -> { user, startTime, bytesStreamed, bytesDelivered, viewerSessions, session, ... }
    this.nms = null;
    this.ffmpegPath = null;
  }

  extractStreamDetails(source) {
    let streamKey = null;
    let appName = null;
    let rawPath = null;

    if (source && typeof source === 'object') {
      const session = source;
      streamKey = session.streamName ?? session.streamKey ?? null;
      appName = session.streamApp ?? session.appName ?? null;
      rawPath = session.streamPath ?? session.publishStreamPath ?? session.playStreamPath ?? null;

      if (!rawPath && (appName || streamKey)) {
        const prefix = appName ? `/${appName}` : '';
        rawPath = `${prefix}/${streamKey ?? ''}`;
      }
    } else {
      rawPath = source;
    }

    if (typeof rawPath === 'string' && rawPath.length > 0) {
      const parts = rawPath.split('/').filter(Boolean);
      if (parts.length > 0) {
        const lastSegment = parts[parts.length - 1];
        if (!streamKey) {
          streamKey = lastSegment || null;
          parts.pop();
        } else if (streamKey === lastSegment) {
          parts.pop();
        }
        if (!appName && parts.length > 0) {
          appName = parts.join('/');
        }
      }
    }

    if (typeof streamKey === 'string') {
      streamKey = streamKey.replace(/^\/+|\/+$/g, '') || null;
    }
    if (typeof appName === 'string') {
      appName = appName.replace(/^\/+|\/+$/g, '') || null;
    }

    const streamPath = this.normalizeStreamPath(appName, streamKey, rawPath);

    return { streamKey, appName, streamPath };
  }

  normalizeStreamPath(appName, streamKey, rawPath) {
    let candidate = null;

    if (typeof rawPath === 'string' && rawPath.length > 0) {
      candidate = rawPath;
    } else if (streamKey) {
      const prefix = appName ? `/${appName}` : '';
      candidate = `${prefix}/${streamKey}`;
    }

    if (!candidate) {
      return null;
    }

    const withLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;
    const normalized = withLeadingSlash.replace(/\/+/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      return normalized.slice(0, -1);
    }
    return normalized;
  }

  getDefaultAppName() {
    const raw = process.env.STREAM_DEFAULT_APP_NAME;
    if (raw === undefined || raw === null) {
      return 'live';
    }
    const trimmed = raw.toString().trim();
    if (trimmed.length === 0) {
      return '';
    }
    return trimmed.replace(/^\/+|\/+$/g, '');
  }

  init() {
    const mediaRoot = path.join(__dirname, '../../media');
    const recordingsPath = path.join(__dirname, '../../recordings');
    [mediaRoot, path.join(mediaRoot, 'live'), recordingsPath].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    this.ffmpegPath = ensureFFmpegAvailable({ logger: console }) || DEFAULT_FFMPEG_BINARY;

    const config = {
      logType: 3,
      rtmp: {
        port: parseInt(process.env.RTMP_PORT) || 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
      },
      http: {
        port: parseInt(process.env.HTTP_FLV_PORT) || 8000,
        mediaroot: mediaRoot,
        allow_origin: '*'
      },
      trans: {
        ffmpeg: this.ffmpegPath,
        tasks: [
          {
            app: 'live',
            hls: true,
            hlsFlags: '[hls_time=2:hls_list_size=3:hls_flags=delete_segments]',
            hlsKeep: true,
            dash: false,
            mediaroot: mediaRoot
          }
        ]
      }
    };

    this.nms = new NodeMediaServer(config);
    this.setupEventHandlers();
    console.log(`[Stream] MediaRoot: ${mediaRoot}`);
    console.log(`[Stream] Recordings: ${recordingsPath}`);
    return this.nms;
  }

  setupEventHandlers() {
    const self = this;

    const resolveNativeSession = (id) => {
      if (!id || !self.nms || typeof self.nms.getSession !== 'function') {
        return null;
      }
      try {
        return self.nms.getSession(id) || null;
      } catch (err) {
        console.debug('[Stream] Failed to resolve session for id:', id, err?.message || err);
        return null;
      }
    };

    const ensureClose = (session) => {
      if (!session || typeof session !== 'object') {
        return session;
      }
      if (typeof session.close === 'function') {
        return session;
      }
      session.close = () => {
        try {
          if (typeof session.stop === 'function') {
            session.stop();
          } else if (typeof session.reject === 'function') {
            session.reject();
          } else if (session.id) {
            const native = resolveNativeSession(session.id);
            native?.stop?.();
            native?.reject?.();
          }
        } catch (error) {
          console.error('[Stream] Failed to close session gracefully:', error);
        }
      };
      return session;
    };

    const normalize = function(args) {
      // args can be (sessionObject) OR (id, StreamPath, args)
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        const sessionObject = ensureClose(args[0]);
        if (!sessionObject.streamPath && args[1]) {
          sessionObject.streamPath = args[1];
        }
        return sessionObject;
      }

      const id = args[0];
      const StreamPath = args[1];
      const nativeSession = resolveNativeSession(id);
      if (nativeSession) {
        if (!nativeSession.streamPath) {
          nativeSession.streamPath = StreamPath;
        }
        return ensureClose(nativeSession);
      }

      return ensureClose({
        id,
        streamPath: StreamPath
      });
    };

    this.nms.on('prePublish', async (...args) => {
      const session = normalize(args);
      try { await this.handlePrePublish(session); } catch (e) { console.error(e); }
    });

    this.nms.on('postPublish', async (...args) => {
      const session = normalize(args);
      try { await this.handlePostPublish(session); } catch (e) { console.error(e); }
    });

    this.nms.on('donePublish', async (...args) => {
      const session = normalize(args);
      try { await this.handleDonePublish(session); } catch (e) { console.error(e); }
    });

    this.nms.on('prePlay', async (...args) => {
      const session = normalize(args);
      try { await this.handlePrePlay(session); } catch (e) { console.error(e); }
    });

    this.nms.on('postPlay', async (...args) => {
      const session = normalize(args);
      try { await this.handlePostPlay(session); } catch (e) { console.error(e); }
    });

    this.nms.on('donePlay', async (...args) => {
      const session = normalize(args);
      try { await this.handleDonePlay(session); } catch (e) { console.error(e); }
    });
  }

  async handlePrePublish(session) {
    try {
      const { streamKey, appName, streamPath } = this.extractStreamDetails(session);
      if (!streamKey || !streamPath) {
        console.error('[Stream] Pre-publish error: unable to determine stream key or path');
        session?.close?.();
        return;
      }

      const user = await authService.getUserByStreamKey(streamKey);
      if (!user) {
        console.log(`[Stream] Authentication failed for key: ${streamKey}`);
        session?.close?.();
        return;
      }

      const quotaStatus = await quotaService.getQuotaStatus(user.id);
      if (quotaStatus.streamingUsedBytes >= quotaStatus.streamingLimitBytes) {
        console.log(`[Stream] Quota exceeded for user: ${user.username}`);
        session?.close?.();
        if (discordService?.sendQuotaAlert) {
          await discordService.sendQuotaAlert({
            username: user.username,
            quotaType: 'streaming',
            used: quotaStatus.streamingUsedBytes,
            limit: quotaStatus.streamingLimitBytes
          });
        }
        return;
      }

      console.log(`[Stream] Pre-publish accepted for user: ${user.username}`);

      // store minimal session info; actual session object may be attached later on postPublish
      this.activeSessions.set(streamKey, {
        id: session.id,
        session,
        user,
        startTime: new Date(),
        bytesStreamed: 0n,
        bytesDelivered: 0n,
        sessionId: null,
        quotaInterval: null,
        viewerSessions: new Map(),
        viewerQuotaExceeded: false,
        status: 'live',
        streamKey,
        appName: appName || null,
        streamPath
      });

    } catch (error) {
      console.error('[Stream] Pre-publish error:', error);
      session?.close?.();
    }
  }

  async handlePostPublish(session) {
    try {
      const { streamKey, appName, streamPath } = this.extractStreamDetails(session);
      if (!streamKey || !streamPath) { session?.close?.(); return; }

      let sessionInfo = this.activeSessions.get(streamKey);

      if (!sessionInfo) {
        sessionInfo = {
          id: session.id ?? null,
          session,
          user: null,
          startTime: new Date(),
          bytesStreamed: 0n,
          bytesDelivered: 0n,
          sessionId: null,
          quotaInterval: null,
          viewerSessions: new Map(),
          viewerQuotaExceeded: false,
          status: 'live',
          streamKey,
          appName: appName || null,
          streamPath
        };
      } else {
        if (!sessionInfo.viewerSessions) {
          sessionInfo.viewerSessions = new Map();
        }
        sessionInfo.startTime = sessionInfo.startTime || new Date();
      }

      sessionInfo.session = session;
      sessionInfo.id = session.id ?? sessionInfo.id;
      sessionInfo.streamKey = streamKey;
      sessionInfo.appName = sessionInfo.appName || appName || null;
      sessionInfo.streamPath = streamPath;

      sessionInfo = await this.ensureSessionUser(sessionInfo, streamKey);
      if (!sessionInfo?.user) {
        console.error(`[Stream] Post-publish error: user not found for key ${streamKey}`);
        session?.close?.();
        return;
      }

      this.activeSessions.set(streamKey, sessionInfo);

      // DB create stream session
      const streamSession = await prisma.streamSession.create({
        data: { userId: sessionInfo.user.id, streamKey, status: 'live', bytesDelivered: 0n }
      });
      sessionInfo.sessionId = streamSession.id;
      this.activeSessions.set(streamKey, sessionInfo);

      // start recording if available (recordingService should handle missing implementation)
      if (recordingService?.startRecording) {
        await recordingService.startRecording(streamKey, sessionInfo.user, { appName: sessionInfo.appName });
      }

      // start quota monitoring
      this.startQuotaMonitoring(streamKey);

      try {
        const restream = rtspService.startLiveRestream(streamKey, { appName: sessionInfo.appName });
        if (restream?.outputUrl) {
          console.log(`[Stream] RTSP restream publishing to ${restream.outputUrl}`);
        }
      } catch (restreamError) {
        console.error(`[Stream] Failed to start RTSP restream for ${streamKey}:`, restreamError);
      }

      if (discordService?.sendStreamStart) {
        await discordService.sendStreamStart({ username: sessionInfo.user.username, streamKey });
      }

      console.log(`[Stream] Post-publish for user: ${sessionInfo.user.username}`);
    } catch (error) {
      console.error('[Stream] Post-publish error:', error);
      session?.close?.();
    }
  }

  async handleDonePublish(session) {
    try {
      const { streamKey } = this.extractStreamDetails(session);
      if (!streamKey) return;
      let sessionInfo = this.activeSessions.get(streamKey);
      if (!sessionInfo) return;

      sessionInfo = await this.ensureSessionUser(sessionInfo, streamKey) || sessionInfo;
      const user = sessionInfo?.user;
      const username = user?.username || streamKey;

      // take latest bytes if available on stored session object
      let publishSession = sessionInfo.session;
      if (!publishSession || publishSession.inBytes === undefined) {
        const native = this.getNodeMediaSession(sessionInfo.id || session?.id);
        if (native) {
          publishSession = native;
          sessionInfo.session = native;
        }
      }

      if (publishSession && publishSession.inBytes !== undefined) {
        sessionInfo.bytesStreamed = BigInt(publishSession.inBytes);
      }

      if (sessionInfo.quotaInterval) {
        clearInterval(sessionInfo.quotaInterval);
        sessionInfo.quotaInterval = null;
      }

      // flush any remaining viewer usage before closing
      if (sessionInfo.viewerSessions && sessionInfo.viewerSessions.size > 0 && !sessionInfo.viewerQuotaExceeded) {
        try {
          await this.updateViewingUsage(sessionInfo);
        } catch (err) {
          console.error('[Stream] Failed to update viewing usage on donePublish:', err);
        }
      }

      if (sessionInfo.viewerSessions) {
        sessionInfo.viewerSessions.clear();
      }

      const finalStatus = sessionInfo.status && sessionInfo.status !== 'live' ? sessionInfo.status : 'stopped';

      if (sessionInfo.sessionId) {
        await prisma.streamSession.update({
          where: { id: sessionInfo.sessionId },
          data: {
            status: finalStatus,
            endedAt: new Date(),
            bytesStreamed: sessionInfo.bytesStreamed,
            bytesDelivered: sessionInfo.bytesDelivered ?? 0n
          }
        }).catch(err => console.error('[Stream] Failed to update stream session on donePublish:', err));
      }

      if (recordingService?.stopRecording) await recordingService.stopRecording(streamKey);
      rtspService.stopLiveRestream(streamKey);

      if (user && discordService?.sendStreamStop) {
        await discordService.sendStreamStop({
          username,
          streamKey,
          duration: Math.floor((new Date() - sessionInfo.startTime) / 1000),
          bytesStreamed: sessionInfo.bytesStreamed,
          bytesDelivered: sessionInfo.bytesDelivered ?? 0n
        });
      }

      console.log(`[Stream] Done-publish for user: ${username}`);
      if (user?.id) {
        websocketService.emitQuotaUpdate(user.id).catch(err => {
          console.error('[Stream] Failed to emit quota update on donePublish:', err);
        });
      }
      this.activeSessions.delete(streamKey);
    } catch (error) {
      console.error('[Stream] Done-publish error:', error);
    }
  }

  async handlePrePlay(session) {
    try {
      const { streamKey, appName, streamPath } = this.extractStreamDetails(session);
      if (!streamKey) {
        session?.close?.();
        return;
      }

      let sessionInfo = this.activeSessions.get(streamKey);
      const user = sessionInfo?.user ?? await authService.getUserByStreamKey(streamKey);

      if (!user) {
        console.error(`[Stream] Pre-play error: user not found for key ${streamKey}`);
        session?.close?.();
        return;
      }

      if (!sessionInfo) {
        sessionInfo = {
          id: null,
          session: null,
          user,
          startTime: new Date(),
          bytesStreamed: 0n,
          bytesDelivered: 0n,
          sessionId: null,
          quotaInterval: null,
          viewerSessions: new Map(),
          viewerQuotaExceeded: false,
          status: 'live',
          streamKey,
          appName: appName || null,
          streamPath
        };
        this.activeSessions.set(streamKey, sessionInfo);
      } else {
        sessionInfo.appName = sessionInfo.appName || appName || null;
        sessionInfo.streamPath = sessionInfo.streamPath || streamPath || sessionInfo.streamPath;
      }

      if (sessionInfo.viewerQuotaExceeded) {
        console.log(`[Stream] Viewing quota exceeded, rejecting viewer for: ${user.username}`);
        session?.close?.();
        return;
      }

      const quota = await quotaService.getQuotaStatus(user.id);
      const viewingLimit = quota.viewingLimitBytes ?? quota.streamingLimitBytes ?? 0n;

      if (viewingLimit > 0n && quota.viewingUsedBytes >= viewingLimit) {
        console.log(`[Stream] Viewing quota already exhausted for user: ${user.username}`);
        sessionInfo.viewerQuotaExceeded = true;
        sessionInfo.status = 'viewing_quota_exceeded';
        session?.close?.();
        if (sessionInfo.sessionId) {
          await prisma.streamSession.update({
            where: { id: sessionInfo.sessionId },
            data: { status: 'viewing_quota_exceeded' }
          }).catch(err => console.error('[Stream] Failed to update stream session status (pre-play):', err));
        }
        if (discordService?.sendQuotaAlert) {
          discordService.sendQuotaAlert({
            username: user.username,
            quotaType: 'viewing',
            action: 'viewer_rejected_limit_reached'
          }).catch(err => console.error('[Stream] Discord quota alert failed:', err));
        }
        return;
      }
    } catch (error) {
      console.error('[Stream] Pre-play error:', error);
      session?.close?.();
    }
  }

  async handlePostPlay(session) {
    try {
      const { streamKey, appName, streamPath } = this.extractStreamDetails(session);
      if (!streamKey) return;

      let sessionInfo = this.activeSessions.get(streamKey);
      if (!sessionInfo || sessionInfo.viewerQuotaExceeded) {
        session?.close?.();
        return;
      }

      sessionInfo = await this.ensureSessionUser(sessionInfo, streamKey);
      if (!sessionInfo?.user) {
        session?.close?.();
        return;
      }

      if (!sessionInfo.viewerSessions) {
        sessionInfo.viewerSessions = new Map();
      }

      sessionInfo.appName = sessionInfo.appName || appName || null;
      sessionInfo.streamPath = sessionInfo.streamPath || streamPath || sessionInfo.streamPath;

      sessionInfo.viewerSessions.set(session.id, {
        id: session.id,
        session,
        lastOutBytes: BigInt(session.outBytes ?? 0)
      });

      console.log(`[Stream] Viewer connected for ${sessionInfo.user.username}. Active viewers: ${sessionInfo.viewerSessions.size}`);
    } catch (error) {
      console.error('[Stream] Post-play error:', error);
      session?.close?.();
    }
  }

  async handleDonePlay(session) {
    try {
      const { streamKey } = this.extractStreamDetails(session);
      if (!streamKey) return;

      const sessionInfo = this.activeSessions.get(streamKey);
      if (!sessionInfo || !sessionInfo.viewerSessions) return;

      const viewerRecord = sessionInfo.viewerSessions.get(session.id);
      if (!viewerRecord) return;

      // update reference in case session object changed
      viewerRecord.session = session;
      sessionInfo.viewerSessions.set(session.id, viewerRecord);

      await this.updateViewingUsage(sessionInfo, { viewerIds: [session.id] });
      sessionInfo.viewerSessions.delete(session.id);

      console.log(`[Stream] Viewer disconnected for ${sessionInfo.user.username}. Active viewers: ${sessionInfo.viewerSessions.size}`);
    } catch (error) {
      console.error('[Stream] Done-play error:', error);
    }
  }

  getNodeMediaSession(id) {
    if (!id || !this.nms || typeof this.nms.getSession !== 'function') {
      return null;
    }
    try {
      return this.nms.getSession(id) || null;
    } catch (error) {
      console.debug('[Stream] Failed to acquire NodeMedia session:', error?.message || error);
      return null;
    }
  }

  startQuotaMonitoring(streamKey) {
    const sessionInfo = this.activeSessions.get(streamKey);
    if (!sessionInfo) return;

    if (sessionInfo.quotaInterval) {
      clearInterval(sessionInfo.quotaInterval);
    }

    sessionInfo.quotaInterval = setInterval(async () => {
      try {
        if (!sessionInfo.session) {
          clearInterval(sessionInfo.quotaInterval);
          sessionInfo.quotaInterval = null;
          return;
        }

        await this.processStreamingUsage(sessionInfo);

        if (!sessionInfo.viewerQuotaExceeded) {
          await this.updateViewingUsage(sessionInfo);
        }
      } catch (error) {
        console.error('[Stream] Quota monitoring error:', error);
      }
    }, 10000);
  }

  async processStreamingUsage(sessionInfo) {
    let session = sessionInfo.session;
    if (!session || session.inBytes === undefined) {
      const native = this.getNodeMediaSession(sessionInfo.id || session?.id);
      if (native) {
        session = native;
        sessionInfo.session = native;
        sessionInfo.id = native.id ?? sessionInfo.id;
      }
    }

    if (!session) {
      return { bytesAdded: 0n, quota: null };
    }

    sessionInfo = await this.ensureSessionUser(sessionInfo, sessionInfo.streamKey) || sessionInfo;
    if (!sessionInfo?.user?.id) {
      console.error(`[Stream] Streaming quota update skipped: missing user for stream ${sessionInfo.streamKey}`);
      return { bytesAdded: 0n, quota: null };
    }

    const newBytes = BigInt(session.inBytes ?? 0);
    const previous = sessionInfo.bytesStreamed ?? 0n;
    const bytesAdded = newBytes - previous;

    if (bytesAdded <= 0n) {
      sessionInfo.bytesStreamed = newBytes;
      return { bytesAdded: 0n, quota: null };
    }

    let quotaResult;
    try {
      quotaResult = await quotaService.checkAndUpdateStreamingQuota(sessionInfo.user.id, bytesAdded);
    } catch (error) {
      console.error('[Stream] Streaming quota update error:', error);
      return { bytesAdded: 0n, quota: null };
    }

    sessionInfo.bytesStreamed = newBytes;

    if (!quotaResult?.allowed && sessionInfo.status !== 'quota_exceeded') {
      console.log(`[Stream] Streaming quota exceeded, terminating stream for: ${sessionInfo.user.username}`);
      session?.close?.();
      sessionInfo.status = 'quota_exceeded';
      if (sessionInfo.sessionId) {
        await prisma.streamSession.update({
          where: { id: sessionInfo.sessionId },
          data: { status: 'quota_exceeded' }
        }).catch(err => console.error('[Stream] Failed to update stream session status:', err));
      }
      if (discordService?.sendQuotaAlert) {
        discordService.sendQuotaAlert({
          username: sessionInfo.user.username,
          quotaType: 'streaming',
          action: 'stream_terminated'
        }).catch(err => console.error('[Stream] Discord quota alert failed:', err));
      }
      if (sessionInfo.quotaInterval) {
        clearInterval(sessionInfo.quotaInterval);
        sessionInfo.quotaInterval = null;
      }
    }

    if (quotaResult && sessionInfo?.user?.id) {
      websocketService.emitQuotaUpdate(sessionInfo.user.id).catch(err => {
        console.error('[Stream] Failed to emit streaming quota update:', err);
      });
    }

    return { bytesAdded, quota: quotaResult };
  }

  async updateViewingUsage(sessionInfo, options = {}) {
    const { viewerIds = null, enforceQuota = true } = options;

    if (!sessionInfo.viewerSessions || sessionInfo.viewerSessions.size === 0) {
      return { increment: 0n, quota: null };
    }

    const targetedViewers = viewerIds
      ? viewerIds
          .map(id => sessionInfo.viewerSessions.get(id))
          .filter(Boolean)
      : Array.from(sessionInfo.viewerSessions.values());

    if (targetedViewers.length === 0) {
      return { increment: 0n, quota: null };
    }

    sessionInfo = await this.ensureSessionUser(sessionInfo, sessionInfo.streamKey) || sessionInfo;
    if (!sessionInfo?.user?.id) {
      console.error(`[Stream] Viewing quota update skipped: missing user for stream ${sessionInfo.streamKey}`);
      return { increment: 0n, quota: null };
    }

    let totalIncrement = 0n;

    for (const viewer of targetedViewers) {
      let viewerSession = viewer.session;
      if (!viewerSession || viewerSession.outBytes === undefined) {
        const native = this.getNodeMediaSession(viewer.id || viewerSession?.id);
        if (native) {
          viewerSession = native;
          viewer.session = native;
        }
      }

      const currentOut = BigInt(viewerSession?.outBytes ?? viewer.lastOutBytes ?? 0n);
      const previousOut = viewer.lastOutBytes ?? 0n;
      const delta = currentOut - previousOut;
      if (delta > 0n) {
        totalIncrement += delta;
        viewer.lastOutBytes = currentOut;
      }
    }

    if (totalIncrement <= 0n) {
      return { increment: 0n, quota: null };
    }

    sessionInfo.bytesDelivered = (sessionInfo.bytesDelivered ?? 0n) + totalIncrement;

    let quotaResult = null;
    if (enforceQuota) {
      try {
        quotaResult = await quotaService.checkAndUpdateViewingQuota(sessionInfo.user.id, totalIncrement);
      } catch (error) {
        console.error('[Stream] Viewing quota update error:', error);
        return { increment: 0n, quota: null };
      }

      if (!quotaResult.allowed) {
        await this.handleViewingQuotaExceeded(sessionInfo);
      }
    }

    if (quotaResult && sessionInfo?.user?.id) {
      websocketService.emitQuotaUpdate(sessionInfo.user.id).catch(err => {
        console.error('[Stream] Failed to emit viewing quota update:', err);
      });
    }

    return { increment: totalIncrement, quota: quotaResult };
  }

  async handleViewingQuotaExceeded(sessionInfo) {
    if (sessionInfo.viewerQuotaExceeded) return;

    sessionInfo.viewerQuotaExceeded = true;
    sessionInfo.status = 'viewing_quota_exceeded';

    if (sessionInfo.viewerSessions) {
      for (const viewer of sessionInfo.viewerSessions.values()) {
        try {
          viewer.session?.close?.();
        } catch (err) {
          console.error('[Stream] Error closing viewer session:', err);
        }
      }
      sessionInfo.viewerSessions.clear();
    }

    if (sessionInfo.sessionId) {
      await prisma.streamSession.update({
        where: { id: sessionInfo.sessionId },
        data: { status: 'viewing_quota_exceeded' }
      }).catch(err => console.error('[Stream] Failed to update stream session status (viewing quota):', err));
    }

    sessionInfo = await this.ensureSessionUser(sessionInfo, sessionInfo.streamKey) || sessionInfo;
    const user = sessionInfo?.user;

    if (user && discordService?.sendQuotaAlert) {
      discordService.sendQuotaAlert({
        username: user.username,
        quotaType: 'viewing',
        action: 'viewers_disconnected'
      }).catch(err => console.error('[Stream] Discord quota alert failed:', err));
    }

    if (user?.id) {
      websocketService.emitQuotaUpdate(user.id).catch(err => {
        console.error('[Stream] Failed to emit quota update after viewing quota exceeded:', err);
      });
    }
  }

  // Ensure session state has a hydrated user reference before quota or notification work.
  async ensureSessionUser(sessionInfo, streamKey) {
    const key = streamKey ?? sessionInfo?.streamKey;
    if (!sessionInfo || !key) {
      return null;
    }

    if (sessionInfo.user && sessionInfo.user.id) {
      return sessionInfo;
    }

    try {
      const user = await authService.getUserByStreamKey(key);
      if (!user) {
        console.error(`[Stream] Unable to resolve user for stream ${key}`);
        return null;
      }

      sessionInfo.user = user;
      sessionInfo.streamKey = key;
      sessionInfo.appName = sessionInfo.appName ? sessionInfo.appName.replace(/^\/+|\/+$/g, '') || null : sessionInfo.appName ?? null;
      sessionInfo.streamPath = this.normalizeStreamPath(sessionInfo.appName, key, sessionInfo.streamPath);
      if (!sessionInfo.viewerSessions) {
        sessionInfo.viewerSessions = new Map();
      }
      this.activeSessions.set(key, sessionInfo);
      return sessionInfo;
    } catch (error) {
      console.error('[Stream] ensureSessionUser error:', error);
      return null;
    }
  }

  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(info => {
      const user = info.user;
      return {
        id: info.sessionId ?? info.id ?? info.streamKey,
        sessionId: info.sessionId ?? null,
        streamKey: info.streamKey,
        appName: info.appName || null,
        streamPath: info.streamPath || null,
        status: info.status ?? 'live',
        startedAt: info.startTime,
        bytesStreamed: info.bytesStreamed ?? 0n,
        bytesDelivered: info.bytesDelivered ?? 0n,
        viewerCount: info.viewerSessions ? info.viewerSessions.size : 0,
        viewerQuotaExceeded: info.viewerQuotaExceeded ?? false,
        user: user
          ? {
              id: user.id,
              username: user.username,
              email: user.email
            }
          : null
      };
    });
  }

  async getSessionForUser(userId) {
    if (!userId) {
      return null;
    }

    for (const sessionInfo of this.activeSessions.values()) {
      const ensured = await this.ensureSessionUser(sessionInfo, sessionInfo.streamKey) || sessionInfo;
      if (ensured?.user?.id === userId) {
        const viewerCount = ensured.viewerSessions ? ensured.viewerSessions.size : 0;
        return {
          sessionId: ensured.sessionId ?? null,
          streamKey: ensured.streamKey,
          appName: ensured.appName || null,
          streamPath: ensured.streamPath || null,
          status: ensured.status ?? 'live',
          startedAt: ensured.startTime ?? null,
          bytesStreamed: (ensured.bytesStreamed ?? 0n).toString(),
          bytesDelivered: (ensured.bytesDelivered ?? 0n).toString(),
          viewerCount
        };
      }
    }

    const fallbackSession = await prisma.streamSession.findFirst({
      where: { userId, status: 'live' },
      orderBy: { startedAt: 'desc' }
    });

    if (fallbackSession) {
      const defaultApp = this.getDefaultAppName();
      const normalizedApp = defaultApp && defaultApp.length > 0 ? defaultApp : null;
      const streamPath = this.normalizeStreamPath(normalizedApp, fallbackSession.streamKey, fallbackSession.streamPath);
      return {
        sessionId: fallbackSession.id,
        streamKey: fallbackSession.streamKey,
        appName: normalizedApp,
        streamPath,
        status: fallbackSession.status ?? 'live',
        startedAt: fallbackSession.startedAt ?? null,
        bytesStreamed: (fallbackSession.bytesStreamed ?? 0n).toString(),
        bytesDelivered: (fallbackSession.bytesDelivered ?? 0n).toString(),
        viewerCount: 0
      };
    }

    return null;
  }

  run() {
    if (this.nms) {
      this.nms.run();
      console.log('[Stream] RTMP server started on port', process.env.RTMP_PORT || 1935);
      console.log('[Stream] HTTP-FLV server started on port', process.env.HTTP_FLV_PORT || 8000);
    } else {
      console.error('[Stream] NMS not initialized');
    }
  }
}

module.exports = new StreamingService();
