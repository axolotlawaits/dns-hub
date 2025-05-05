import express from 'express'
import { addFilialData, getFilials } from '../../controllers/supply/filial'

const router = express.Router()

router.post('/:id', addFilialData)

router.get('/:id', getFilials)

export default router