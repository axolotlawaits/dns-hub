import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Types
type MulterFiles = Express.Multer.File[] | undefined;

// Validation schemas
const RKAttachmentSchema = z.object({
  userAddId: z.string(),
  source: z.string(),
  type: z.string(),
  sizeXY: z.string().optional(),
  сlarification: z.string().optional(),
});

const RKSchema = z.object({
  userAddId: z.string(),
  userUpdatedId: z.string().optional(), // Добавлено
  branchId: z.string(),
  agreedTo: z.string().datetime(),
  sizeXY: z.string(),
  сlarification: z.string(),
  typeStructureId: z.string(),
  approvalStatusId: z.string(),
  attachments: z.array(RKAttachmentSchema).optional(),
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

const validateTypeExists = async (typeId: string) => {
  return prisma.type.findUnique({ where: { id: typeId } });
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
    res.status(404).json({ error: 'Record not found' });
    return true;
  }
  return false;
};

// Controller methods
export const getRKList = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rkList = await prisma.rK.findMany({
      include: {
        userAdd: true,
        userUpdated: true,
        branch: true,
        typeStructure: true,
        approvalStatus: true,
        rkAttachment: true
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(rkList);
  } catch (error) {
    next(error);
  }
};

export const getRKById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const rk = await prisma.rK.findUnique({
      where: { id: req.params.id },
      include: {
        userAdd: true,
        userUpdated: true,
        branch: true,
        typeStructure: true,
        approvalStatus: true,
        rkAttachment: true
      },
    });
    if (!rk) {
      return res.status(404).json({ error: 'RK record not found' });
    }
    res.status(200).json(rk);
  } catch (error) {
    next(error);
  }
};

const processRKAttachments = async (
  files: MulterFiles,
  rkId: string,
  userAddId: string,
  attachmentData?: Partial<z.infer<typeof RKAttachmentSchema>>
): Promise<any> => {
  if (!files || !Array.isArray(files)) return;
  
  const attachmentsData = files.map(file => ({
    userAddId,
    source: file.path,
    type: file.mimetype,
    recordId: rkId,
    sizeXY: attachmentData?.sizeXY || '',
    сlarification: attachmentData?.сlarification || '',
  }));

  await prisma.rKAttachment.createMany({ data: attachmentsData });
};

export const createRK = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    logRequest(req);
    const validatedData = RKSchema.parse(req.body);
    const files = req.files as MulterFiles;

    // Validate all required relations exist
    const [userExists, branchExists, typeStructureExists, approvalStatusExists] = await Promise.all([
      validateUserExists(validatedData.userAddId),
      validateBranchExists(validatedData.branchId),
      validateTypeExists(validatedData.typeStructureId),
      validateTypeExists(validatedData.approvalStatusId),
    ]);

    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist' });
    }
    if (!branchExists) {
      return res.status(400).json({ error: 'Branch does not exist' });
    }
    if (!typeStructureExists) {
      return res.status(400).json({ error: 'Type Structure does not exist' });
    }
    if (!approvalStatusExists) {
      return res.status(400).json({ error: 'Approval Status does not exist' });
    }

    const createData = {
      userAddId: validatedData.userAddId,
      userUpdatedId: validatedData.userUpdatedId || validatedData.userAddId, // Используем userAddId если userUpdatedId не указан
      branchId: validatedData.branchId,
      agreedTo: new Date(validatedData.agreedTo),
      sizeXY: validatedData.sizeXY,
      сlarification: validatedData.сlarification,
      typeStructureId: validatedData.typeStructureId,
      approvalStatusId: validatedData.approvalStatusId,
    };

    const newRK = await prisma.rK.create({
      data: createData,
    });

    if (Array.isArray(files) && files.length > 0) {
      await processRKAttachments(files, newRK.id, validatedData.userAddId, {
        sizeXY: validatedData.sizeXY,
        сlarification: validatedData.сlarification
      });
    }

    const result = await prisma.rK.findUnique({
      where: { id: newRK.id },
      include: {
        userAdd: true,
        userUpdated: true,
        branch: true,
        typeStructure: true,
        approvalStatus: true,
        rkAttachment: true
      },
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    next(error);
  }
};

const deleteRKAttachments = async (attachmentIds: string[], rkId: string) => {
  if (!attachmentIds.length) return;
  const attachments = await prisma.rKAttachment.findMany({
    where: {
      id: { in: attachmentIds },
      recordId: rkId
    }
  });

  await Promise.all(
    attachments.map(async (attachment) => {
      await deleteFileSafely(path.join(attachment.source));
      await prisma.rKAttachment.delete({
        where: { id: attachment.id }
      });
    })
  );
};

export const updateRK = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { body, params, files } = req;
    const rkId = params.id;

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
    await deleteRKAttachments(attachmentsToDelete, rkId);

    // Process new attachments
    if (Array.isArray(files) && files.length > 0) {
      const userAddId = body.userAddId || body.userUpdatedId || 'unknown';
      await processRKAttachments(files, rkId, userAddId, {
        sizeXY: body.sizeXY,
        сlarification: body.сlarification
      });
    }

    // Prepare update data
    const updateData: {
      userUpdatedId?: string;
      branchId?: string;
      agreedTo?: Date;
      sizeXY?: string;
      сlarification?: string;
      typeStructureId?: string;
      approvalStatusId?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    // Only include fields that are being updated
    if (body.userUpdatedId) updateData.userUpdatedId = body.userUpdatedId;
    if (body.branchId) updateData.branchId = body.branchId;
    if (body.agreedTo) updateData.agreedTo = new Date(body.agreedTo);
    if (body.sizeXY) updateData.sizeXY = body.sizeXY;
    if (body.сlarification) updateData.сlarification = body.сlarification;
    if (body.typeStructureId) updateData.typeStructureId = body.typeStructureId;
    if (body.approvalStatusId) updateData.approvalStatusId = body.approvalStatusId;

    // Validate relations if they are being updated
    if (body.branchId) {
      const branchExists = await validateBranchExists(body.branchId);
      if (!branchExists) {
        return res.status(400).json({ error: 'Branch does not exist' });
      }
    }
    if (body.typeStructureId) {
      const typeStructureExists = await validateTypeExists(body.typeStructureId);
      if (!typeStructureExists) {
        return res.status(400).json({ error: 'Type Structure does not exist' });
      }
    }
    if (body.approvalStatusId) {
      const approvalStatusExists = await validateTypeExists(body.approvalStatusId);
      if (!approvalStatusExists) {
        return res.status(400).json({ error: 'Approval Status does not exist' });
      }
    }

    const updatedRK = await prisma.rK.update({
      where: { id: rkId },
      data: updateData,
      include: {
        userAdd: true,
        userUpdated: true,
        branch: true,
        typeStructure: true,
        approvalStatus: true,
        rkAttachment: true
      },
    });

    res.status(200).json(updatedRK);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

export const deleteRK = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const rkId = req.params.id;

    // Delete all attachments
    const attachments = await prisma.rKAttachment.findMany({
      where: { recordId: rkId },
    });

    await Promise.all(
      attachments.map(attachment => deleteFileSafely(attachment.source))
    );

    // Delete attachments and RK in a transaction
    await prisma.$transaction([
      prisma.rKAttachment.deleteMany({
        where: { recordId: rkId },
      }),
      prisma.rK.delete({
        where: { id: rkId },
      }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};