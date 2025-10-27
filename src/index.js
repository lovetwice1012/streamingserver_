// BigInt のシリアライゼーションをサポート
BigInt.prototype.toJSON = function() {
  return Number(this);
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const streamingService = require('./services/streaming.service');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({
  origin: '*', // すべてのオリジンを許可
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/recordings', require('./routes/recording.routes'));
app.use('/api/rtsp', require('./routes/rtsp.routes'));
app.use('/api/quota', require('./routes/quota.routes'));
app.use('/api/plan', require('./routes/plan.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      rtmp: 'running'
    }
  });
});

// Start HTTP API server - すべてのインターフェースでリッスン
app.listen(PORT, HOST, () => {
  console.log(`[API] Server running on http://${HOST}:${PORT}`);
  console.log(`[API] Accepting connections from all hosts`);
});

// Initialize and start RTMP server
const nms = streamingService.init();
streamingService.run();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  const rtspService = require('./services/rtsp.service');
  rtspService.stopAllStreams();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  const rtspService = require('./services/rtsp.service');
  rtspService.stopAllStreams();
  process.exit(0);
});
