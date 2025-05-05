import express from 'express'
import { addRoute, getRoutes, updateRoute } from '../../controllers/supply/route'

const router = express.Router()

router.get('/', getRoutes)

router.post('/', addRoute)

router.patch('/:id', updateRoute)

export default router