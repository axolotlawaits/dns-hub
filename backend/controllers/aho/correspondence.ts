import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Types
type MulterFiles = Express.Multer.File[] | undefined;

// Validation schemas
const AttachmentSchema = z.object({
  userAdd: z.string(),
  source: z.string(),
});

const CorrespondenceSchema = z.object({
  ReceiptDate: z.string().datetime(),
  userAdd: z.string().optional(),
  from: z.string(),
  to: z.string(),
  content: z.string(),
  typeMail: z.string(),
  numberMail: z.string(),
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
    res.status(404).json({ error: 'Correspondence not found' });
    return true;
  }
  return false;
};

// Controller methods
export const getCorrespondences = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const correspondences = await prisma.correspondence.findMany({
      include: { attachments: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(correspondences);
  } catch (error) {
    next(error);
  }
};

export const getCorrespondenceById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const correspondence = await prisma.correspondence.findUnique({
      where: { id: req.params.id },
      include: { attachments: true },
    });

    if (!correspondence) {
      return res.status(404).json({ error: 'Correspondence not found' });
    }

    res.status(200).json(correspondence);
  } catch (error) {
    next(error);
  }
};

const processAttachments = async (
  files: MulterFiles,
  correspondenceId: string,
  userAdd: string
) => {
  if (!files || files.length === 0) return;

  const attachmentsData = files.map(file => ({
    userAdd,
    source: file.path,
    record_id: correspondenceId,
  }));

  await prisma.correspondenceAttachment.createMany({ data: attachmentsData });
};

export const createCorrespondence = async (
  req: Request<{}, any, z.infer<typeof CorrespondenceSchema>>,
  res: Response,
  next: NextFunction
) => {
  try {
    logRequest(req);
    const validatedData = CorrespondenceSchema.parse(req.body);
    const files = req.files as MulterFiles;

    const userAdd = validatedData.userAdd || 
                   validatedData.attachments?.[0]?.userAdd;

    if (!userAdd) {
      return res.status(400).json({ error: 'userAdd is required' });
    }

    const userExists = await validateUserExists(userAdd);
    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist' });
    }

    const newCorrespondence = await prisma.correspondence.create({
      data: {
        ReceiptDate: new Date(validatedData.ReceiptDate),
        userAdd,
        from: validatedData.from,
        to: validatedData.to,
        content: validatedData.content,
        typeMail: validatedData.typeMail,
        numberMail: validatedData.numberMail,
      },
    });

    await processAttachments(files, newCorrespondence.id, userAdd);

    const result = await prisma.correspondence.findUnique({
      where: { id: newCorrespondence.id },
      include: { attachments: true },
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    next(error);
  }
};

const deleteAttachments = async (attachmentIds: string[], correspondenceId: string) => {
  if (!attachmentIds.length) return;

  const attachments = await prisma.correspondenceAttachment.findMany({
    where: { 
      id: { in: attachmentIds },
      record_id: correspondenceId 
    }
  });

  await Promise.all(
    attachments.map(async (attachment) => {
      await deleteFileSafely(path.join(attachment.source));
      await prisma.correspondenceAttachment.delete({
        where: { id: attachment.id }
      });
    })
  );
};

export const updateCorrespondence = async (
  req: Request<{ id: string }, any, any>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { body, params, files } = req;
    const correspondenceId = params.id;

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
    await deleteAttachments(attachmentsToDelete, correspondenceId);

    // Process new attachments
    await processAttachments(files as MulterFiles, correspondenceId, body.userAdd || 'unknown');

    // Update correspondence
    const updateData = {
      ReceiptDate: body.ReceiptDate ? new Date(body.ReceiptDate) : undefined,
      userAdd: body.userAdd,
      from: body.from,
      to: body.to,
      content: body.content,
      typeMail: body.typeMail,
      numberMail: body.numberMail,
    };

    const updatedCorrespondence = await prisma.correspondence.update({
      where: { id: correspondenceId },
      data: updateData,
      include: { attachments: true },
    });

    res.status(200).json(updatedCorrespondence);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};

export const deleteCorrespondence = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const correspondenceId = req.params.id;

    // Delete all attachments
    const attachments = await prisma.correspondenceAttachment.findMany({
      where: { record_id: correspondenceId },
    });

    await Promise.all(
      attachments.map(attachment => deleteFileSafely(attachment.source))
    );

    // Delete attachments and correspondence in a transaction
    await prisma.$transaction([
      prisma.correspondenceAttachment.deleteMany({
        where: { record_id: correspondenceId },
      }),
      prisma.correspondence.delete({
        where: { id: correspondenceId },
      }),
    ]);

    res.status(204).end();
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    next(error);
  }
};