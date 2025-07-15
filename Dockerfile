FROM node:18-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma

RUN npx prisma generate

COPY . .

RUN pnpm run build

EXPOSE 8001

CMD ["pnpm", "start"]
