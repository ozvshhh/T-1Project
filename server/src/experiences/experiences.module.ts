import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { clueConfigFromEnv } from './clue.config';
import { Clue, ClueSchema } from './clue.schema';
import { Experience, ExperienceSchema } from './experience.schema';
import { Fact, FactSchema } from './fact.schema';
import { ExperiencesController } from './experiences.controller';
import { ExperiencesService } from './experiences.service';

// 경험(R2·R6). 단서·사실(C5-2·C5-3)도 이 모듈에 붙어 같은 소유자 검사를 쓴다.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Experience.name, schema: ExperienceSchema },
      { name: Clue.name, schema: ClueSchema },
      { name: Fact.name, schema: FactSchema },
    ]),
    // dest·storage를 주지 않으면 multer는 메모리 저장소를 쓴다: 배포 컨테이너에 영구 디스크가 없어 디스크에 쓰면 파일이 사라진다.
    // 한글 파일 이름이 latin1로 깨지지 않도록 multipart 헤더 인자를 UTF-8로 읽는다.
    MulterModule.registerAsync({
      useFactory: () => ({
        limits: { fileSize: clueConfigFromEnv().maxBytes, files: 1 },
        defParamCharset: 'utf8',
      }),
    }),
  ],
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
  exports: [ExperiencesService],
})
export class ExperiencesModule {}
