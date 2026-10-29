# 빌드는 여기서 끝낸다: 시작 명령에 설치·빌드가 있으면 기동 2분 제한을 넘길 수 있다(03-delivery.md).

# 1단계: 개발 의존성 설치 + TypeScript 빌드
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# 2단계: dist + production 의존성만 담은 실행 이미지
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# /__health의 releaseId. compose/CI가 커밋 SHA를 빌드 인자로 넘기고, 없으면 dev.
ARG RELEASE_ID=dev
ENV RELEASE_ID=$RELEASE_ID
EXPOSE 3001
CMD ["node","dist/main.js"]
