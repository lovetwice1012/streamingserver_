// BigInt のシリアライゼーションをサポート
BigInt.prototype.toJSON = function() {
  return Number(this);
};

require('dotenv').config();
const http = require('http');
const express = require('express');
const path = require('path');
const cors = require('cors');
const streamingService = require('./services/streaming.service');
const websocketService = require('./services/websocket.service');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: '*', // すべてのオリジンを許可
  credentials: true
}));
app.use(express.json());

const mediaRoot = path.join(__dirname, '../media');
const liveMediaPath = path.join(mediaRoot, 'live');

app.use('/live', express.static(liveMediaPath, {
  fallthrough: false,
  setHeaders(res, filePath) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (filePath.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filePath.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }
  }
}));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/recordings', require('./routes/recording.routes'));
app.use('/api/rtsp', require('./routes/rtsp.routes'));
app.use('/api/quota', require('./routes/quota.routes'));
app.use('/api/plan', require('./routes/plan.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/streaming', require('./routes/streaming.routes'));

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

// Initialize WebSocket support
websocketService.init(server);

// Start HTTP API server - すべてのインターフェースでリスン
server.listen(PORT, HOST, () => {
  console.log(`[API] Server running on http://${HOST}:${PORT}`);
  console.log('[API] Accepting connections from all hosts');
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
