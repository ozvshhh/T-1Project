import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

// HTTP 기능 모듈: DB 연결 없이 조립된다. Mongo 연결·시드는 운영 진입점 ServerModule이 더한다.
@Module({ imports: [HealthModule] })
export class AppModule {}
