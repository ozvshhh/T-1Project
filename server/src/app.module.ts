import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

// 루트 모듈: 기능 모듈(health·auth·resume 등)은 여기에 imports로 붙인다.
@Module({ imports: [HealthModule] })
export class AppModule {}
