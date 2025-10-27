const express = require('express');
const router = express.Router();
const planService = require('../services/plan.service');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/admin.middleware');

// すべてのプランを取得（認証不要）
router.get('/plans', (req, res) => {
  try {
    const plans = planService.getPlans();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('[API] Get plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to get plans' });
  }
});

// 自分のプラン情報を取得
router.get('/my-plan', authenticate, async (req, res) => {
  try {
    const planInfo = await planService.getUserPlanInfo(req.user.id);
    res.json({ success: true, data: planInfo });
  } catch (error) {
    console.error('[API] Get my plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to get plan info' });
  }
});

// ユーザーのプランを変更（管理者のみ）
router.put('/users/:userId/plan', authenticate, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;

    if (!plan) {
      return res.status(400).json({ success: false, error: 'Plan is required' });
    }

    const user = await planService.updateUserPlan(parseInt(userId), plan, req.user.id);
    const planInfo = await planService.getUserPlanInfo(parseInt(userId));

    res.json({ 
      success: true, 
      message: 'Plan updated successfully',
      data: planInfo
    });

  } catch (error) {
    console.error('[API] Update user plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 無料プランのストレージ上限を変更（管理者のみ）
router.put('/free-storage-limit', authenticate, adminOnly, async (req, res) => {
  try {
    const { limitGB } = req.body;

    if (!limitGB || limitGB <= 0) {
      return res.status(400).json({ success: false, error: 'Valid limitGB is required' });
    }

    const result = await planService.updateFreeStorageLimit(limitGB);

    res.json({ 
      success: true, 
      message: 'Free plan storage limit updated successfully',
      data: result
    });

  } catch (error) {
    console.error('[API] Update free storage limit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// プラン統計を取得（管理者のみ）
router.get('/stats', authenticate, adminOnly, async (req, res) => {
  try {
    const stats = await planService.getPlanStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[API] Get plan stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get plan stats' });
  }
});

module.exports = router;

