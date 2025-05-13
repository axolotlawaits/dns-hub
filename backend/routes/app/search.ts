import express from 'express'
import { getBranch, getEmployee, quickSearch, searchAll, searchBranches, searchCities, searchEmployees, searchTools } from '../../controllers/app/search'

const router = express.Router()

router.get('/', quickSearch)

router.get('/all', searchAll)

router.get('/branch/:id', getBranch)

router.get('/branch', searchBranches)

router.get('/tool', searchTools)

router.get('/employee/:id', getEmployee)

router.get('/employee', searchEmployees)

router.get('/city', searchCities)

export default router