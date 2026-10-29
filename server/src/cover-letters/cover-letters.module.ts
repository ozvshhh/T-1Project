import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Experience, ExperienceSchema } from '../experiences/experience.schema';
import { Fact, FactSchema } from '../experiences/fact.schema';
import { CoverLetter, CoverLetterSchema } from './cover-letter.schema';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

// 자기소개서(R7·R8). 문항별 추천·응답(C7-2~)도 이 모듈에 붙어 같은 소유자 검사·변경 알림 함수를 쓴다.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoverLetter.name, schema: CoverLetterSchema },
      // 추천 후보 집합(확정 사실이 있는 내 경험)을 만들려고 경험·사실을 읽는다.
      { name: Experience.name, schema: ExperienceSchema },
      { name: Fact.name, schema: FactSchema },
    ]),
    // 추천이 AI를 부른다. 테스트는 AiService를 FakeAiService로 바꿔 끼운다(실제 Gateway 호출 금지).
    AiModule,
  ],
  controllers: [CoverLettersController],
  providers: [CoverLettersService],
})
export class CoverLettersModule {}
