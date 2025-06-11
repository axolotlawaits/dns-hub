import express from 'express'
import { getAllPositions, getBranch, getEmployee, quickSearch, searchAll, searchBranches, searchCities, searchEmployees, searchPositions, searchTools } from '../../controllers/app/search.js'

const router = express.Router()

router.get('/', quickSearch)

router.get('/all', searchAll)

router.get('/branch/:id', getBranch)

router.get('/branch', searchBranches)

router.get('/tool', searchTools)

router.get('/employee/:id', getEmployee)

router.get('/employee', searchEmployees)

router.get('/city', searchCities)

router.get('/position', searchPositions)

router.get('/all-positions', getAllPositions)

export default router