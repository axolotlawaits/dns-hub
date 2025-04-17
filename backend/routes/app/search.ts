import express from 'express'
import { getBranch, quickSearch, searchBranches } from '../../controllers/app/search'

const router = express.Router()

router.get('/', quickSearch)

router.get('/branch/:id', getBranch)

router.get('/branch', searchBranches)

export default router