FROM node:21-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

EXPOSE 80

RUN npm run build

CMD ["npm", "run", "preview"]