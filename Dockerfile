FROM node:25-bullseye as build

WORKDIR /app

COPY Backend/package*.json ./

RUN npm install

FROM node:25-slim

WORKDIR /app

RUN mkdir public

COPY --from=build /app/node_modules ./node_modules

COPY Backend/* ./
COPY Frontend/* ./public

# EXPOSE 3000

ENTRYPOINT ["node", "server.js"]