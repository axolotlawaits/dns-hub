import express from 'express'
import { deleteGroupAccessInfo, getGroupAccessInfo, getUserAccessInfo, updateGroupAccessInfo } from '../../controllers/app/access.js';

const router = express.Router();

router.get('/:id', getUserAccessInfo)

router.get('/group/:id', getGroupAccessInfo)

router.patch('/group/:id', updateGroupAccessInfo)

router.delete('/group/:id', deleteGroupAccessInfo)

export default router