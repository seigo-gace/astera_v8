FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package.json ./package.json
COPY src ./src
# The build context may contain owner-only source files; node must be able to load them.
RUN chmod -R a+rX /app/src
USER node
EXPOSE 7374
CMD ["node", "src/quality-completion-evaluator/api/start.js"]
