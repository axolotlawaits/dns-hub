import express from 'express';
import {
  getSafetyJournalList,
  getSafetyJournalById,
  createSafetyJournal,
  updateSafetyJournal,
  deleteSafetyJournal,
  getSafetyJournalEntries,
  createSafetyJournalEntry,
  updateSafetyJournalEntry,
  deleteSafetyJournalEntry,
  getSafetyJournalStats
} from '../../controllers/safety/safetyJournal.js';

const router = express.Router();

// Маршруты для журналов
router.get('/', getSafetyJournalList);
router.get('/stats', getSafetyJournalStats);
router.get('/:id', getSafetyJournalById);
router.post('/', createSafetyJournal);
router.put('/:id', updateSafetyJournal);
router.delete('/:id', deleteSafetyJournal);

// Маршруты для записей в журналах
router.get('/:journalId/entries', getSafetyJournalEntries);
router.post('/:journalId/entries', createSafetyJournalEntry);
router.put('/entries/:id', updateSafetyJournalEntry);
router.delete('/entries/:id', deleteSafetyJournalEntry);

export default router;
