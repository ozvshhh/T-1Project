import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoverLetter, CoverLetterSchema } from './cover-letter.schema';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

// 자기소개서(R7·R8). 문항별 추천·응답(C7-2~)도 이 모듈에 붙어 같은 소유자 검사·변경 알림 함수를 쓴다.
@Module({
  imports: [MongooseModule.forFeature([{ name: CoverLetter.name, schema: CoverLetterSchema }])],
  controllers: [CoverLettersController],
  providers: [CoverLettersService],
})
export class CoverLettersModule {}
