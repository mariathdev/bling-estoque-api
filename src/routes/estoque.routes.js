import { Router } from 'express';
import { queryStockHandler, listVariantsHandler } from '../controllers/estoque.controller.js';

const router = Router();

router.get('/', queryStockHandler);
router.get('/variantes', listVariantsHandler);

export default router;
