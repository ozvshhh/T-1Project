FROM node:22-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.29-alpine
ARG RELEASE_ID=dev
ENV RELEASE_ID=$RELEASE_ID
# nginx가 /api/·/__health를 넘길 서버 주소. compose 기본값이고, Lightsail 배포에서는 http://localhost:3001로 바꿔 넣는다.
ENV API_UPSTREAM=http://server:3001
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
