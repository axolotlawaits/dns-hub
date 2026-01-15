import pino from 'pino'

const transport = pino.transport({
  target: 'pino-loki',
  options: {
    host: process.env.LOKI_URL, 
    batching: true, 
    colorize: true,
    interval: 5, 
    labels: {
      application: 'hub', 
    },
  },
});

const logger = pino({
  level: 'info', 
}, transport)

export default logger