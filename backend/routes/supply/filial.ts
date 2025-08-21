import express from 'express'
import { updateFilialData, getFilials, deleteLoader } from '../../controllers/supply/filial.js'
import z from 'zod';
import { validateData } from '../../middleware/validation.js';

const router = express.Router()

const updateFilialSchema = z.object({
  loaders: z.array(z.any()).nonempty("укажите время"),
});

router.patch('/:id', validateData(updateFilialSchema), updateFilialData)

router.get('/:id', getFilials)

router.delete('/loader/:id', deleteLoader)

export default router