import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';

// Validation schemas
const SliderSchema = z.object({
  name: z.string(),
  category: z.string(),
  visible: z.boolean().optional().default(false),
  timeVisible: z.number().optional().default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  url: z.string().url().optional().default('https://dns-shop.ru/'),
  add: z.boolean().optional().default(false),
  sale: z.boolean().optional().default(false),
  order: z.number().int().optional().default(1),
  addedById: z.string(),
  updatedById: z.string().optional(),
});

// Helper functions
const logRequest = (req: Request) => {
  console.log('[Slider] Request Body:', req.body);
  console.log('[Slider] Request File:', req.file);
};

const validateUserExists = async (userId: string) => {
  return prisma.user.findUnique({ where: { id: userId } });
};

const deleteFileSafely = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
    console.log(`[Slider] File deleted successfully: ${filePath}`);
  } catch (error) {
    console.error(`[Slider] Error deleting file at ${filePath}:`, error);
  }
};

// Controller methods
export const getAllSliders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sliders = await prisma.slider.findMany({
      orderBy: { order: 'asc' },
      include: {
        addedBy: true,
        updatedBy: true,
      },
    });
    res.status(200).json(sliders);
  } catch (error) {
    next(error);
  }
};

export const getSliderById = async (
  req: Request,
  res: Response,
  next: NextFunction
):Promise<any> => {
  try {
    const slider = await prisma.slider.findUnique({
      where: { id: req.params.id },
      include: {
        addedBy: true,
        updatedBy: true,
      },
    });

    if (!slider) {
      return res.status(404).json({ error: 'Slider not found' });
    }

    res.status(200).json(slider);
  } catch (error) {
    next(error);
  }
};

export const createSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    logRequest(req);
    
    const validatedData = SliderSchema.parse({
      ...req.body,
      visible: req.body.visible === 'true',
      add: req.body.add === 'true',
      sale: req.body.sale === 'true',
      timeVisible: parseFloat(req.body.timeVisible),
      order: parseInt(req.body.order, 10),
    });

    // Validate user
    const userExists = await validateUserExists(validatedData.addedById);
    if (!userExists) {
      return res.status(400).json({ error: 'User does not exist' });
    }

    const newSlider = await prisma.slider.create({
      data: {
        name: validatedData.name,
        category: validatedData.category,
        visible: validatedData.visible,
        timeVisible: validatedData.timeVisible,
        attachment: req.file?.filename || '', // Сохраняем название файла как оно сохранено на диске
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : null,
        endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
        url: validatedData.url,
        add: validatedData.add,
        sale: validatedData.sale,
        order: validatedData.order,
        addedById: validatedData.addedById,
      },
    });


    const result = await prisma.slider.findUnique({
      where: { id: newSlider.id },
      include: {
        addedBy: true,
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

export const updateSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { body, params, file } = req;
    const sliderId = params.id;

    // Check if slider exists
    const sliderExists = await prisma.slider.findUnique({
      where: { id: sliderId }
    });

    if (!sliderExists) {
      return res.status(404).json({ error: 'Slider not found' });
    }

    // Parse and validate data
    const validatedData = SliderSchema.partial().parse({
      ...body,
      visible: body.visible === 'true',
      add: body.add === 'true',
      sale: body.sale === 'true',
      timeVisible: body.timeVisible ? parseFloat(body.timeVisible) : undefined,
      order: body.order ? parseInt(body.order, 10) : undefined,
    });

    // Validate user if provided
    if (validatedData.updatedById) {
      const userExists = await validateUserExists(validatedData.updatedById);
      if (!userExists) {
        return res.status(400).json({ error: 'Updating user does not exist' });
      }
    }

    // Delete old file if new one is uploaded
    if (file && sliderExists.attachment) {
      await deleteFileSafely(path.join('public/uploads/sliders/', sliderExists.attachment));
    }

    // Prepare update data
    const updateData: Prisma.SliderUpdateInput = {
      name: validatedData.name,
      category: validatedData.category,
      visible: validatedData.visible,
      timeVisible: validatedData.timeVisible,
      startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
      endDate: validatedData.endDate ? new Date(validatedData.endDate) : undefined,
      url: validatedData.url,
      add: validatedData.add,
      sale: validatedData.sale,
      order: validatedData.order,
      updatedAt: new Date(),
    };

    if (file) {
      updateData.attachment = file.filename; // Сохраняем название файла как оно сохранено на диске
    }

    if (validatedData.updatedById) {
      updateData.updatedBy = { connect: { id: validatedData.updatedById } };
    }

    const updatedSlider = await prisma.slider.update({
      where: { id: sliderId },
      data: updateData,
      include: {
        addedBy: true,
        updatedBy: true,
      },
    });

    res.status(200).json(updatedSlider);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
      }
      return res.status(400).json({ 
        error: 'Database error',
        details: error.meta 
      });
    }
    next(error);
  }
};

export const deleteSlider = async (
  req: Request,
  res: Response,
  next: NextFunction
):Promise<any> => {
  try {
    const sliderId = req.params.id;

    // Get slider to delete
    const slider = await prisma.slider.findUnique({
      where: { id: sliderId }
    });

    if (!slider) {
      return res.status(404).json({ error: 'Slider not found' });
    }

    // Delete attachment file if exists
    if (slider.attachment) {
      await deleteFileSafely(path.join('/public/add/slider', slider.attachment));
    }

    // Delete slider record
    await prisma.slider.delete({
      where: { id: sliderId },
    });

    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Slider not found' });
    }
    next(error);
  }
};