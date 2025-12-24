import { Router } from 'express';
import {
  getCorrespondences,
  createCorrespondence,
  getCorrespondenceById,
  updateCorrespondence,
  deleteCorrespondence,
  deleteAttachment,
  getSenderTypes,
  getDocumentTypes,
  getSenderNames,
  trackMail,
} from '../../controllers/aho/correspondence.js';
import uploadCorrespondence from '../../middleware/uploaderCorrespondence.js'; // Use default import

const router = Router();

// Get types (публичные роуты)
router.get('/types/sender', getSenderTypes);
router.get('/types/document', getDocumentTypes);

// Get unique sender names for autocomplete
router.get('/sender-names', getSenderNames);

// Track mail by track number
router.get('/track', trackMail);

// Get all correspondences
router.get('/', getCorrespondences);

// Get a specific correspondence by ID
router.get('/:id', getCorrespondenceById);

// Create a new correspondence with file uploads
router.post('/', uploadCorrespondence.any(), createCorrespondence);

// Update an existing correspondence with new file uploads
router.put('/:id', uploadCorrespondence.any(), updateCorrespondence);

// Delete a correspondence
router.delete('/:id', deleteCorrespondence);

// Delete an individual attachment
router.delete('/attachments/:attachmentId', deleteAttachment);

export default router;