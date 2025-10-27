const Stream = require('node-rtsp-stream');
const prisma = require('../db');

class RTSPService {
  constructor() {
    this.activeStreams = new Map(); // streamId -> Stream instance
  }

  // Start RTSP proxy for live stream
  startLiveRTSP(streamKey, port) {
    try {
      const rtmpUrl = `rtmp://localhost:${process.env.RTMP_PORT || 1935}/live/${streamKey}`;
      
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

  // Start RTSP proxy for VOD recording
  async startVODRTSP(recordingId, port) {
    try {
      const recording = await prisma.recording.findUnique({
        where: { id: recordingId }
      });

      if (!recording) {
        throw new Error('Recording not found');
      }

      // Use S3 URL as source
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
    console.log('[RTSP] Stopped all RTSP streams');
  }

  getActiveStreams() {
    return Array.from(this.activeStreams.keys());
  }
}

module.exports = new RTSPService();
