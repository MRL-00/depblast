FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S depblast && adduser -S depblast -G depblast
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/lib ./lib
RUN yarn install --frozen-lockfile --production
USER depblast
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "lib/index.js"]
