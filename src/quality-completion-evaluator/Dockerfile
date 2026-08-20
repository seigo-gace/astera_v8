FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package.json ./package.json
COPY src ./src
USER node
EXPOSE 7374
CMD ["node", "src/quality-completion-evaluator/api/start.js"]
