import { Router, Request, Response, NextFunction } from 'express';
import { getSupplyDocs, createSupplyDoc, getSupplyDocById, updateSupplyDoc, deleteSupplyDoc } from '../../controllers/accounting/supplydocs.js';
import { createUploader } from '../../middleware/uploadFactory.js';
const uploadSupplyDocs = createUploader({ preset: 'correspondence' });

const router = Router();

// Get all supply documents
router.get('/', getSupplyDocs);

// Get a specific supply document by ID
router.get('/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  getSupplyDocById(req, res, next).catch(next);
});

// Create a new supply document with file uploads
router.post(
  '/',
  uploadSupplyDocs.fields([
    { name: 'fileInvoicePayment', maxCount: 1 },
    { name: 'fileNote', maxCount: 1 },
    { name: 'filePTiU', maxCount: 1 }
  ]),
  (req: Request, res: Response, next: NextFunction) => {
    console.log('Request Body:', req.body);
    console.log('Request Files:', req.files);

    if (!req.files || Object.keys(req.files).length === 0) {
      console.log('No files uploaded');
    } else {
      console.log('Files uploaded:', req.files);
    }

    createSupplyDoc(req, res, next).catch(next);
  }
);

// Update an existing supply document with new file uploads
router.put(
  '/:id',
  uploadSupplyDocs.fields([
    { name: 'fileInvoicePayment', maxCount: 1 },
    { name: 'fileNote', maxCount: 1 },
    { name: 'filePTiU', maxCount: 1 }
  ]),
  (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    console.log('Request Body:', req.body);
    console.log('Request Files:', req.files);

    if (!req.files || Object.keys(req.files).length === 0) {
      console.log('No files uploaded');
    } else {
      console.log('Files uploaded:', req.files);
    }

    updateSupplyDoc(req, res, next).catch(next);
  }
);

// Delete a supply document
router.delete('/:id', (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  deleteSupplyDoc(req, res, next).catch(next);
});

export default router;