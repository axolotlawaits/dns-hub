import pino from 'pino'

let logger;

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
  
  logger = pino({ level: 'info' }, transport)
}

export default logger
