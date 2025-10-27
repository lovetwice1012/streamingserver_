require('dotenv').config();
const axios = require('axios');

const DISCORD_API = 'https://discord.com/api/v10';

async function setupDiscord() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    console.error('Error: DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set in .env file');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bot ${botToken}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('Setting up Discord channels and webhooks...\n');

    const channelConfigs = [
      { name: 'streaming-auth', envVar: 'DISCORD_WEBHOOK_AUTH', description: '認証イベント' },
      { name: 'streaming-start', envVar: 'DISCORD_WEBHOOK_STREAM_START', description: '配信開始' },
      { name: 'streaming-stop', envVar: 'DISCORD_WEBHOOK_STREAM_STOP', description: '配信停止' },
      { name: 'streaming-recording', envVar: 'DISCORD_WEBHOOK_RECORDING', description: '録画関連' },
      { name: 'streaming-quota', envVar: 'DISCORD_WEBHOOK_QUOTA', description: 'クォータアラート' },
      { name: 'streaming-errors', envVar: 'DISCORD_WEBHOOK_ERROR', description: 'エラーログ' }
    ];

    const webhooks = {};

    for (const config of channelConfigs) {
      console.log(`Creating channel: ${config.name} (${config.description})`);

      // Create channel
      const channelResponse = await axios.post(
        `${DISCORD_API}/guilds/${guildId}/channels`,
        {
          name: config.name,
          type: 0, // Text channel
          topic: config.description
        },
        { headers }
      );

      const channelId = channelResponse.data.id;
      console.log(`  ✓ Channel created: ${channelId}`);

      // Create webhook
      const webhookResponse = await axios.post(
        `${DISCORD_API}/channels/${channelId}/webhooks`,
        {
          name: `${config.name}-webhook`
        },
        { headers }
      );

      const webhookUrl = `https://discord.com/api/webhooks/${webhookResponse.data.id}/${webhookResponse.data.token}`;
      webhooks[config.envVar] = webhookUrl;
      console.log(`  ✓ Webhook created\n`);
    }

    // Print environment variables
    console.log('\n' + '='.repeat(80));
    console.log('Add these to your .env file:');
    console.log('='.repeat(80) + '\n');

    for (const [key, value] of Object.entries(webhooks)) {
      console.log(`${key}="${value}"`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Setup complete! ✓');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error setting up Discord:', error.response?.data || error.message);
    process.exit(1);
  }
}

setupDiscord();
