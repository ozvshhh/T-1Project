import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResumeController } from './resume.controller';
import { Resume, ResumeSchema } from './resume.schema';
import { ResumeService } from './resume.service';

// 이력서와 활동 초안(R2). 경험은 이 초안을 확정해서만 만든다(api.md 4절).
@Module({
  imports: [MongooseModule.forFeature([{ name: Resume.name, schema: ResumeSchema }])],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
