const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
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

  async startRecording(streamKey, user) {
    try {
      const recordingDir = process.env.RECORDING_DIR || './recordings';
      if (!fs.existsSync(recordingDir)) {
        fs.mkdirSync(recordingDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `${user.username}_${streamKey}_${timestamp}.mp4`;
      const filePath = path.join(recordingDir, filename);

      const rtmpUrl = `rtmp://localhost:${process.env.RTMP_PORT || 1935}/live/${streamKey}`;

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
        user
      });

    } catch (error) {
      console.error('[Recording] Start error:', error);
    }
  }

  async stopRecording(streamKey) {
    try {
      const recording = this.activeRecordings.get(streamKey);
      if (!recording) return;

      console.log(`[Recording] Stopping recording for ${recording.user.username}`);

      // Kill FFmpeg process
      recording.process.kill('SIGINT');

      // Wait a bit for file to be finalized
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if file exists and get size
      if (!fs.existsSync(recording.filePath)) {
        console.error('[Recording] File not found:', recording.filePath);
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

      // Upload to S3
      const s3Key = `recordings/${recording.user.id}/${recording.filename}`;
      const s3Url = await this.uploadToS3(recording.filePath, s3Key);

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

      // Delete local file
      fs.unlinkSync(recording.filePath);

      // Discord notification
      await discordService.sendRecordingSaved({
        username: recording.user.username,
        filename: recording.filename,
        size: fileSizeBytes,
        duration,
        s3Url
      });

      console.log(`[Recording] Saved to S3: ${s3Url}`);

      this.activeRecordings.delete(streamKey);

    } catch (error) {
      console.error('[Recording] Stop error:', error);
      await discordService.sendError({
        context: 'recording_stop',
        error: error.message
      });
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

      const s3Url = `${process.env.WASABI_ENDPOINT}/${process.env.WASABI_BUCKET}/${s3Key}`;
      
      // ローカルファイルを削除（クラウドストレージに移行）
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[Recording] Local file deleted after S3 upload:', filePath);
      }
      
      return s3Url;

    } catch (error) {
      console.error('[Recording] S3 upload error:', error);
      throw error;
    }
  }

  async deleteFromS3(s3Key) {
    try {
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
}

module.exports = new RecordingService();
