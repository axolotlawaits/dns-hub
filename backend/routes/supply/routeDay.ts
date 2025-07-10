import express from 'express'
import { addRouteDay, getAllRoutesDay, getRouteDays } from '../../controllers/supply/routeDay.js'

const router = express.Router()

router.get('/route/:id', getRouteDays)

router.post('/route/:id', addRouteDay )

router.get('/day-summary', getAllRoutesDay)

export default router