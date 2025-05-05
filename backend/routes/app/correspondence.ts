import { Router } from 'express';
import {
  getCorrespondences,
  createCorrespondence,
  getCorrespondenceById,
  updateCorrespondence,
  deleteCorrespondence,
} from '../../controllers/app/correspondence';
import uploadCorrespondence from '../../config/multerConfig'; // Use default import

const router = Router();

// Get all correspondences
router.get('/', getCorrespondences);

// Get a specific correspondence by ID
router.get('/:id', getCorrespondenceById);

// Create a new correspondence with file uploads
router.post('/', uploadCorrespondence.any(), (req, res, next) => {
  // Log the request
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);

  // Check for files
  if (!req.files || req.files.length === 0) {
    console.log('No files uploaded');
  } else {
    console.log('Files uploaded:', req.files);
  }

  // Call the create correspondence controller
  createCorrespondence(req, res, next);
});

// Update an existing correspondence with new file uploads
router.put('/:id', uploadCorrespondence.any(), (req, res, next) => {
  // Log the request
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);

  // Check for files
  if (!req.files || req.files.length === 0) {
    console.log('No files uploaded');
  } else {
    console.log('Files uploaded:', req.files);
  }

  // Call the update correspondence controller
  updateCorrespondence(req, res, next);
});

// Delete a correspondence
router.delete('/:id', deleteCorrespondence);

export default router;