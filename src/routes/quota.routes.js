const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const quotaService = require('../services/quota.service');

const router = express.Router();

// Get quota status
router.get('/', authMiddleware, async (req, res) => {
  try {
    const quota = await quotaService.getQuotaStatus(req.user.id);
    
    if (!quota) {
      return res.status(404).json({ error: 'Quota not found' });
    }

    const formatted = quotaService.formatQuotaResponse(quota);
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
