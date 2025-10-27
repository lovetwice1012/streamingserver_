const Stream = require('node-rtsp-stream');
const { spawn } = require('child_process');
const prisma = require('../db');

const DEFAULT_LIVE_PATH = '/live';
const RESTREAM_PREFIX = 'restream_live_';

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value = '') => (value.startsWith('/') ? value : `/${value}`);
const restreamIdFor = (streamKey = '') => `${RESTREAM_PREFIX}${streamKey}`;

class RTSPService {
  constructor() {
    this.activeStreams = new Map(); // legacy websocket proxies
    this.liveRestreams = new Map(); // restreamId -> { process, streamKey, inputUrl, outputUrl, startedAt }
  }

  getLivePlaybackPath(streamKey) {
    const basePath = process.env.MEDIAMTX_RTSP_PATH
      ? ensureLeadingSlash(trimTrailingSlash(process.env.MEDIAMTX_RTSP_PATH))
      : DEFAULT_LIVE_PATH;
    return `${basePath}/${streamKey}`;
  }

  buildIngestUrl(streamKey, appName = null) {
    const port = Number(process.env.RTMP_PORT) || 1935;
    const host = process.env.RTMP_INGEST_HOST || process.env.STREAM_INGEST_HOST || '127.0.0.1';
    const normalizedApp = (appName || '').toString().replace(/^\/+|\/+$/g, '');
    const appSegment = normalizedApp ? `/${normalizedApp}` : '';
    return `rtmp://${host}:${port}${appSegment}/${streamKey}`;
  }

  buildMediaMtxPublishUrl(streamKey) {
    const rawBase = process.env.MEDIAMTX_RTMP_URL;
    if (rawBase) {
      try {
        const url = new URL(rawBase);
        let pathname = trimTrailingSlash(url.pathname || '');
        if (!pathname) {
          pathname = DEFAULT_LIVE_PATH;
        } else {
          pathname = ensureLeadingSlash(pathname);
        }
        url.pathname = `${pathname}/${streamKey}`;
        return url.toString();
      } catch (error) {
        console.warn(`[RTSP] Invalid MEDIAMTX_RTMP_URL "${rawBase}", falling back to localhost: ${error.message}`);
      }
    }

    const port = Number(process.env.MEDIAMTX_RTMP_PORT) || 1936;
    const host = process.env.MEDIAMTX_RTMP_HOST || '127.0.0.1';
    return `rtmp://${host}:${port}${DEFAULT_LIVE_PATH}/${streamKey}`;
  }

  startLiveRestream(streamKey, options = {}) {
    if (!streamKey) {
      throw new Error('streamKey is required');
    }

    const restreamId = restreamIdFor(streamKey);
    const existing = this.liveRestreams.get(restreamId);
    if (existing?.process && !existing.process.killed) {
      return existing;
    }

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const sanitizedAppName = (options.appName || '').toString().replace(/^\/+|\/+$/g, '');
    const inputUrl = this.buildIngestUrl(streamKey, sanitizedAppName);
    const outputUrl = this.buildMediaMtxPublishUrl(streamKey);

    const args = [
      '-hide_banner',
      '-loglevel', process.env.FFMPEG_LOGLEVEL || 'warning',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-i', inputUrl,
      '-c', 'copy',
      '-f', 'flv',
      outputUrl
    ];

    console.log(`[RTSP] Starting live restream for ${streamKey}`);
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const restreamInfo = {
      id: restreamId,
      streamKey,
      process: child,
      inputUrl,
      outputUrl,
      startedAt: new Date(),
      appName: sanitizedAppName || null
    };

    child.on('error', (error) => {
      console.error(`[RTSP] ffmpeg error for ${streamKey}:`, error);
      this.liveRestreams.delete(restreamId);
    });

    child.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        console.warn(`[RTSP] ffmpeg stderr (${streamKey}): ${message}`);
      }
    });

    child.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        console.debug?.(`[RTSP] ffmpeg stdout (${streamKey}): ${message}`);
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[RTSP] ffmpeg exited for ${streamKey} with code ${code} (signal: ${signal || 'none'})`);
      this.liveRestreams.delete(restreamId);
    });

    this.liveRestreams.set(restreamId, restreamInfo);
    return restreamInfo;
  }

  resolveRestreamId(streamKeyOrId) {
    if (!streamKeyOrId) return null;
    if (this.liveRestreams.has(streamKeyOrId)) {
      return streamKeyOrId;
    }
    const candidate = restreamIdFor(streamKeyOrId);
    return this.liveRestreams.has(candidate) ? candidate : null;
  }

  stopLiveRestream(streamKeyOrId) {
    const restreamId = this.resolveRestreamId(streamKeyOrId);
    if (!restreamId) return;
    const restream = this.liveRestreams.get(restreamId);
    if (!restream) return;

    const { process: child, streamKey } = restream;
    if (child && !child.killed) {
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 3000);
    }

    this.liveRestreams.delete(restreamId);
    console.log(`[RTSP] Stopped live restream for ${streamKey}`);
  }

  stopAllLiveRestreams() {
    for (const restream of this.liveRestreams.values()) {
      this.stopLiveRestream(restream.id);
    }
  }

  // Legacy: Start RTSP proxy for live stream (WebSocket playback)
  startLiveRTSP(streamKey, port, options = {}) {
    try {
      const sanitizedAppName = (options.appName || '').toString().replace(/^\/+|\/+$/g, '');
      const appSegment = sanitizedAppName ? `/${sanitizedAppName}` : '';
      const rtmpUrl = `rtmp://localhost:${process.env.RTMP_PORT || 1935}${appSegment}/${streamKey}`;

      const stream = new Stream({
        name: `live_${streamKey}`,
        streamUrl: rtmpUrl,
        wsPort: port,
        ffmpegOptions: {
          '-stats': '',
          '-r': 30
        }
      });

      this.activeStreams.set(`live_${streamKey}`, stream);

      console.log(`[RTSP] Started live RTSP proxy for ${streamKey} on port ${port}`);

      return stream;
    } catch (error) {
      console.error('[RTSP] Error starting live stream:', error);
      throw error;
    }
  }

  // Legacy: Start RTSP proxy for VOD recording (WebSocket playback)
  async startVODRTSP(recordingId, port) {
    try {
      const recording = await prisma.recording.findUnique({
        where: { id: recordingId }
      });

      if (!recording) {
        throw new Error('Recording not found');
      }

      const stream = new Stream({
        name: `vod_${recordingId}`,
        streamUrl: recording.s3Url,
        wsPort: port,
        ffmpegOptions: {
          '-stats': '',
          '-r': 30,
          '-re': '' // Real-time mode for VOD
        }
      });

      this.activeStreams.set(`vod_${recordingId}`, stream);

      console.log(`[RTSP] Started VOD RTSP proxy for recording ${recordingId} on port ${port}`);

      return stream;
    } catch (error) {
      console.error('[RTSP] Error starting VOD stream:', error);
      throw error;
    }
  }

  stopRTSP(streamId) {
    const restreamId = this.resolveRestreamId(streamId);
    if (restreamId) {
      this.stopLiveRestream(restreamId);
      return;
    }

    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.stop();
      this.activeStreams.delete(streamId);
      console.log(`[RTSP] Stopped RTSP stream: ${streamId}`);
    }
  }

  stopAllStreams() {
    for (const [streamId, stream] of this.activeStreams) {
      stream.stop();
    }
    this.activeStreams.clear();
    this.stopAllLiveRestreams();
    console.log('[RTSP] Stopped all RTSP streams');
  }

  getActiveStreams() {
    const legacy = Array.from(this.activeStreams.keys());
    const restreams = Array.from(this.liveRestreams.values()).map((restream) => restream.id);
    return [...legacy, ...restreams];
  }

  getRestreamInfo(streamKey) {
    const restreamId = this.resolveRestreamId(streamKey);
    if (!restreamId) return null;
    return this.liveRestreams.get(restreamId) || null;
  }
}

module.exports = new RTSPService();
