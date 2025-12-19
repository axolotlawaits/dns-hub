import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validateData(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((issue: any) => ([issue.path[0], issue.message]))
        const errObj = Object.fromEntries(errorMessages)
        res.status(400).json({errors: errObj})
      } else {
        res.status(500).json({error: 'Internal Server Error'})
      }
    }
  }
}