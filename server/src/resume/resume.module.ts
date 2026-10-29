import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Experience, ExperienceSchema } from '../experiences/experience.schema';
import { ExperiencesModule } from '../experiences/experiences.module';
import { ResumeController } from './resume.controller';
import { Resume, ResumeSchema } from './resume.schema';
import { ResumeService } from './resume.service';

// 이력서와 활동 초안(R2). 경험은 이 초안을 확정해서만 만든다(api.md 4절).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      // 붙여넣기 중복 빼기가 내 경험 제목과 대조한다(명세 10).
      { name: Experience.name, schema: ExperienceSchema },
    ]),
    // 활동 나누기가 AI를 부른다. 테스트는 AiService를 FakeAiService로 바꿔 끼운다(실제 Gateway 호출 금지).
    AiModule,
    // 초안 확정이 경험을 만든다(명세 10). 경험 모양·기본값을 한 곳(ExperiencesService)에 둔다.
    ExperiencesModule,
  ],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
