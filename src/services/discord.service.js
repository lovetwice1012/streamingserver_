const axios = require('axios');

class DiscordService {
  async sendWebhook(webhookUrl, embed) {
    if (!webhookUrl) return;

    try {
      await axios.post(webhookUrl, {
        embeds: [embed]
      });
    } catch (error) {
      console.error('[Discord] Webhook error:', error.message);
    }
  }

  async sendStreamStart(data) {
    const embed = {
      title: '🔴 配信開始',
      color: 0x00ff00,
      fields: [
        { name: 'ユーザー', value: data.username, inline: true },
        { name: 'ストリームキー', value: data.streamKey, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_STREAM_START, embed);
  }

  async sendStreamStop(data) {
    const durationStr = this.formatDuration(data.duration);
    const sizeStr = this.formatBytes(Number(data.bytesStreamed));

    const embed = {
      title: '⚫ 配信停止',
      color: 0xff0000,
      fields: [
        { name: 'ユーザー', value: data.username, inline: true },
        { name: 'ストリームキー', value: data.streamKey, inline: true },
        { name: '配信時間', value: durationStr, inline: true },
        { name: 'データ転送量', value: sizeStr, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_STREAM_STOP, embed);
  }

  async sendRecordingSaved(data) {
    const durationStr = this.formatDuration(data.duration);
    const sizeStr = this.formatBytes(data.size);
    const isLocal = data.storageProvider === 'local' || (typeof data.s3Url === 'string' && data.s3Url.startsWith('local:'));
    const storageField = isLocal
      ? {
          name: '保管場所',
          value: 'ローカルストレージ（ダッシュボードから再生可能）',
          inline: false
        }
      : {
          name: 'S3 URL',
          value: data.s3Url,
          inline: false
        };

    const embed = {
      title: '💾 録画保存完了',
      color: 0x0099ff,
      fields: [
        { name: 'ユーザー', value: data.username, inline: true },
        { name: 'ファイル名', value: data.filename, inline: false },
        { name: '録画時間', value: durationStr, inline: true },
        { name: 'ファイルサイズ', value: sizeStr, inline: true },
        storageField
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_RECORDING, embed);
  }

  async sendRecordingDeleted(data) {
    const embed = {
      title: '🗑️ 録画削除',
      color: 0xff9900,
      fields: [
        { name: 'ユーザー', value: data.username, inline: true },
        { name: 'ファイル名', value: data.filename, inline: false },
        { name: '理由', value: data.reason === 'quota_exceeded' ? 'クォータ超過' : data.reason, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_RECORDING, embed);
  }

  async sendQuotaAlert(data) {
    const embed = {
      title: '⚠️ クォータアラート',
      color: 0xff0000,
      fields: [
        { name: 'ユーザー', value: data.username, inline: true },
        { name: 'クォータタイプ', value: data.quotaType === 'streaming' ? '配信' : '録画', inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    if (data.used && data.limit) {
      embed.fields.push(
        { name: '使用量', value: this.formatBytes(Number(data.used)), inline: true },
        { name: '上限', value: this.formatBytes(Number(data.limit)), inline: true }
      );
    }

    if (data.action === 'stream_terminated') {
      embed.fields.push({ name: 'アクション', value: '配信を強制停止しました', inline: false });
    }

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_QUOTA, embed);
  }

  async sendUserRegistered(data) {
    const embed = {
      title: '👤 新規ユーザー登録',
      color: 0x00ff00,
      fields: [
        { name: 'ユーザー名', value: data.username, inline: true },
        { name: 'メール', value: data.email, inline: true },
        { name: 'ストリームキー', value: data.streamKey, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_AUTH, embed);
  }

  async sendError(data) {
    const embed = {
      title: '❌ エラー発生',
      color: 0xff0000,
      fields: [
        { name: 'コンテキスト', value: data.context, inline: true },
        { name: 'エラー', value: data.error, inline: false }
      ],
      timestamp: new Date().toISOString()
    };

    if (data.username) {
      embed.fields.unshift({ name: 'ユーザー', value: data.username, inline: true });
    }

    await this.sendWebhook(process.env.DISCORD_WEBHOOK_ERROR, embed);
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}時間${minutes}分${secs}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${secs}秒`;
    } else {
      return `${secs}秒`;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new DiscordService();
