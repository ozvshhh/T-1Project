import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// 프런트는 상대 경로 /api/...로 부르고, 주최 측 검사는 prefix 없는 /__health를 본다.
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api', { exclude: ['__health'] });
  return app;
}

// 컨테이너 안에서는 0.0.0.0:3000에 붙어야 compose의 다른 서비스(nginx)가 접근할 수 있다.
async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(3000, '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
