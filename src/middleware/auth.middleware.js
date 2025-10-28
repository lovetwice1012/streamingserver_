const authService = require('../services/auth.service');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query && typeof req.query.token === 'string' && req.query.token.length > 0) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = authService.verifyToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 名前付きエクスポートとデフォルトエクスポートの両方をサポート
module.exports = authenticate;
module.exports.authenticate = authenticate;
