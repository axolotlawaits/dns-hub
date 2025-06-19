import express from 'express'
import { 
  deleteGroupAccessInfo, 
  deletePositionAccessInfo, 
  deleteUserAccessInfo, 
  getGroupAccessInfo, 
  getPositionAccessInfo, 
  getUserAccessInfo, 
  updateGroupAccessInfo, 
  updatePositionAccessInfo, 
  updateUserAccessInfo 
} from '../../controllers/app/access.js';

const router = express.Router();

router.get('/user/:id', getUserAccessInfo)

router.patch('/user/:id', updateUserAccessInfo)

router.delete('/user/:id', deleteUserAccessInfo)

router.get('/group/:id', getGroupAccessInfo)

router.patch('/group/:id', updateGroupAccessInfo)

router.delete('/group/:id', deleteGroupAccessInfo)

router.get('/position/:id', getPositionAccessInfo)

router.patch('/position/:id', updatePositionAccessInfo)

router.delete('/position/:id', deletePositionAccessInfo)

export default router