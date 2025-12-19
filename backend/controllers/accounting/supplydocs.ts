import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Types
type MulterFiles = {
  fileInvoicePayment?: Express.Multer.File[];
  fileNote?: Express.Multer.File[];
  filePTiU?: Express.Multer.File[];
  attachments?: Express.Multer.File[];
} | undefined;

// Validation schemas
const AttachmentSchema = z.object({
  userAdd: z.string(),
  source: z.string(),
  type: z.enum([
    'demandsForPayment',
    'statusRequirements',
    'other'
  ])
});

const SupplyDocsSchema = z.object({
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  addedById: z.string(),
  inn: z.coerce.number(),
  counterParty: z.string(),
  demandsForPayment: z.string(),
  statusRequirements: z.string(),
  fileInvoicePayment: z.string().optional(), // Will be replaced with file path
  costBranchId: z.string(),
  settlementSpecialistId: z.string().optional(),
  statusOfPTiU: z.string(),
  filePTiU: z.string().optional(), // Will be replaced with file path
  note: z.string(),
  fileNote: z.string().optional(), // Will be replaced with file path
  requirementNumber: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
});

// Helper functions
const logRequest = (req: Request) => {
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);
};

const validateUserExists = async (userId: string) => {
  return prisma.user.findUnique({ where: { id: userId } });
};

const validateBranchExists = async (branchId: string) => {
  return prisma.branch.findUnique({ where: { uuid: branchId } });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
    console.log(`File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error(`Error deleting file at ${filePath}:`, error);
  }
};

const handlePrismaError = (error: any, res: Response) => {
  if (error.code === 'P2025') {
    res.status(404).json({ error: 'Supply document not found' });
    return true;
  }
  return false;
};

const processFileUpload = (files: Express.Multer.File[] | undefined) => {
  if (!files || files.length === 0) return undefined;
  return files[0].filename; // Return filename as saved on disk
};

const processAttachments = async (
  files: Express.Multer.File[] | undefined,
  supplyDocId: string,
  userAddId: string,
  type: string
) => {
  if (!files || files.length === 0) return;

  // Сначала проверяем, существует ли supply document
  const supplyDocExists = await prisma.supplyDocs.findUnique({
    where: { id: supplyDocId }
  });

  if (!supplyDocExists) {
    throw new Error(`Supply document with id ${supplyDocId} not found`);
  }

  // Проверяем существование пользователя
  const userExists = await prisma.user.findUnique({
    where: { id: userAddId }
  });

  if (!userExists) {
    throw new Error(`User with id ${userAddId} not found`);
  }

  // Создаем вложения в транзакции
  await prisma.$transaction(async (tx) => {
    for (const file of files) {
      await tx.supplyDocsAttachment.create({
        data: {
          userAdd: userAddId,
          source: file.filename, // Сохраняем название файла как оно сохранено на диске
          type,
          recordId: supplyDocId,
        }
      });
    }
  });
};

// Controller methods
export const getSupplyDocs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const supplyDocs = await prisma.supplyDocs.findMany({
      include: { 
        supplyDocs: true, 
        addedBy: true,
        costBranch: true,
        settlementSpecialist: true
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(supplyDocs);
  } catch (error) {
    next(error);
  }
};

export const getSupplyDocById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const supplyDoc = await prisma.supplyDocs.findUnique({
      where: { id: req.params.id },
      include: { 
        supplyDocs: true,
        addedBy: true,
        costBranch: true,
        settlementSpecialist: true
      },
    });

    if (!supplyDoc) {
      return res.status(404).json({ error: 'Supply document not found' });
    }

    res.status(200).json(supplyDoc);
  } catch (error) {
    next(error);
  }
};

export const createSupplyDoc = async (
  req: Request<{}, any, z.infer<typeof SupplyDocsSchema>>,
  res: Response,
  next: NextFunction
) => {
  try {
    logRequest(req);
    const validatedData = SupplyDocsSchema.parse(req.body);
    const files = req.files as MulterFiles;

    const userExists = await validateUserExists(validatedData.addedById);
    if (!userExists) {
      return res.status(400).json({ error: 'AddedBy user does not exist' });
    }

    const branchExists = await validateBranchExists(validatedData.costBranchId);
    if (!branchExists) {
      return res.status(400).json({ error: 'Cost branch does not exist' });
    }

    if (validatedData.settlementSpecialistId) {
      const specialistExists = await validateUserExists(validatedData.settlementSpecialistId);
      if (!specialistExists) {
        return res.status(400).json({ error: 'Settlement specialist does not exist' });
      }
    }

    // Process direct file uploads
    const fileInvoicePaymentPath = processFileUpload(files?.fileInvoicePayment);
    const fileNotePath = processFileUpload(files?.fileNote);
    const filePTiUPath = processFileUpload(files?.filePTiU);

    const newSupplyDoc = await prisma.supplyDocs.create({
      data: {
        createdAt: validatedData.createdAt ? new Date(validatedData.createdAt) : new Date(),
        updatedAt: new Date(),
        addedById: validatedData.addedById,
        inn: validatedData.inn,
        counterParty: validatedData.counterParty,
        demandsForPayment: validatedData.demandsForPayment,
        statusRequirements: validatedData.statusRequirements,
        fileInvoicePayment: fileInvoicePaymentPath || '',
        costBranchId: validatedData.costBranchId,
        settlementSpecialistId: validatedData.settlementSpecialistId,
        statusOfPTiU: validatedData.statusOfPTiU,
        filePTiU: filePTiUPath || '',
        note: validatedData.note,
        fileNote: fileNotePath || '',
        requirementNumber: validatedData.requirementNumber,
      },
    });

    // Process additional attachments
    if (files?.attachments) {
      await processAttachments(
        files.attachments, 
        newSupplyDoc.id, 
        validatedData.addedById,
        'other'
      );
    }

    const result = await prisma.supplyDocs.findUnique({
      where: { id: newSupplyDoc.id },
      include: { 
        supplyDocs: true,
        addedBy: true,
        costBranch: true,
        settlementSpecialist: true
      },
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    next(error);
  }
};

const deleteAttachments = async (attachmentIds: string[], supplyDocId: string) => {
  if (!attachmentIds.length) return;

  const attachments = await prisma.supplyDocsAttachment.findMany({
    where: { 
      id: { in: attachmentIds },
      recordId: supplyDocId 
    }
  });

  await Promise.all(
    attachments.map(async (attachment) => {
      // Строим полный путь к файлу
      const fullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', attachment.source);
      await deleteFileSafely(fullPath);
      await prisma.supplyDocsAttachment.delete({
        where: { id: attachment.id }
      });
    })
  );
};

export const updateSupplyDoc = async (
  req: Request<{ id: string }, any, any>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { body, params, files } = req;
    const supplyDocId = params.id;
    const filesData = files as MulterFiles;

    // Parse attachments to delete
    let attachmentsToDelete: string[] = [];
    try {
      attachmentsToDelete = body.removedAttachments
        ? JSON.parse(body.removedAttachments)
        : [];
    } catch (e) {
      console.error('Error parsing removedAttachments:', e);
    }

    // Delete specified attachments
    await deleteAttachments(attachmentsToDelete, supplyDocId);

    // Get current document to handle file updates
    const currentDoc = await prisma.supplyDocs.findUnique({
      where: { id: supplyDocId }
    });

    if (!currentDoc) {
      return res.status(404).json({ error: 'Supply document not found' });
    }

    // Process file uploads and clean up old files if needed
    let fileInvoicePaymentPath = currentDoc.fileInvoicePayment;
    if (filesData?.fileInvoicePayment) {
      if (currentDoc.fileInvoicePayment) {
        const oldFullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', currentDoc.fileInvoicePayment);
        await deleteFileSafely(oldFullPath);
      }
      fileInvoicePaymentPath = filesData.fileInvoicePayment[0].filename;
    }

    let fileNotePath = currentDoc.fileNote;
    if (filesData?.fileNote) {
      if (currentDoc.fileNote) {
        const oldFullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', currentDoc.fileNote);
        await deleteFileSafely(oldFullPath);
      }
      fileNotePath = filesData.fileNote[0].filename;
    }

    let filePTiUPath = currentDoc.filePTiU;
    if (filesData?.filePTiU) {
      if (currentDoc.filePTiU) {
        const oldFullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', currentDoc.filePTiU);
        await deleteFileSafely(oldFullPath);
      }
      filePTiUPath = filesData.filePTiU[0].filename;
    }

    // Process additional attachments
    if (filesData?.attachments) {
      await processAttachments(
        filesData.attachments, 
        supplyDocId, 
        body.addedById || currentDoc.addedById,
        'other'
      );
    }

    // Update supply document
    const updateData = {
      updatedAt: new Date(),
      addedById: body.addedById || currentDoc.addedById,
      inn: body.inn !== undefined ? body.inn : currentDoc.inn,
      counterParty: body.counterParty || currentDoc.counterParty,
      demandsForPayment: body.demandsForPayment || currentDoc.demandsForPayment,
      statusRequirements: body.statusRequirements || currentDoc.statusRequirements,
      fileInvoicePayment: fileInvoicePaymentPath,
      costBranchId: body.costBranchId || currentDoc.costBranchId,
      settlementSpecialistId: body.settlementSpecialistId !== undefined 
        ? body.settlementSpecialistId 
        : currentDoc.settlementSpecialistId,
      statusOfPTiU: body.statusOfPTiU || currentDoc.statusOfPTiU,
      filePTiU: filePTiUPath,
      note: body.note || currentDoc.note,
      fileNote: fileNotePath,
      requirementNumber: body.requirementNumber || currentDoc.requirementNumber,
    };

    const updatedSupplyDoc = await prisma.supplyDocs.update({
      where: { id: supplyDocId },
      data: updateData,
      include: { 
        supplyDocs: true,
        addedBy: true,
        costBranch: true,
        settlementSpecialist: true
      },
    });

    res.status(200).json(updatedSupplyDoc);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

export const deleteSupplyDoc = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const supplyDocId = req.params.id;

    // Get document to delete files
    const supplyDoc = await prisma.supplyDocs.findUnique({
      where: { id: supplyDocId },
    });

    if (!supplyDoc) {
      return res.status(404).json({ error: 'Supply document not found' });
    }

    // Delete all file fields
    if (supplyDoc.fileInvoicePayment) {
      const fullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', supplyDoc.fileInvoicePayment);
      await deleteFileSafely(fullPath);
    }
    if (supplyDoc.fileNote) {
      const fullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', supplyDoc.fileNote);
      await deleteFileSafely(fullPath);
    }
    if (supplyDoc.filePTiU) {
      const fullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', supplyDoc.filePTiU);
      await deleteFileSafely(fullPath);
    }

    // Delete all attachments
    const attachments = await prisma.supplyDocsAttachment.findMany({
      where: { recordId: supplyDocId },
    });

    await Promise.all(
      attachments.map(attachment => {
        const fullPath = path.join(process.cwd(), 'public', 'accounting', 'roc', attachment.source);
        return deleteFileSafely(fullPath);
      })
    );

    // Delete attachments and supply document in a transaction
    await prisma.$transaction([
      prisma.supplyDocsAttachment.deleteMany({
        where: { recordId: supplyDocId },
      }),
      prisma.supplyDocs.delete({
        where: { id: supplyDocId },
      }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};