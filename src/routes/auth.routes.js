const express = require('express');
const authService = require('../services/auth.service');
const authMiddleware = require('../middleware/auth.middleware');
const bcrypt = require('bcryptjs');
const prisma = require('../db');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const user = await authService.register(username, email, password);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await authService.login(username, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  res.json(req.user);
});

// Change password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'New password must be at least 6 characters long' 
      });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    // Log the password change
    await prisma.systemLog.create({
      data: {
        level: 'info',
        category: 'auth',
        message: `User ${user.username} changed their password`,
        metadata: { userId: user.id }
      }
    });

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });

  } catch (error) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to change password' 
    });
  }
});

// Regenerate stream key
router.post('/regenerate-stream-key', authMiddleware, async (req, res) => {
  try {
    const crypto = require('crypto');
    const newStreamKey = crypto.randomUUID();

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { streamKey: newStreamKey },
      select: {
        id: true,
        username: true,
        streamKey: true
      }
    });

    // Log the stream key regeneration
    await prisma.systemLog.create({
      data: {
        level: 'info',
        category: 'auth',
        message: `User ${user.username} regenerated their stream key`,
        metadata: { userId: user.id }
      }
    });

    res.json({ 
      success: true, 
      streamKey: user.streamKey,
      message: 'Stream key regenerated successfully' 
    });

  } catch (error) {
    console.error('[Auth] Regenerate stream key error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to regenerate stream key' 
    });
  }
});

module.exports = router;
