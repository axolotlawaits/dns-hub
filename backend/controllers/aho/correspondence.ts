import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Validation schemas
const CorrespondenceSchema = z.object({
  ReceiptDate: z.string().datetime(),
  userAdd: z.string().optional(),
  from: z.string(),
  to: z.string(),
  content: z.string(),
  typeMail: z.string(),
  numberMail: z.string(),
  attachments: z.array(
    z.object({
      userAdd: z.string(),
      source: z.string(),
    })
  ).optional(),
});

// Helper functions
const logRequest = (req: Request) => {
  console.log('Request Body:', req.body);
  console.log('Request Files:', req.files);
};

const validateUserExists = async (userAdd: string) => {
  return await prisma.user.findUnique({
    where: { id: userAdd },
  });
};

// Controller methods
export const getCorrespondences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
): Promise<void> => {
  try {
    const correspondence = await prisma.correspondence.findUnique({
      where: { id: req.params.id },
      include: { attachments: true },
    });

    if (!correspondence) {
      res.status(404).json({ error: 'Correspondence not found' });
      return;
    }

    res.status(200).json(correspondence);
  } catch (error) {
    next(error);
  }
};

export const createCorrespondence = async (
  req: Request<{}, any, z.infer<typeof CorrespondenceSchema>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    logRequest(req);
    const validatedData = CorrespondenceSchema.parse(req.body);
    const attachments = req.files as Express.Multer.File[];

    let userAdd = validatedData.userAdd;
    if (!userAdd && validatedData.attachments && validatedData.attachments.length > 0) {
      userAdd = validatedData.attachments[0].userAdd;
    }

    if (userAdd) {
      const userExists = await validateUserExists(userAdd);
      if (!userExists) {
        res.status(400).json({ error: 'User does not exist' });
        return;
      }
    } else {
      res.status(400).json({ error: 'userAdd is required' });
      return;
    }

    const newCorrespondence = await prisma.correspondence.create({
      data: {
        ReceiptDate: new Date(validatedData.ReceiptDate),
        userAdd: userAdd,
        from: validatedData.from,
        to: validatedData.to,
        content: validatedData.content,
        typeMail: validatedData.typeMail,
        numberMail: validatedData.numberMail,
      },
    });

    if (attachments && attachments.length > 0) {
      const newAttachments = attachments.map(file => ({
        userAdd: validatedData.attachments?.find(att => att.userAdd === file.fieldname)?.userAdd || userAdd,
        source: file.path,
        record_id: newCorrespondence.id,
      }));

      await prisma.correspondenceAttachment.createMany({
        data: newAttachments,
      });
    }

    const result = await prisma.correspondence.findUnique({
      where: { id: newCorrespondence.id },
      include: { attachments: true },
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
      return;
    }
    next(error);
  }
};

export const updateCorrespondence = async (
  req: Request<{ id: string }, any, any>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body;
    const attachmentsToDelete = Array.isArray(body.attachmentsToDelete)
      ? body.attachmentsToDelete
      : body.attachmentsToDelete
        ? [body.attachmentsToDelete]
        : [];

    const updateData: any = {
      ReceiptDate: body.ReceiptDate ? new Date(body.ReceiptDate) : undefined,
      userAdd: body.userAdd,
      from: body.from,
      to: body.to,
      content: body.content,
      typeMail: body.typeMail,
      numberMail: body.numberMail,
    };

    // Удаление вложений
    if (attachmentsToDelete.length > 0) {
      for (const attachmentId of attachmentsToDelete) {
        const attachment = await prisma.correspondenceAttachment.findUnique({
          where: { id: attachmentId }
        });

        if (attachment) {
          // Удаление файла
          const filePath = path.join(attachment.source);
          try {
            await fs.unlink(filePath);
            console.log(`File deleted successfully: ${filePath}`);
          } catch (unlinkError) {
            console.error(`Error deleting file at ${filePath}:`, unlinkError);
            // Optionally, handle the error or return a specific response
          }

          // Удаление записи из БД
          await prisma.correspondenceAttachment.delete({
            where: { id: attachmentId }
          });
        }
      }
    }

    // Добавление новых вложений
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      const newAttachments = files.map(file => ({
        userAdd: body.userAdd || 'unknown',
        source:  file.path,
        record_id: req.params.id,
      }));

      await prisma.correspondenceAttachment.createMany({
        data: newAttachments,
      });
    }

    // Обновление основной записи
    const updatedCorrespondence = await prisma.correspondence.update({
      where: { id: req.params.id },
      data: updateData,
      include: { attachments: true },
    });

    res.status(200).json(updatedCorrespondence);
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Correspondence not found' });
      return;
    }
    next(error);
  }
};

export const deleteCorrespondence = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // First delete all attachments
    const attachments = await prisma.correspondenceAttachment.findMany({
      where: { record_id: req.params.id },
    });

    for (const attachment of attachments) {
      const filePath = attachment.source;
      try {
        await fs.unlink(filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    await prisma.correspondenceAttachment.deleteMany({
      where: { record_id: req.params.id },
    });

    // Then delete the correspondence
    await prisma.correspondence.delete({
      where: { id: req.params.id },
    });

    res.status(204).end();
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Correspondence not found' });
      return;
    }
    next(error);
  }
};
