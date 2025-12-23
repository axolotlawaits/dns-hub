import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../server.js';

/**
 * GET /api/polls/active
 * Получить активные опросы с информацией о голосовании пользователя
 */
export const getActivePolls = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = token.userId;

    // Получаем активные опросы с опциями
    const polls = await prisma.poll.findMany({
      where: {
        isActive: true
      },
      include: {
        options: {
          orderBy: {
            order: 'asc'
          },
          include: {
            votes: true
          }
        },
        votes: {
          where: {
            userId: userId
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Формируем ответ с информацией о голосовании пользователя и статистикой
    const pollsWithStats = polls.map(poll => {
      const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);
      const userVote = poll.votes.length > 0 ? poll.votes[0].optionId : null;

      return {
        id: poll.id,
        question: poll.question,
        isActive: poll.isActive,
        createdAt: poll.createdAt,
        userVote: userVote,
        totalVotes: totalVotes,
        options: poll.options.map(option => ({
          id: option.id,
          text: option.text,
          votes: option.votes.length,
          order: option.order
        }))
      };
    });

    res.status(200).json(pollsWithStats);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/polls/:pollId/vote
 * Проголосовать в опросе
 */
export const votePoll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = token.userId;
    const pollId = req.params.pollId;
    const { optionId } = req.body;

    if (!optionId) {
      res.status(400).json({ error: 'optionId is required' });
      return;
    }

    // Проверяем, существует ли опрос и активен ли он
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          where: { id: optionId }
        }
      }
    });

    if (!poll) {
      res.status(404).json({ error: 'Poll not found' });
      return;
    }

    if (!poll.isActive) {
      res.status(400).json({ error: 'Poll is not active' });
      return;
    }

    if (poll.options.length === 0) {
      res.status(400).json({ error: 'Invalid option' });
      return;
    }

    // Проверяем, не голосовал ли пользователь уже
    const existingVote = await prisma.pollVote.findUnique({
      where: {
        pollId_userId: {
          pollId: pollId,
          userId: userId
        }
      }
    });

    if (existingVote) {
      res.status(400).json({ error: 'You have already voted in this poll' });
      return;
    }

    // Создаем голос
    await prisma.pollVote.create({
      data: {
        pollId: pollId,
        optionId: optionId,
        userId: userId
      }
    });

    // Возвращаем обновленный опрос
    const updatedPoll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          orderBy: {
            order: 'asc'
          },
          include: {
            votes: true
          }
        },
        votes: {
          where: {
            userId: userId
          }
        }
      }
    });

    if (!updatedPoll) {
      res.status(404).json({ error: 'Poll not found' });
      return;
    }

    const totalVotes = updatedPoll.options.reduce((sum, option) => sum + option.votes.length, 0);
    const userVote = updatedPoll.votes.length > 0 ? updatedPoll.votes[0].optionId : null;

    res.status(200).json({
      id: updatedPoll.id,
      question: updatedPoll.question,
      isActive: updatedPoll.isActive,
      createdAt: updatedPoll.createdAt,
      userVote: userVote,
      totalVotes: totalVotes,
      options: updatedPoll.options.map(option => ({
        id: option.id,
        text: option.text,
        votes: option.votes.length,
        order: option.order
      }))
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Unique constraint violation - пользователь уже голосовал
      res.status(400).json({ error: 'You have already voted in this poll' });
      return;
    }
    next(error);
  }
};

/**
 * GET /api/polls
 * Получить все опросы (для админов)
 */
export const getAllPolls = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем права доступа (только для админов)
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const polls = await prisma.poll.findMany({
      include: {
        options: {
          orderBy: {
            order: 'asc'
          },
          include: {
            votes: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const pollsWithStats = polls.map(poll => {
      const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);

      return {
        id: poll.id,
        question: poll.question,
        isActive: poll.isActive,
        createdAt: poll.createdAt,
        updatedAt: poll.updatedAt,
        createdBy: poll.createdBy,
        totalVotes: totalVotes,
        options: poll.options.map(option => ({
          id: option.id,
          text: option.text,
          votes: option.votes.length,
          order: option.order
        }))
      };
    });

    res.status(200).json(pollsWithStats);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/polls
 * Создать новый опрос (для админов)
 */
export const createPoll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем права доступа
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { question, options } = req.body;

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: 'Question and at least 2 options are required' });
      return;
    }

    // Создаем опрос с опциями
    const poll = await prisma.poll.create({
      data: {
        question: question,
        isActive: true,
        createdById: token.userId,
        options: {
          create: options.map((option: string, index: number) => ({
            text: option,
            order: index
          }))
        }
      },
      include: {
        options: {
          orderBy: {
            order: 'asc'
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json({
      id: poll.id,
      question: poll.question,
      isActive: poll.isActive,
      createdAt: poll.createdAt,
      createdBy: poll.createdBy,
      totalVotes: 0,
      options: poll.options.map(option => ({
        id: option.id,
        text: option.text,
        votes: 0,
        order: option.order
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/polls/:pollId
 * Обновить опрос (для админов)
 */
export const updatePoll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем права доступа
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const pollId = req.params.pollId;
    const { question, isActive } = req.body;

    const updateData: any = {};
    if (question !== undefined) updateData.question = question;
    if (isActive !== undefined) updateData.isActive = isActive;

    const poll = await prisma.poll.update({
      where: { id: pollId },
      data: updateData,
      include: {
        options: {
          orderBy: {
            order: 'asc'
          },
          include: {
            votes: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    const totalVotes = poll.options.reduce((sum, option) => sum + option.votes.length, 0);

    res.status(200).json({
      id: poll.id,
      question: poll.question,
      isActive: poll.isActive,
      createdAt: poll.createdAt,
      updatedAt: poll.updatedAt,
      createdBy: poll.createdBy,
      totalVotes: totalVotes,
      options: poll.options.map(option => ({
        id: option.id,
        text: option.text,
        votes: option.votes.length,
        order: option.order
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/polls/:pollId
 * Удалить опрос (для админов)
 */
export const deletePoll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Проверяем права доступа
    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'DEVELOPER')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const pollId = req.params.pollId;

    await prisma.poll.delete({
      where: { id: pollId }
    });

    res.status(200).json({ message: 'Poll deleted successfully' });
  } catch (error) {
    next(error);
  }
};

