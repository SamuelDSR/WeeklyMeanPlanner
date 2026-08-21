import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { UNIT_OPTIONS } from '../units.js';

const router = Router();

// 表单下拉框用的单位列表。
// 放在后端是因为「哪些单位能相加」的换算表也在后端 —— 两边共用同一份定义，
// 不会出现下拉框里有、但汇总时又合不起来的情况。
router.get('/', requireAuth, (req, res) => {
  res.json({ unitGroups: UNIT_OPTIONS });
});

export default router;
