import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';

// HTTP 기능 모듈: DB 연결 없이 조립된다. Mongo 연결·시드는 운영 진입점 ServerModule이 더한다.
// AiModule은 키가 비어도 조립된다(키는 호출 시점에만 읽는다).
@Module({ imports: [HealthModule, AiModule] })
export class AppModule {}
