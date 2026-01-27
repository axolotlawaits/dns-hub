import express from 'express'
import { 
  deleteGroupAccessInfo, 
  deletePositionAccessInfo, 
  deleteUserAccessInfo, 
  getFullAccessInfo, 
  getGroupAccessInfo, 
  getPositionAccessInfo, 
  getUserAccessInfo, 
  updateGroupAccessInfo, 
  updatePositionAccessInfo, 
  updateUserAccessInfo,
  requestToolAccess,
  getProtectedTools,
  getAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from '../../controllers/app/access.js';
import { getAccessAnalytics } from '../../controllers/app/accessAnalytics.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// Специфичные маршруты должны быть определены ПЕРЕД параметризованными маршрутами
router.get('/protected-tools', getProtectedTools)

router.get('/analytics', authenticateToken, getAccessAnalytics)

router.get('/requests/all', authenticateToken, getAccessRequests)

router.post('/requests/:requestId/approve', authenticateToken, approveAccessRequest)

router.post('/requests/:requestId/reject', authenticateToken, rejectAccessRequest)

router.post('/request', authenticateToken, requestToolAccess)

router.get('/user/:id', getUserAccessInfo)

router.patch('/user/:id', updateUserAccessInfo)

router.delete('/user/:id', deleteUserAccessInfo)

router.get('/group/:id', getGroupAccessInfo)

router.patch('/group/:id', updateGroupAccessInfo)

router.delete('/group/:id', deleteGroupAccessInfo)

router.get('/position/:id', getPositionAccessInfo)

router.patch('/position/:id', updatePositionAccessInfo)

router.delete('/position/:id', deletePositionAccessInfo)

// Параметризованный маршрут должен быть последним
router.get('/:id', getFullAccessInfo)

export default router