import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Experience, ExperienceSchema } from './experience.schema';
import { ExperiencesController } from './experiences.controller';
import { ExperiencesService } from './experiences.service';

// 경험(R2·R6). 단서·사실(C5-2·C5-3)도 이 모듈에 붙어 같은 소유자 검사를 쓴다.
@Module({
  imports: [MongooseModule.forFeature([{ name: Experience.name, schema: ExperienceSchema }])],
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
  exports: [ExperiencesService],
})
export class ExperiencesModule {}
