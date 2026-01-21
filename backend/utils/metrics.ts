import { cpus } from "os"

export const calculateCpuUsage = () => {
  const previousTotalTime = process.hrtime()[0]; // Store previous total CPU time

  // Get current CPU usage data
  const cpusData = cpus();

  // Calculate cumulative CPU times
  const currentTotalTime = cpusData.reduce(
    (acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    0
  );

  // Calculate CPU usage based on time elapsed and total CPU time
  const idleTime = currentTotalTime - previousTotalTime;
  const cpuUsage = 100 - (idleTime / currentTotalTime) * 100;

  // Store current total CPU time for the next calculation
  process.hrtime()[0] = currentTotalTime;

  return cpuUsage;
};