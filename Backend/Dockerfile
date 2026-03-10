FROM node:25-bullseye as build

WORKDIR /app

COPY package*.json ./

RUN npm install

FROM node:25-slim

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules

COPY . .

# EXPOSE 3000

ENTRYPOINT ["node", "server.js"]