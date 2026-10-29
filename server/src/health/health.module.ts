import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// /__health는 DB·인증과 무관하게 떠 있어야 하므로 의존성 없는 모듈로 둔다.
@Module({ controllers: [HealthController] })
export class HealthModule {}
