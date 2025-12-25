import prometheus from 'prom-client'
import { memoryUsage } from "process"
import { calculateCpuUsage } from '../utils/metrics.js'

export const register = new prometheus.Registry()

prometheus.collectDefaultMetrics({ register, prefix: "hub_" })

const httpRequestCount = new prometheus.Counter({
  name: 'hub_http_request_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
})

const httpRequestDuration = new prometheus.Histogram({
  name: 'hub_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
})

const nodejsMemory = new prometheus.Gauge({
  name: "hub_node_memory_usage_bytes",
  help: "Current memory usage of the Node.js process in bytes",
  registers: [register]
})

const nodejsCpuUsage = new prometheus.Gauge({
  name: "hub_node_cpu_usage_percent",
  help: "CPU utilization of the Node.js process in percentage",
  registers: [register]
})

export const metricsMiddleware = (req: any, res: any, next: any) => {
  const end = httpRequestDuration.startTimer()
  
  const usedMemoryBefore = memoryUsage().rss
  const usedCpuBefore = calculateCpuUsage()

  res.on('finish', () => {
    httpRequestCount.inc({ method: req.method, route: req.path, status: res.statusCode })
    end({ method: req.method, route: req.path, status: res.statusCode })
    
    const usedMemoryAfter = memoryUsage().rss
    const usedCpuaAfter = calculateCpuUsage()

    nodejsMemory.set(usedMemoryAfter - usedMemoryBefore)
    nodejsCpuUsage.set(usedCpuaAfter - usedCpuBefore)
  })
  
  next()
}