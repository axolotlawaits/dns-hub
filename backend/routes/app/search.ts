import express from 'express'
import { getAllGroups, getAllPositions, getAllUsers, getBranch, getBranchEmployees, getEmployee, quickSearch, searchAll, searchBranches, searchCities, searchEmployees, searchEmployeesSummary, searchPositions, searchTools } from '../../controllers/app/search.js'

const router = express.Router()

router.get('/', quickSearch)

router.get('/all', searchAll)

router.get('/branch/:id', getBranch)

router.get('/branch', searchBranches)

router.get('/branch/:id/employees', getBranchEmployees)

router.get('/tool', searchTools)

router.get('/employee/summary', searchEmployeesSummary)

router.get('/employee/:id', getEmployee)

router.get('/employee', searchEmployees)

router.get('/city', searchCities)

router.get('/position', searchPositions)

router.get('/group/all', getAllGroups)

router.get('/position/all', getAllPositions)

router.get('/user/all', getAllUsers)

export default router