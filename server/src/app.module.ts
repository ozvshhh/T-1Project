import { Module } from '@nestjs/common';

// 루트 모듈: 기능 모듈(health·auth·resume 등)은 이후 단계에서 여기에 imports로 붙인다.
@Module({})
export class AppModule {}
