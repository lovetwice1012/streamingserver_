const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const quotaService = require('./quota.service');
const discordService = require('./discord.service');

class RecordingService {
  constructor() {
    this.activeRecordings = new Map(); // streamKey -> { process, filePath, startTime }
    this.s3Client = new S3Client({
      endpoint: process.env.WASABI_ENDPOINT,
      region: process.env.WASABI_REGION || 'ap-northeast-1',
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
        secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY
      }
    });
  }

  async startRecording(streamKey, user, options = {}) {
    try {
      const recordingDir = process.env.RECORDING_DIR || './recordings';
      if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `${user.username}_${streamKey}_${timestamp}.mp4`;
      const filePath = path.join(recordingDir, filename);

      const sanitizedAppName = (options.appName || '').toString().replace(/^\/+|\/+$/g, '');
      const appSegment = sanitizedAppName ? `/${sanitizedAppName}` : '';
      const rtmpUrl = `rtmp://localhost:${process.env.RTMP_PORT || 1935}${appSegment}/${streamKey}`;

      console.log(`[Recording] Starting recording for ${user.username}: ${filename}`);

      const ffmpegProcess = ffmpeg(rtmpUrl)
        .inputOptions([
          '-rtmp_live live',
          '-rtmp_buffer 1000'
        ])
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-c:a aac',
          '-f mp4',
          '-movflags +faststart'
        ])
        .output(filePath)
        .on('start', (cmd) => {
          console.log('[Recording] FFmpeg started:', cmd);
        })
        .on('error', (err) => {
          console.error('[Recording] FFmpeg error:', err);
        })
        .on('end', () => {
          console.log('[Recording] FFmpeg ended');
        });

      ffmpegProcess.run();

      this.activeRecordings.set(streamKey, {
        process: ffmpegProcess,
        filePath,
        filename,
        startTime: new Date(),
        user,
        appName: sanitizedAppName || null
      });

    } catch (error) {
      console.error('[Recording] Start error:', error);
    }
  }

  async stopRecording(streamKey) {
    let recordingRef = null;
    let markedStopping = false;
    try {
      const recording = this.activeRecordings.get(streamKey);
      if (!recording) return;
      recordingRef = recording;

      console.log(`[Recording] Stopping recording for ${recording.user.username}`);

      if (recording.stopping) {
        return;
      }
      recording.stopping = true;
      markedStopping = true;

      const ffmpegCommand = recording.process;
      const ffmpegProc = ffmpegCommand?.ffmpegProc;

      const exitPromise = new Promise(resolve => {
        let settled = false;

        const cleanup = () => {
          if (ffmpegCommand) {
            if (typeof ffmpegCommand.off === 'function') {
              ffmpegCommand.off('end', onEnd);
              ffmpegCommand.off('error', onError);
            } else {
              ffmpegCommand.removeListener?.('end', onEnd);
              ffmpegCommand.removeListener?.('error', onError);
            }
          }
          if (ffmpegProc) {
            ffmpegProc.removeListener?.('exit', onExit);
            ffmpegProc.removeListener?.('close', onClose);
          }
        };

        const settle = (result) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(result);
        };

        const onEnd = () => settle({ type: 'end' });
        const onError = (error) => settle({ type: 'error', error });
        const onExit = (code, signal) => settle({ type: 'exit', code, signal });
        const onClose = (code, signal) => settle({ type: 'close', code, signal });

        if (ffmpegCommand) {
          ffmpegCommand.once('end', onEnd);
          ffmpegCommand.once('error', onError);
        }

        if (ffmpegProc) {
          ffmpegProc.once('exit', onExit);
          ffmpegProc.once('close', onClose);
        } else {
          settle({ type: 'no-process' });
        }
      });

      const sendGracefulStop = () => {
        if (ffmpegProc?.stdin && !ffmpegProc.stdin.destroyed) {
          try {
            ffmpegProc.stdin.write('q');
            ffmpegProc.stdin.end();
            return true;
          } catch (error) {
            console.warn('[Recording] Failed to send graceful stop signal to FFmpeg:', error);
          }
        }
        return false;
      };

      const graceful = sendGracefulStop();
      if (!graceful && ffmpegCommand?.kill && ffmpegCommand.ffmpegProc) {
        ffmpegCommand.kill('SIGINT');
      }

      const exitResult = await Promise.race([
        exitPromise,
        new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 10000))
      ]);

      if (exitResult?.type === 'error') {
        console.warn('[Recording] FFmpeg reported error while stopping:', exitResult.error?.message || exitResult.error);
      }

      if (exitResult?.type === 'exit' && exitResult.code && exitResult.code !== 0) {
        console.warn(`[Recording] FFmpeg exited with code ${exitResult.code} (signal: ${exitResult.signal || 'none'})`);
      }

      if (exitResult?.type === 'timeout') {
        console.warn('[Recording] FFmpeg did not exit within timeout, forcing termination');
        if (ffmpegCommand?.kill && ffmpegCommand.ffmpegProc) {
          ffmpegCommand.kill('SIGTERM');
        }
        await exitPromise;
      }

      const waitForFile = async () => {
        const attempts = 5;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          if (fs.existsSync(recording.filePath)) {
            return true;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
      };

      const fileReady = await waitForFile();
      if (!fileReady) {
        console.error('[Recording] File not found after stopping FFmpeg:', recording.filePath);
        this.activeRecordings.delete(streamKey);
        return;
      }

      const stats = fs.statSync(recording.filePath);
      const fileSizeBytes = stats.size;

      console.log(`[Recording] File size: ${fileSizeBytes} bytes`);

      // Check recording quota
      const hasQuota = await quotaService.checkRecordingQuota(
        recording.user.id,
        fileSizeBytes
      );

      if (!hasQuota) {
        // Delete oldest recording to make space
        console.log('[Recording] Quota exceeded, deleting oldest recording');
        const deleted = await quotaService.deleteOldestRecording(recording.user.id);
        
        if (deleted) {
          await this.deleteFromS3(deleted.s3Key);
          await discordService.sendRecordingDeleted({
            username: recording.user.username,
            filename: deleted.filename,
            reason: 'quota_exceeded'
          });
        }
      }

      const userPlan = (recording.user?.plan || 'FREE').toUpperCase();
      const useWasabiStorage = userPlan !== 'FREE';
      let s3Key;
      let s3Url = '';

      if (useWasabiStorage) {
        // Upload to Wasabi (S3 compatible)
        s3Key = `recordings/${recording.user.id}/${recording.filename}`;
        s3Url = await this.uploadToS3(recording.filePath, s3Key);
      } else {
        // Free plan keeps recording on local storage
        s3Key = `local:${recording.filename}`;
        s3Url = s3Key;
        console.log('[Recording] Stored locally for free plan:', recording.filePath);
      }

      // Update quota
      await quotaService.updateRecordingQuota(recording.user.id, fileSizeBytes);

      // Save to database
      const duration = Math.floor((new Date() - recording.startTime) / 1000);
      
      await prisma.recording.create({
        data: {
          userId: recording.user.id,
          filename: recording.filename,
          s3Key,
          s3Url,
          sizeBytes: BigInt(fileSizeBytes),
          duration,
          streamKey,
          startedAt: recording.startTime,
          endedAt: new Date()
        }
      });

      // Delete local file for Wasabi uploads only
      if (useWasabiStorage && fs.existsSync(recording.filePath)) {
        fs.unlinkSync(recording.filePath);
      }

      // Discord notification
      await discordService.sendRecordingSaved({
        username: recording.user.username,
        filename: recording.filename,
        size: fileSizeBytes,
        duration,
        s3Url,
        storageProvider: useWasabiStorage ? 'wasabi' : 'local'
      });

      console.log(`[Recording] Saved to S3: ${s3Url}`);

      this.activeRecordings.delete(streamKey);

    } catch (error) {
      console.error('[Recording] Stop error:', error);
      await discordService.sendError({
        context: 'recording_stop',
        error: error.message
      });
    } finally {
      if (markedStopping && recordingRef) {
        delete recordingRef.stopping;
      }
    }
  }

  async uploadToS3(filePath, s3Key) {
    try {
      const fileStream = fs.createReadStream(filePath);
      
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.WASABI_BUCKET,
          Key: s3Key,
          Body: fileStream,
          ContentType: 'video/mp4'
        }
      });

      await upload.done();

      return `${process.env.WASABI_ENDPOINT}/${process.env.WASABI_BUCKET}/${s3Key}`;

    } catch (error) {
      console.error('[Recording] S3 upload error:', error);
      throw error;
    }
  }

  async deleteFromS3(s3Key) {
    try {
      if (!s3Key) {
        return;
      }

      if (s3Key.startsWith('local:')) {
        const filename = s3Key.replace(/^local:/, '');
        const safeName = path.basename(filename);
        const recordingDir = this.getRecordingDirectory();
        const localPath = path.join(recordingDir, safeName);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          console.log('[Recording] Deleted local recording:', localPath);
        }
        return;
      }

      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.WASABI_BUCKET,
        Key: s3Key
      }));
      console.log(`[Recording] Deleted from S3: ${s3Key}`);
    } catch (error) {
      console.error('[Recording] S3 delete error:', error);
    }
  }

  getRecordingDirectory() {
    const recordingDir = process.env.RECORDING_DIR || './recordings';
    return path.isAbsolute(recordingDir)
      ? recordingDir
      : path.join(process.cwd(), recordingDir);
  }

  parseRangeHeader(rangeHeader, totalSize) {
    const size = Number.isFinite(totalSize) ? totalSize : Number(totalSize || 0);
    if (!Number.isFinite(size) || size < 0) {
      return null;
    }

    if (!rangeHeader) {
      const end = size > 0 ? size - 1 : 0;
      return {
        start: 0,
        end,
        chunkSize: size > 0 ? size : 0,
        isPartial: false
      };
    }

    if (!rangeHeader.startsWith('bytes=')) {
      return null;
    }

    const value = rangeHeader.substring(6).trim();
    if (!value || value.includes(',')) {
      return null; // multi-range unsupported
    }

    const [rawStart, rawEnd] = value.split('-');
    let start;
    let end;

    if (!rawStart) {
      const suffixLength = parseInt(rawEnd, 10);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return null;
      }
      start = size - suffixLength;
      if (start < 0) {
        start = 0;
      }
      end = size - 1;
    } else {
      start = parseInt(rawStart, 10);
      if (!Number.isFinite(start) || start < 0) {
        return null;
      }

      if (!rawEnd) {
        end = size - 1;
      } else {
        end = parseInt(rawEnd, 10);
        if (!Number.isFinite(end) || end < 0) {
          return null;
        }
      }
    }

    if (size === 0) {
      start = 0;
      end = -1;
    } else {
      if (start >= size) {
        return null;
      }
      if (end >= size || end < 0) {
        end = size - 1;
      }
      if (start > end) {
        return null;
      }
    }

    const chunkSize = end >= start ? (end - start + 1) : 0;
    return {
      start,
      end,
      chunkSize,
      isPartial: !(start === 0 && end === size - 1)
    };
  }

  async streamRecordingToResponse(recording, req, res, options = {}) {
    try {
      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      const { viewerId = null, enforceQuota = true } = options;

      let fileSize;
      if (typeof recording.sizeBytes === 'bigint') {
        fileSize = Number(recording.sizeBytes);
      } else if (typeof recording.sizeBytes === 'number') {
        fileSize = recording.sizeBytes;
      } else {
        fileSize = Number(recording.sizeBytes || 0);
      }

      const isLocal = typeof recording.s3Key === 'string' && recording.s3Key.startsWith('local:');
      let localPath = null;

      if (isLocal) {
        const rawName = recording.s3Key.replace(/^local:/, '') || recording.filename;
        const safeName = path.basename(rawName || recording.filename);
        localPath = path.join(this.getRecordingDirectory(), safeName);
        if (!fs.existsSync(localPath)) {
          res.status(404).json({ error: 'Recording file not found' });
          return;
        }
        try {
          const stat = fs.statSync(localPath);
          fileSize = stat.size;
        } catch (error) {
          console.error('[Recording] Failed to stat local file:', error);
          res.status(500).json({ error: 'Failed to access recording file' });
          return;
        }
      }

      if (!Number.isFinite(fileSize) || fileSize < 0) {
        res.status(500).json({ error: 'Invalid recording size' });
        return;
      }

      const rangeInfo = this.parseRangeHeader(req.headers.range || '', fileSize);
      if (!rangeInfo) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`);
        res.end();
        return;
      }

      if (enforceQuota && viewerId && rangeInfo.chunkSize > 0) {
        const quotaResult = await quotaService.checkAndUpdateViewingQuota(viewerId, rangeInfo.chunkSize);
        if (!quotaResult.allowed) {
          res.status(403).json({ error: 'Viewing quota exceeded' });
          return;
        }
      }

      const safeFilename = encodeURIComponent(recording.filename || 'recording.mp4').replace(/%20/g, ' ');
      const statusCode = rangeInfo.isPartial ? 206 : 200;

      res.status(statusCode);
      res.set({
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'Content-Disposition': `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      });

      if (rangeInfo.chunkSize > 0) {
        res.set('Content-Length', String(rangeInfo.chunkSize));
      }

      if (rangeInfo.isPartial && fileSize > 0) {
        res.set('Content-Range', `bytes ${rangeInfo.start}-${rangeInfo.end}/${fileSize}`);
      }

      if (req.method === 'HEAD' || rangeInfo.chunkSize === 0) {
        res.end();
        return;
      }

      if (isLocal) {
        const readStream = fs.createReadStream(localPath, {
          start: Math.max(rangeInfo.start, 0),
          end: rangeInfo.end >= 0 ? rangeInfo.end : undefined
        });

        const abort = () => readStream.destroy();
        req.on('close', abort);
        readStream.on('error', (error) => {
          console.error('[Recording] Local stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream recording' });
          } else {
            res.destroy(error);
          }
        });
        readStream.pipe(res);
        return;
      }

      if (!this.s3Client) {
        res.status(500).json({ error: 'Storage client not configured' });
        return;
      }

      try {
        const params = {
          Bucket: process.env.WASABI_BUCKET,
          Key: recording.s3Key
        };
        if (rangeInfo.isPartial && fileSize > 0) {
          params.Range = `bytes=${rangeInfo.start}-${rangeInfo.end}`;
        }

        const s3Response = await this.s3Client.send(new GetObjectCommand(params));
        const bodyStream = s3Response.Body;

        const abort = () => bodyStream?.destroy?.();
        req.on('close', abort);

        bodyStream.on('error', (error) => {
          console.error('[Recording] S3 stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream recording' });
          } else {
            res.destroy(error);
          }
        });

        bodyStream.pipe(res);
      } catch (error) {
        console.error('[Recording] S3 get error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to fetch recording from storage' });
        } else {
          res.destroy(error);
        }
      }
    } catch (error) {
      console.error('[Recording] streamRecordingToResponse error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream recording' });
      } else {
        res.destroy(error);
      }
    }
  }
}

module.exports = new RecordingService();
