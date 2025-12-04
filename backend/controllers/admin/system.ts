import { Request, Response } from 'express';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import { prisma } from '../../server.js';
import { SocketIOService } from '../../socketio.js';

const execAsync = promisify(exec);

// Проверка роли DEVELOPER
const checkDeveloperRole = async (req: Request, res: Response): Promise<boolean> => {
  try {
    const token = (req as any).token;
    if (!token || !token.userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: token.userId },
      select: { role: true }
    });

    if (!user || user.role !== 'DEVELOPER') {
      res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуется роль DEVELOPER'
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error checking developer role:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
    return false;
  }
};

// Вспомогательная функция для выполнения команд с таймаутом
const execWithTimeout = async (command: string, timeout: number = 2000): Promise<any> => {
  return Promise.race([
    execAsync(command),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Command timeout')), timeout)
    )
  ]);
};

// Вынесенные функции для параллельного выполнения
const getCpuUsage = async (cpus: os.CpuInfo[]): Promise<number> => {
  try {
    // Linux/Unix - используем несколько методов
    // Метод 1: top (может не работать в Docker контейнерах)
    try {
      const command = "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'";
      const { stdout } = await execWithTimeout(command, 2000);
      const cpuUsage = parseFloat(stdout.trim());
      if (!isNaN(cpuUsage) && cpuUsage >= 0 && cpuUsage <= 100) {
        return cpuUsage;
      }
    } catch (e) {
      // Игнорируем ошибку команды top
    }
    
    // Метод 2: Вычисление на основе времени CPU (работает везде, включая Docker)
    try {
      const cpus1 = os.cpus();
      await new Promise(resolve => setTimeout(resolve, 100)); // Ждем 100ms
      const cpus2 = os.cpus();
      
      let totalIdle = 0;
      let totalTick = 0;
      
      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i].times;
        const cpu2 = cpus2[i].times;
        
        const idle = cpu2.idle - cpu1.idle;
        const user = cpu2.user - cpu1.user;
        const nice = cpu2.nice - cpu1.nice;
        const sys = cpu2.sys - cpu1.sys;
        const irq = cpu2.irq - cpu1.irq;
        
        totalIdle += idle;
        totalTick += user + nice + sys + irq + idle;
      }
      
      if (totalTick > 0) {
        const cpuUsage = 100 - (totalIdle / totalTick) * 100;
        return Math.min(Math.max(cpuUsage, 0), 100);
      }
    } catch (e) {
      // Игнорируем ошибку вычисления
    }
    
    // Метод 3: Fallback на load average для Linux (может быть неточным)
    const loadAvg = os.loadavg();
    if (loadAvg[0] > 0 && cpus.length > 0) {
      return Math.min((loadAvg[0] / cpus.length) * 100, 100);
    }
    return 0;
  } catch (e) {
    console.error('❌ [System] Error getting CPU usage:', e);
    return 0;
  }
};

interface DiskInfo {
  device: string;
  mountPoint: string;
  total: number;
  used: number;
  free: number;
  percentage: number;
  filesystem?: string;
  type?: string;
}

const getDiskUsage = async (): Promise<DiskInfo[]> => {
  const disks: DiskInfo[] = [];

  try {
    // Linux/Unix - получаем все разделы
    try {
      // Используем df -B1 для получения байтов напрямую, исключаем tmpfs и другие виртуальные файловые системы
      const { stdout } = await execWithTimeout("df -B1 -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2", 2000);
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 6) {
          // Формат: Filesystem 1B-blocks Used Available Use% Mounted on
          const filesystem = parts[0];
          const total = parseInt(parts[1]);
          const used = parseInt(parts[2]);
          const free = parseInt(parts[3]);
          const mountPoint = parts[5];
          
          if (!isNaN(total) && !isNaN(used) && !isNaN(free) && total > 0) {
            const percentage = (used / total) * 100;
            disks.push({
              device: filesystem,
              mountPoint: mountPoint,
              total: total,
              used: used,
              free: free,
              percentage: percentage,
              filesystem: filesystem,
            });
          }
        }
      }
    } catch (e) {
      // Fallback на стандартный df -k
      try {
        const { stdout } = await execWithTimeout("df -k -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2", 2000);
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            const filesystem = parts[0];
            const total = parseInt(parts[1]) * 1024;
            const used = parseInt(parts[2]) * 1024;
            const free = parseInt(parts[3]) * 1024;
            const mountPoint = parts[5];
            
            if (!isNaN(total) && !isNaN(used) && !isNaN(free) && total > 0) {
              const percentage = (used / total) * 100;
              disks.push({
                device: filesystem,
                mountPoint: mountPoint,
                total: total,
                used: used,
                free: free,
                percentage: percentage,
                filesystem: filesystem,
              });
            }
          }
        }
      } catch (e2) {
        console.error('❌ [System] Error getting disk usage (Linux):', e2);
      }
    }
  } catch (error) {
    console.error('❌ [System] Error getting disk usage:', error);
  }
  
  // Сортируем диски по имени устройства
  disks.sort((a, b) => a.device.localeCompare(b.device));
  
  return disks;
};

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user?: string;
  command?: string;
}

const getProcessesInfo = async (): Promise<{ total: number; running: number }> => {
  let totalProcesses = 0;
  let runningProcesses = 0;

  try {
    // Linux/Unix - команда ps должна работать на Ubuntu
    try {
      const { stdout } = await execWithTimeout('ps aux | wc -l', 1000);
      totalProcesses = parseInt(stdout.trim()) - 1; // Вычитаем заголовок
      runningProcesses = totalProcesses; // Упрощаем для скорости
    } catch (e) {
      // Fallback: пробуем альтернативную команду
      try {
        const { stdout } = await execWithTimeout('ps -e | wc -l', 1000);
        totalProcesses = parseInt(stdout.trim());
        runningProcesses = totalProcesses;
      } catch (e2) {
        console.error('❌ [System] Error getting processes info:', e2);
      }
    }
  } catch (error) {
    // Возвращаем значения по умолчанию
  }
  
  return { total: totalProcesses, running: runningProcesses };
};

// Получение топ процессов по CPU и Memory (Linux-only)
const getTopProcesses = async (limit: number = 10): Promise<{ cpu: ProcessInfo[]; memory: ProcessInfo[] }> => {
  const topCpu: ProcessInfo[] = [];
  const topMemory: ProcessInfo[] = [];

  try {
    // Топ по CPU
    const { stdout: cpuStdout } = await execWithTimeout(
      `ps aux --sort=-%cpu --no-headers | head -n ${limit} | awk '{print $2,$3,$4,$11,$1}'`,
      2000
    );
    const cpuLines = cpuStdout.trim().split('\n').filter(Boolean);
    cpuLines.forEach((line: string) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const cpu = parseFloat(parts[1]);
        const mem = parseFloat(parts[2]);
        topCpu.push({
          pid: parseInt(parts[0], 10),
          cpu: isNaN(cpu) ? 0 : Math.min(Math.max(cpu, 0), 100),
          memory: isNaN(mem) ? 0 : Math.min(Math.max(mem, 0), 100),
          name: parts[3].split('/').pop() || parts[3],
          user: parts[4],
        });
      }
    });

    // Топ по памяти
    const { stdout: memStdout } = await execWithTimeout(
      `ps aux --sort=-%mem --no-headers | head -n ${limit} | awk '{print $2,$3,$4,$11,$1}'`,
      2000
    );
    const memLines = memStdout.trim().split('\n').filter(Boolean);
    memLines.forEach((line: string) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const cpu = parseFloat(parts[1]);
        const mem = parseFloat(parts[2]);
        topMemory.push({
          pid: parseInt(parts[0], 10),
          cpu: isNaN(cpu) ? 0 : Math.min(Math.max(cpu, 0), 100),
          memory: isNaN(mem) ? 0 : Math.min(Math.max(mem, 0), 100),
          name: parts[3].split('/').pop() || parts[3],
          user: parts[4],
        });
      }
    });
  } catch (error) {
    console.error('❌ [System] Error getting top processes (Linux):', error);
  }

  return { cpu: topCpu.slice(0, limit), memory: topMemory.slice(0, limit) };
};

// Получение информации о Swap памяти
const getSwapInfo = async (): Promise<{ total: number; used: number; free: number; percentage: number }> => {
  let swapTotal = 0;
  let swapUsed = 0;
  let swapFree = 0;
  let swapPercentage = 0;

  try {
    // Linux/Unix - используем free или /proc/swaps
    try {
      const { stdout } = await execWithTimeout('free -b | grep Swap', 1000);
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        swapTotal = parseInt(parts[1]);
        swapUsed = parseInt(parts[2]);
        swapFree = parseInt(parts[3]);
        swapPercentage = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;
      }
    } catch (e) {
      // Fallback на /proc/swaps
      try {
        const fs = await import('fs');
        const swapsContent = fs.readFileSync('/proc/swaps', 'utf-8');
        const lines = swapsContent.trim().split('\n').slice(1); // Пропускаем заголовок
        let total = 0;
        let used = 0;
        lines.forEach((line: string) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            total += parseInt(parts[2]) * 1024; // Конвертируем из KB в байты
            used += parseInt(parts[3]) * 1024;
          }
        });
        swapTotal = total;
        swapUsed = used;
        swapFree = total - used;
        swapPercentage = total > 0 ? (used / total) * 100 : 0;
      } catch (e2) {
        console.error('❌ [System] Error getting swap info:', e2);
      }
    }
  } catch (error) {
    console.error('❌ [System] Error getting swap info:', error);
  }

  return { total: swapTotal, used: swapUsed, free: swapFree, percentage: swapPercentage };
};

// Получение сетевой активности (трафик)
const getNetworkActivity = async (): Promise<{ 
  interfaces: Array<{ 
    name: string; 
    rxBytes: number; 
    txBytes: number; 
    rxPackets: number; 
    txPackets: number;
    rxErrors: number;
    txErrors: number;
  }> 
}> => {
  const interfaces: Array<{
    name: string;
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
    rxErrors: number;
    txErrors: number;
  }> = [];

  try {
    // Linux/Unix - используем /proc/net/dev
    const fs = await import('fs');
    const netDevContent = fs.readFileSync('/proc/net/dev', 'utf-8');
    const lines = netDevContent.trim().split('\n').slice(2); // Пропускаем заголовки
    
    lines.forEach((line: string) => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 10) {
        const name = parts[0].replace(':', '');
        const rxBytes = parseInt(parts[1]);
        const rxPackets = parseInt(parts[2]);
        const rxErrors = parseInt(parts[3]);
        const txBytes = parseInt(parts[9]);
        const txPackets = parseInt(parts[10]);
        const txErrors = parseInt(parts[11]);
        
        if (!name.startsWith('lo') && !isNaN(rxBytes) && !isNaN(txBytes)) {
          interfaces.push({
            name,
            rxBytes,
            txBytes,
            rxPackets,
            txPackets,
            rxErrors,
            txErrors,
          });
        }
      }
    });
  } catch (error) {
    console.error('❌ [System] Error getting network activity:', error);
  }

  return { interfaces };
};

// Получение температуры (если доступно)
const getTemperature = async (): Promise<{ 
  cpu?: number; 
  gpu?: number; 
  disks?: Array<{ device: string; temperature: number }> 
}> => {
  const temps: { cpu?: number; gpu?: number; disks?: Array<{ device: string; temperature: number }> } = {};

  try {
    // Linux/Unix - используем sensors или /sys/class/thermal
    try {
      // CPU температура через sensors
      try {
        const { stdout } = await execWithTimeout('sensors 2>/dev/null | grep -i "cpu temp\\|core 0" | head -1', 1000);
        const tempMatch = stdout.match(/(\d+\.?\d*)/);
        if (tempMatch) {
          temps.cpu = parseFloat(tempMatch[1]);
        }
      } catch (e) {
        // Fallback на /sys/class/thermal
        try {
          const fs = await import('fs');
          const thermalZones = fs.readdirSync('/sys/class/thermal').filter((zone: string) => zone.startsWith('thermal_zone'));
          for (const zone of thermalZones.slice(0, 3)) {
            try {
              const type = fs.readFileSync(`/sys/class/thermal/${zone}/type`, 'utf-8').trim();
              if (type.toLowerCase().includes('cpu') || type.toLowerCase().includes('x86')) {
                const temp = parseInt(fs.readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf-8').trim());
                if (!isNaN(temp)) {
                  temps.cpu = temp / 1000; // Конвертируем из миллиградусов
                  break;
                }
              }
            } catch (e2) {
              // Пропускаем эту зону
            }
          }
        } catch (e2) {
          // Не удалось получить температуру CPU
        }
      }

      // GPU температура через nvidia-smi или аналогичные инструменты
      try {
        const { stdout } = await execWithTimeout('nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null', 1000);
        const gpuTemp = parseInt(stdout.trim());
        if (!isNaN(gpuTemp)) {
          temps.gpu = gpuTemp;
        }
      } catch (e) {
        // nvidia-smi недоступен или нет NVIDIA GPU
      }

      // Температура дисков через hddtemp или smartctl
      try {
        const { stdout } = await execWithTimeout('hddtemp /dev/sd? 2>/dev/null | head -5', 2000);
        const lines = stdout.trim().split('\n');
        const diskTemps: Array<{ device: string; temperature: number }> = [];
        lines.forEach((line: string) => {
          const match = line.match(/(\/dev\/\w+):\s+(\d+)/);
          if (match) {
            diskTemps.push({
              device: match[1],
              temperature: parseInt(match[2]),
            });
          }
        });
        if (diskTemps.length > 0) {
          temps.disks = diskTemps;
        }
      } catch (e) {
        // hddtemp недоступен
      }
    } catch (e) {
      console.error('❌ [System] Error getting temperature:', e);
    }
  } catch (error) {
    console.error('❌ [System] Error getting temperature:', error);
  }

  return temps;
};

// Получение расширенной информации о системе
const getExtendedSystemInfo = async (): Promise<any> => {
  const info: any = {
    environment: process.env.NODE_ENV || 'unknown',
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    versions: process.versions,
  };

  try {
    // Linux/Unix - дополнительная информация
    try {
      // Информация о загрузке системы
      const { stdout: uptime } = await execWithTimeout('uptime', 1000);
      info.uptimeString = uptime.trim();
      
      // Информация о ядре
      const { stdout: kernel } = await execWithTimeout('uname -r', 1000);
      info.kernel = kernel.trim();
      
      // Информация о дистрибутиве
      try {
        const fs = await import('fs');
        if (fs.existsSync('/etc/os-release')) {
          const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
          const lines = osRelease.split('\n');
          const osInfo: any = {};
          lines.forEach((line: string) => {
            const [key, value] = line.split('=');
            if (key && value) {
              osInfo[key] = value.replace(/"/g, '');
            }
          });
          info.distribution = osInfo;
        }
      } catch (e) {
        // Игнорируем ошибки чтения os-release
      }
    } catch (e) {
      console.error('❌ [System] Error getting extended system info:', e);
    }
  } catch (error) {
    console.error('❌ [System] Error getting extended system info:', error);
  }

  return info;
};

// Получение метрик производительности (API, БД)
const getPerformanceMetrics = async (): Promise<any> => {
  const metrics: any = {
    api: {
      totalRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
    },
    database: {
      totalQueries: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      connectionPool: {
        active: 0,
        idle: 0,
        total: 0,
      },
    },
    memory: {
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
      rss: process.memoryUsage().rss,
    },
  };

  try {
    // Получаем информацию о пуле соединений Prisma (если доступно)
    // Prisma не предоставляет прямой API для этого, но можем оценить через метрики процесса
    const memUsage = process.memoryUsage();
    metrics.memory.heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    metrics.memory.heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    metrics.memory.rssMB = Math.round(memUsage.rss / 1024 / 1024);
    
    // В реальном приложении здесь можно добавить middleware для отслеживания запросов
    // Пока возвращаем базовую информацию
  } catch (error) {
    console.error('❌ [System] Error getting performance metrics:', error);
  }

  return metrics;
};

// Получение информации о безопасности (активные сессии, последние логи)
const getSecurityInfo = async (): Promise<any> => {
  const security: any = {
    activeSessions: 0,
    recentLogins: [],
    suspiciousActivity: [],
  };

  try {
    // Получаем информацию о пользователях и их последней активности
    const recentUsers = await prisma.user.findMany({
      take: 10,
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    security.recentLogins = recentUsers.map((user: any) => ({
      userId: user.id,
      email: user.email,
      role: user.role,
      lastActivity: new Date(), // В реальном приложении можно добавить поле lastSeen в схему
    }));

    // Подсчитываем общее количество пользователей как активные сессии
    const activeUsers = await prisma.user.count();

    security.activeSessions = activeUsers;

    // Проверяем на подозрительную активность (много пользователей с одинаковым IP, частые запросы и т.д.)
    // В реальном приложении здесь можно добавить более сложную логику
  } catch (error) {
    console.error('❌ [System] Error getting security info:', error);
  }

  return security;
};

const getGpuInfo = async (): Promise<any> => {
  let gpuInfo: any = null;
  const gpuTimeout = 1500; // 1.5 секунды максимум на получение GPU информации
  
  const fetchGpuInfo = async () => {
    // Linux/Unix - используем lspci для получения информации о GPU
    // lspci обычно установлен на Ubuntu по умолчанию
    try {
      const { stdout } = await execWithTimeout("lspci | grep -i vga", 2000);
      if (stdout.trim()) {
        const gpuMatch = stdout.match(/VGA compatible controller: (.+)/i);
        if (gpuMatch) {
          gpuInfo = {
            model: gpuMatch[1].trim(),
            vendor: gpuMatch[1].includes('NVIDIA') ? 'NVIDIA' : 
                    gpuMatch[1].includes('AMD') || gpuMatch[1].includes('Radeon') ? 'AMD' :
                    gpuMatch[1].includes('Intel') ? 'Intel' : 'Unknown',
          };
          
          // Пытаемся получить дополнительную информацию через nvidia-smi (если NVIDIA)
          if (gpuMatch[1].includes('NVIDIA')) {
            try {
              const { stdout: nvidiaInfo } = await execWithTimeout('nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>/dev/null', 2000);
              if (nvidiaInfo.trim()) {
                const parts = nvidiaInfo.trim().split(',');
                if (parts.length >= 3) {
                  gpuInfo = {
                    model: parts[0].trim(),
                    memoryTotal: parseInt(parts[1].trim()) || null,
                    driverVersion: parts[2].trim(),
                    vendor: 'NVIDIA',
                  };
                }
              }
            } catch (e) {
              // nvidia-smi недоступен (не установлен или нет NVIDIA GPU), используем базовую информацию
            }
          }
          
          // Пытаемся получить информацию об AMD GPU через rocm-smi или другие инструменты
          if ((gpuMatch[1].includes('AMD') || gpuMatch[1].includes('Radeon')) && !gpuInfo.memoryTotal) {
            try {
              // Можно попробовать другие команды для AMD, но они могут быть не установлены
              // Оставляем базовую информацию
            } catch (e) {
              // Игнорируем ошибки
            }
          }
        }
      }
    } catch (e) {
      // lspci недоступен (редко на Ubuntu, но возможно в минимальных установках)
      // Или таймаут - игнорируем, GPU информация не критична
    }
  };

  // Выполняем с общим таймаутом
  try {
    await Promise.race([
      fetchGpuInfo(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('GPU timeout')), gpuTimeout))
    ]);
  } catch (error) {
    // Игнорируем ошибки таймаута - GPU информация не критична
  }
  
  return gpuInfo;
};

// Получение метрик системы (Linux-only)
// Оптимизированная версия с параллельным выполнением медленных операций
export const fetchSystemMetrics = async (): Promise<any> => {
  // Быстрые операции выполняем сразу
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryPercentage = (usedMemory / totalMemory) * 100;
  
  // Параллельно запускаем медленные операции с таймаутами
  const [cpuUsageResult, diskResult, processesResult, swapResult, networkResult, topProcessesResult, tempResult, extendedInfoResult, performanceResult, securityResult] = await Promise.allSettled([
    Promise.race([
      getCpuUsage(cpus),
      new Promise<number>((resolve) => {
        // Если таймаут, используем load average как fallback
        setTimeout(() => {
          const loadAvg = os.loadavg();
          resolve(Math.min((loadAvg[0] / cpus.length) * 100, 100));
        }, 2000);
      })
    ]),
    Promise.race([
      getDiskUsage(),
      new Promise<DiskInfo[]>((resolve) => setTimeout(() => resolve([]), 2000))
    ]),
    Promise.race([
      getProcessesInfo(),
      new Promise<{ total: number; running: number }>((_, reject) => setTimeout(() => reject(new Error('Processes timeout')), 800))
    ]),
    Promise.race([
      getSwapInfo(),
      new Promise<{ total: number; used: number; free: number; percentage: number }>((resolve) => setTimeout(() => resolve({ total: 0, used: 0, free: 0, percentage: 0 }), 1500))
    ]),
    Promise.race([
      getNetworkActivity(),
      new Promise<{ interfaces: any[] }>((resolve) => setTimeout(() => resolve({ interfaces: [] }), 1500))
    ]),
    Promise.race([
      getTopProcesses(10),
      new Promise<{ cpu: ProcessInfo[]; memory: ProcessInfo[] }>((resolve) => setTimeout(() => resolve({ cpu: [], memory: [] }), 2000))
    ]),
    Promise.race([
      getTemperature(),
      new Promise<any>((resolve) => setTimeout(() => resolve({}), 1500))
    ]),
    Promise.race([
      getExtendedSystemInfo(),
      new Promise<any>((resolve) => setTimeout(() => resolve({}), 2000))
    ]),
    Promise.race([
      getPerformanceMetrics(),
      new Promise<any>((resolve) => setTimeout(() => resolve({}), 1500))
    ]),
    Promise.race([
      getSecurityInfo(),
      new Promise<any>((resolve) => setTimeout(() => resolve({ activeSessions: 0, recentLogins: [], suspiciousActivity: [] }), 2000))
    ]),
  ]);
  
  // GPU получаем отдельно с очень коротким таймаутом или пропускаем
  let gpuInfo: any = null;
  try {
    gpuInfo = await Promise.race([
      getGpuInfo(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPU timeout')), 1000))
    ]);
  } catch (e) {
    // Игнорируем ошибки GPU - не критично
  }
  
  // Обрабатываем результат CPU usage
  let cpuUsage = 0;
  if (cpuUsageResult.status === 'fulfilled') {
    cpuUsage = cpuUsageResult.value as number;
    // Проверяем валидность значения
    if (isNaN(cpuUsage) || cpuUsage < 0 || cpuUsage > 100) {
      // Если невалидное значение, пробуем вычислить на основе времени CPU
      const cpus1 = os.cpus();
      await new Promise(resolve => setTimeout(resolve, 100));
      const cpus2 = os.cpus();
      
      let totalIdle = 0;
      let totalTick = 0;
      
      for (let i = 0; i < cpus1.length; i++) {
        const cpu1 = cpus1[i].times;
        const cpu2 = cpus2[i].times;
        
        const idle = cpu2.idle - cpu1.idle;
        const user = cpu2.user - cpu1.user;
        const nice = cpu2.nice - cpu1.nice;
        const sys = cpu2.sys - cpu1.sys;
        const irq = cpu2.irq - cpu1.irq;
        
        totalIdle += idle;
        totalTick += user + nice + sys + irq + idle;
      }
      
      if (totalTick > 0) {
        cpuUsage = 100 - (totalIdle / totalTick) * 100;
        cpuUsage = Math.min(Math.max(cpuUsage, 0), 100);
      } else {
        cpuUsage = 0;
      }
    }
  } else {
    // Если была ошибка, вычисляем на основе времени CPU
    const cpus1 = os.cpus();
    await new Promise(resolve => setTimeout(resolve, 100));
    const cpus2 = os.cpus();
    
    let totalIdle = 0;
    let totalTick = 0;
    
    for (let i = 0; i < cpus1.length; i++) {
      const cpu1 = cpus1[i].times;
      const cpu2 = cpus2[i].times;
      
      const idle = cpu2.idle - cpu1.idle;
      const user = cpu2.user - cpu1.user;
      const nice = cpu2.nice - cpu1.nice;
      const sys = cpu2.sys - cpu1.sys;
      const irq = cpu2.irq - cpu1.irq;
      
      totalIdle += idle;
      totalTick += user + nice + sys + irq + idle;
    }
    
    if (totalTick > 0) {
      cpuUsage = 100 - (totalIdle / totalTick) * 100;
      cpuUsage = Math.min(Math.max(cpuUsage, 0), 100);
    } else {
      cpuUsage = 0;
    }
  }
  const disks = diskResult.status === 'fulfilled' ? (diskResult.value as DiskInfo[]) : [];
  const processes = processesResult.status === 'fulfilled' ? (processesResult.value as { total: number; running: number }) : { total: 0, running: 0 };
  const swap = swapResult.status === 'fulfilled' ? (swapResult.value as { total: number; used: number; free: number; percentage: number }) : { total: 0, used: 0, free: 0, percentage: 0 };
  const networkActivity = networkResult.status === 'fulfilled' ? (networkResult.value as { interfaces: any[] }) : { interfaces: [] };
  const topProcesses = topProcessesResult.status === 'fulfilled' ? (topProcessesResult.value as { cpu: ProcessInfo[]; memory: ProcessInfo[] }) : { cpu: [], memory: [] };
  const temperature = tempResult.status === 'fulfilled' ? (tempResult.value as { cpu?: number; gpu?: number; disks?: Array<{ device: string; temperature: number }> }) : {};
  const extendedInfo = extendedInfoResult.status === 'fulfilled' ? (extendedInfoResult.value as any) : {};
  const performance = performanceResult.status === 'fulfilled' ? (performanceResult.value as any) : {};
  const security = securityResult.status === 'fulfilled' ? (securityResult.value as any) : { activeSessions: 0, recentLogins: [], suspiciousActivity: [] };
  
  // Вычисляем общую статистику по дискам для обратной совместимости
  const diskTotal = disks.length > 0 ? disks.reduce((sum, d) => sum + d.total, 0) : 0;
  const diskUsed = disks.length > 0 ? disks.reduce((sum, d) => sum + d.used, 0) : 0;
  const diskFree = disks.length > 0 ? disks.reduce((sum, d) => sum + d.free, 0) : 0;
  const diskPercentage = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

  // Информация о системе
  const platform = process.platform;
  const arch = process.arch;
  const nodeVersion = process.version;
  const hostname = os.hostname();
  const type = os.type();
  const release = os.release();
  const cpusInfo = cpus.map(cpu => ({
    model: cpu.model,
    speed: cpu.speed,
  }));

  // Информация о сети
  const networkInterfaces = os.networkInterfaces();
  const networkInfo: any[] = [];
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    const interfaces = networkInterfaces[interfaceName];
    if (interfaces) {
      interfaces.forEach((iface) => {
        if (!iface.internal) {
          networkInfo.push({
            name: interfaceName,
            address: iface.address,
            netmask: iface.netmask,
            family: iface.family,
            mac: iface.mac,
          });
        }
      });
    }
  });

  // Информация о версиях
  const nodeVersionDetails = {
    version: nodeVersion,
    major: parseInt(nodeVersion.split('.')[0].replace('v', '')),
  };

  // Информация о времени работы системы
  const systemUptime = os.uptime();
  const processUptime = process.uptime();

  return {
    cpu: {
      usage: Math.min(cpuUsage, 100),
      cores: cpus.length,
      loadAverage: os.loadavg(),
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      details: cpusInfo,
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percentage: memoryPercentage,
    },
    swap: swap,
    disk: {
      total: diskTotal,
      used: diskUsed,
      free: diskFree,
      percentage: diskPercentage,
    },
    disks: disks, // Массив всех дисков
    uptime: {
      system: systemUptime,
      process: processUptime,
    },
    processes: processes,
    topProcesses: topProcesses,
    network: networkInfo,
    networkActivity: networkActivity,
    temperature: temperature,
    system: {
      platform,
      arch,
      type,
      release,
      hostname,
      nodeVersion: nodeVersionDetails,
    },
    extendedInfo: extendedInfo,
    performance: performance,
    security: security,
    gpu: gpuInfo,
  };
};

// Кэш для метрик системы (обновляется каждые 5 секунд)
let metricsCache: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10000; // 10 секунд - увеличили для снижения нагрузки

// Быстрое получение метрик (без GPU и медленных операций)
const fetchSystemMetricsFast = async (): Promise<any> => {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryPercentage = (usedMemory / totalMemory) * 100;

  // Только быстрые операции
  // Для быстрого режима вычисляем на основе времени CPU (работает на всех платформах)
  const cpus1 = os.cpus();
  await new Promise(resolve => setTimeout(resolve, 100));
  const cpus2 = os.cpus();
  
  let totalIdle = 0;
  let totalTick = 0;
  
  for (let i = 0; i < cpus1.length; i++) {
    const cpu1 = cpus1[i].times;
    const cpu2 = cpus2[i].times;
    
    const idle = cpu2.idle - cpu1.idle;
    const user = cpu2.user - cpu1.user;
    const nice = cpu2.nice - cpu1.nice;
    const sys = cpu2.sys - cpu1.sys;
    const irq = cpu2.irq - cpu1.irq;
    
    totalIdle += idle;
    totalTick += user + nice + sys + irq + idle;
  }
  
  let cpuUsage = 0;
  if (totalTick > 0) {
    cpuUsage = 100 - (totalIdle / totalTick) * 100;
    cpuUsage = Math.min(Math.max(cpuUsage, 0), 100);
  } else {
    // Fallback на load average для Linux (если вычисление не удалось)
    const loadAvg = os.loadavg();
    if (loadAvg[0] > 0 && cpus.length > 0) {
      cpuUsage = Math.min((loadAvg[0] / cpus.length) * 100, 100);
    }
  }

  return {
    cpu: {
      usage: cpuUsage,
      cores: cpus.length,
      loadAverage: os.loadavg(),
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      details: cpus.map(cpu => ({ model: cpu.model, speed: cpu.speed })),
    },
    memory: {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      percentage: memoryPercentage,
    },
    disk: { total: 0, used: 0, free: 0, percentage: 0 }, // Заполним позже
    disks: [], // В быстром режиме диски не загружаем
    uptime: {
      system: os.uptime(),
      process: process.uptime(),
    },
    processes: { total: 0, running: 0 }, // Заполним позже
    system: {
      platform: process.platform,
      arch: process.arch,
      type: os.type(),
      release: os.release(),
      hostname: os.hostname(),
      nodeVersion: {
        version: process.version,
        major: parseInt(process.version.split('.')[0].replace('v', '')),
      },
    },
    network: [], // Заполним позже
    gpu: null, // Не получаем при быстрой загрузке
  };
};

export const getSystemMetrics = async (req: Request, res: Response): Promise<any> => {
  if (!(await checkDeveloperRole(req, res))) return;

  try {
    const isFastMode = req.query.fast === 'true';
    
    // Проверяем кэш
    const now = Date.now();
    if (metricsCache && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json({
        success: true,
        data: metricsCache
      });
    }

    // Быстрый режим - только основные метрики без медленных операций
    if (isFastMode) {
      const fastMetrics = await fetchSystemMetricsFast();
      // Обновляем кэш в фоне полными данными
      fetchSystemMetrics().then(metrics => {
        metricsCache = metrics;
        cacheTimestamp = Date.now();
      }).catch(() => {
        // Игнорируем ошибки фонового обновления
      });
      
      return res.json({
        success: true,
        data: fastMetrics
      });
    }

    // Полный режим - все метрики
    const metrics = await fetchSystemMetrics();
    metricsCache = metrics;
    cacheTimestamp = Date.now();
    
    return res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('❌ [System] Error getting system metrics:', error);
    // Возвращаем кэш если есть, даже если он устарел
    if (metricsCache) {
      return res.json({
        success: true,
        data: metricsCache
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
