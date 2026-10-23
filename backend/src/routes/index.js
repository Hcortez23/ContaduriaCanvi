import { Router } from 'express';
import empresas from './empresas.js';

const router = Router();

router.get('/health', (req, res) => res.json({ ok: true }));
router.use('/empresas', empresas);

export default router;
