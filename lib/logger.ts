import * as winston from 'winston'

const { combine, timestamp, json, errors, colorize, printf } = winston.format

// Custom format for console output in development
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  return `[${timestamp}] ${level}: ${message} ${stack || ''}${metaString}`
})

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? combine(colorize(), timestamp(), consoleFormat)
        : combine(timestamp(), json())
    })
  ]
})

export { logger }
export default logger
