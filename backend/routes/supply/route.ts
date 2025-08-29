import express from 'express'
import { addRoute, deleteRoute, getRoutes, updateRoute } from '../../controllers/supply/route.js'
import z from 'zod';
import { validateData } from '../../middleware/validation.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router()

const addRouteSchema = z.object({
  name: z.string().min(1, 'введите логин'),
  contractor: z.string().min(1, 'введите подрядчика'),
  filials: z.array(z.string()).min(2, 'не менее 2 филиалов')
});

router.get('/', authenticateToken, getRoutes)

router.post('/', validateData(addRouteSchema), addRoute)

router.patch('/:id', updateRoute)

router.delete('/:id', deleteRoute)

export default router