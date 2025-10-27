const authService = require('../services/auth.service');
const prisma = require('../db');

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    
    // Get user from database to check role
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user || user.role !== 'admin') { 
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    req.adminUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 名前付きエクスポートとデフォルトエクスポートの両方をサポート
module.exports = adminMiddleware;
module.exports.adminOnly = adminMiddleware;
