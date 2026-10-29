import 'reflect-metadata';
import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ServerModule } from './server.module';

// 프런트는 상대 경로 /api/...로 부르고, 주최 측 검사는 prefix 없는 /__health를 본다.
// rootModule 인자는 테스트가 운영과 같은 설정(prefix·필터)으로 추가 컨트롤러를 띄우기 위한 것이다.
export async function createApp(rootModule: Type<unknown> = AppModule): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api', { exclude: ['__health'] });
  // 모든 오류 응답을 api.md 1절 형식으로 맞추고 스택이 본문에 나가지 않게 한다.
  app.useGlobalFilters(new AllExceptionsFilter());
  return app;
}

// 3000은 nginx(app)가 쓴다. Lightsail에서는 두 컨테이너가 localhost를 함께 쓰므로 서버는 다른 포트여야 겹치지 않는다.
export const DEFAULT_PORT = 3001;
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

// 0.0.0.0에 붙어야 nginx가 compose(server:3001)·Lightsail(localhost:3001) 양쪽에서 접근할 수 있다.
// 운영 기동은 ServerModule로 DATABASE_URL에 연결하고 시드 사용자를 보장한다.
async function bootstrap(): Promise<void> {
  const app = await createApp(ServerModule);
  await app.listen(resolvePort(), '0.0.0.0');
}

if (require.main === module) {
  void bootstrap();
}
