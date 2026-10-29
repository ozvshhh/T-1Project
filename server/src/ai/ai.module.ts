import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

// AI를 쓰는 기능 모듈이 가져다 쓴다. 테스트는 AiService를 가짜로 바꿔 끼운다(실제 Gateway 호출 금지).
@Module({ providers: [AiService], exports: [AiService] })
export class AiModule {}
