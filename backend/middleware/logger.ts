import pino from 'pino'
import { Request, Response } from 'express';

let logger: any;

if (process.env.NODE_ENV !== 'production') {
  logger = pino({ level: 'silent' })

} else {
  const transport = pino.transport({
    target: 'pino-loki',
    options: {
      host: process.env.LOKI_URL, 
      batching: true, 
      interval: 5, 
      labels: { application: 'hub' },
    },
  })
  
  logger = pino({ level: 'info', serializers: { error: pino.stdSerializers.err }}, transport)
}

const levelHandler = (req: Request, res: Response, err?: Error) => {
  if (res.statusCode >= 400 && res.statusCode < 500) {
    return 'warn'
  } else if (res.statusCode >= 500 || err) {
    return 'error'
  } else if (res.statusCode >= 300 && res.statusCode < 400) {
    return 'silent'
  }
  return 'info'
} 

export { logger, levelHandler }
