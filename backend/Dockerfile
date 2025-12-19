FROM node:21-alpine

# Установка сетевых утилит для сканирования
# Включаем все необходимые утилиты для работы в host network mode на Ubuntu
RUN apk add --no-cache \
    net-snmp-tools \
    net-snmp \
    nmap \
    iputils \
    net-tools \
    iproute2 \
    bind-tools \
    coreutils

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

EXPOSE 2000

RUN npx prisma generate

RUN npm run build

CMD ["./entrypoint.sh"]