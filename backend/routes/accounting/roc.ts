import { Router } from 'express';
import {
  getRocList,
  getRocById,
  createRoc,
  updateRoc,
  deleteRoc,
  getRocTypes,
  getRocStatuses,
  dadataPartyByInn,
  dadataSuggestParty,
  getDaDataInfo,
  addRocAttachments,
  deleteRocAttachment,
} from '../../controllers/accounting/roc.js';

const router = Router();

router.get('/', getRocList);
router.get('/:id', getRocById);
router.post('/', createRoc);
router.put('/:id', updateRoc);
router.delete('/:id', deleteRoc);

router.get('/dict/types', getRocTypes);
router.get('/dict/statuses', getRocStatuses);

router.get('/dadata/party', dadataPartyByInn);
router.get('/dadata/suggest', dadataSuggestParty);
router.get('/dadata/info', getDaDataInfo);

// Attachments
router.post('/:id/attachments', ...addRocAttachments);
router.delete('/attachments/:attId', deleteRocAttachment);

export default router;


