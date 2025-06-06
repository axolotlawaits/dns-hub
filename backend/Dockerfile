FROM node:21-alpine

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 80

RUN npx prisma generate

RUN npm run build

CMD ["./entrypoint.sh"]