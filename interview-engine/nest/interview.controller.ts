import {
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UnauthorizedException,
  UseFilters,
  type ExecutionContext,
} from '@nestjs/common';
import { z } from 'zod';
import type { InterviewEngine } from '../src/engine.js';
import { InterviewExceptionFilter } from './interview.filter.js';
import { INTERVIEW_ENGINE } from './interview.tokens.js';

/**
 * 로그인한 사용자 id. 팀의 인증 가드가 req.user에 { id } 또는 { sub }를 넣는다고 가정한다.
 * 없으면 401.
 */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  const id = req.user?.id ?? req.user?.sub;
  if (!id) throw new UnauthorizedException('로그인이 필요해요.');
  return String(id);
});

const StartBody = z.object({
  /** 내 자기소개서 id (자기소개서 저장소가 연결돼 있을 때). */
  coverLetterId: z.string().min(1).optional(),
  /** 저장소 없이 글을 직접 넘길 때(테스트·임시용) */
  resume: z.string().default(''),
  coverLetter: z.string().default(''),
});
const AnswerBody = z.object({
  questionId: z.string().min(1),
  text: z.string(),
  source: z.enum(['text', 'voice']).default('text'),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException('요청 형식이 올바르지 않아요.');
  return r.data;
}

/**
 * 면접 API. 모두 /api/interviews 아래.
 * 화면은 응답의 current.text를 글자로 보여 주고 TTS로 읽는다.
 */
@Controller('api/interviews')
@UseFilters(InterviewExceptionFilter)
export class InterviewController {
  constructor(@Inject(INTERVIEW_ENGINE) private readonly engine: InterviewEngine) {}

  /** 내 면접 기록 목록, 최근 것부터 (S6 '면접 기록') */
  @Get()
  list(@CurrentUserId() userId: string) {
    return this.engine.list(userId);
  }

  /** 면접 시작 → 첫 질문. 본문: { coverLetterId } 또는 { resume, coverLetter } */
  @Post()
  start(@CurrentUserId() userId: string, @Body() body: unknown) {
    const { coverLetterId, resume, coverLetter } = parse(StartBody, body);
    return this.engine.start({ userId, coverLetterId, resume, coverLetter });
  }

  /** 지금 상태(새로고침) */
  @Get(':id')
  get(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.engine.get(id, userId);
  }

  /** 답변 제출 → 다음 질문(끝났으면 current: null) */
  @Post(':id/answers')
  @HttpCode(200)
  answer(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.engine.answer(id, userId, parse(AnswerBody, body));
  }

  @Post(':id/skip')
  @HttpCode(200)
  skip(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.engine.skip(id, userId);
  }

  @Post(':id/end')
  @HttpCode(200)
  end(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.engine.end(id, userId);
  }

  /** 끝난 면접의 결과(기록·설명된 항목·보완할 항목·자소서 수정 제안) */
  @Get(':id/result')
  result(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.engine.result(id, userId);
  }

  /** 수정 제안 승인 → 바뀐 자소서 전문. 앱의 자소서 저장소에도 반영해야 한다. */
  @Post(':id/suggestions/:sid/approve')
  @HttpCode(200)
  approve(@CurrentUserId() userId: string, @Param('id') id: string, @Param('sid') sid: string) {
    return this.engine.approveSuggestion(id, userId, sid);
  }

  @Post(':id/suggestions/:sid/reject')
  @HttpCode(200)
  reject(@CurrentUserId() userId: string, @Param('id') id: string, @Param('sid') sid: string) {
    return this.engine.rejectSuggestion(id, userId, sid);
  }
}
