import express from 'express'
import { getGroupAccessInfo, getUserAccessInfo, updateGroupAccessInfo } from '../../controllers/app/access.js';

const router = express.Router();

router.get('/:id', getUserAccessInfo)

router.get('/group/:id', getGroupAccessInfo)

router.patch('/group/:id', updateGroupAccessInfo)

export default router