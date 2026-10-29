import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { InterviewError, type InterviewErrorCode } from '../src/engine.js';

const STATUS: Record<InterviewErrorCode, number> = {
  invalid_input: 400,
  not_found: 404,
  ended: 409,
  not_ended: 409,
  conflict: 409,
};

/** 엔진 오류를 HTTP 상태와 { code, message }로 바꾼다. 메시지는 화면에 그대로 보여 줄 수 있는 한국어. */
@Catch(InterviewError)
export class InterviewExceptionFilter implements ExceptionFilter {
  catch(err: InterviewError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.status(STATUS[err.code]).json({ code: err.code, message: err.message });
  }
}
