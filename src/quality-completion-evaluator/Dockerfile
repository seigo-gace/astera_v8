FROM node:22-alpine
WORKDIR /app
COPY . .
RUN chmod +x /app/cli/evaluate.js /app/scripts-install.sh /app/scripts-verify.sh
USER node
ENTRYPOINT ["node", "/app/cli/evaluate.js"]
