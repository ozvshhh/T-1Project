import { CallHandler, ExecutionContext, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { clueValidationError, FILE_TOO_LARGE_REASON } from './clue.validation';

const BaseFileInterceptor = FileInterceptor('file');

// multipart의 file 칸을 받는다. 저장소·크기 한도는 ExperiencesModule의 MulterModule 설정(메모리·CLUE_MAX_BYTES)을 따른다.
// multer는 한도 초과를 413으로 던지는데, api.md 1절대로 프런트가 칸별 안내를 하려면 400 VALIDATION(field file)이어야 한다.
@Injectable()
export class ClueFileInterceptor extends BaseFileInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw clueValidationError([{ field: 'file', reason: FILE_TOO_LARGE_REASON }]);
      }
      throw error;
    }
  }
}
