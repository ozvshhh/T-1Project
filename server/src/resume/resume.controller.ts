import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ExperienceDto } from '../experiences/experience.dto';
import { ActivityDraftDto, ResumeDto, ResumeService } from './resume.service';
import {
  validateConfirmDrafts,
  validateCreateDraft,
  validatePasteResume,
  validateUpdateDraft,
} from './resume.validation';

// 이력서 API(api.md 4절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
// AI는 붙여넣기(POST /api/resume)만 부르고, 초안 직접 추가·수정·삭제는 AI를 부르지 않는다.
@Controller('resume')
export class ResumeController {
  constructor(private readonly service: ResumeService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<{ resume: ResumeDto }> {
    return { resume: await this.service.get(user.id) };
  }

  // 자원을 새로 만드는 게 아니라 이력서를 갱신하므로 200(api.md 4절). 검증이 AI 호출보다 먼저라 빈 글은 예산을 쓰지 않는다.
  @Post()
  @HttpCode(HttpStatus.OK)
  async paste(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ resume: ResumeDto; added: ActivityDraftDto[] }> {
    return this.service.paste(user.id, validatePasteResume(body));
  }

  @Post('drafts')
  @HttpCode(HttpStatus.CREATED)
  async addDraft(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<{ draft: ActivityDraftDto }> {
    return { draft: await this.service.addDraft(user.id, validateCreateDraft(body)) };
  }

  // 고른 초안을 경험으로 만든다(api.md 4절). 경험이 생기는 유일한 경로다. 검증이 DB 조회보다 먼저다.
  // POST에는 drafts/:draftId 라우트가 없어 정적 경로 confirm이 다른 라우트와 겹치지 않는다.
  @Post('drafts/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmDrafts(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ experiences: ExperienceDto[] }> {
    return { experiences: await this.service.confirmDrafts(user.id, validateConfirmDrafts(body)) };
  }

  // 입력 검증을 DB 조회보다 먼저 한다: 400 여부가 초안 존재와 무관해져 남의 초안이 있는지 떠볼 수 없다.
  @Patch('drafts/:draftId')
  async updateDraft(
    @CurrentUser() user: AuthUser,
    @Param('draftId') draftId: string,
    @Body() body: unknown,
  ): Promise<{ draft: ActivityDraftDto }> {
    return { draft: await this.service.updateDraft(user.id, draftId, validateUpdateDraft(body)) };
  }

  // 지운 뒤 돌려줄 자원이 없으므로 204 빈 본문(api.md 4절).
  @Delete('drafts/:draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@CurrentUser() user: AuthUser, @Param('draftId') draftId: string): Promise<void> {
    await this.service.deleteDraft(user.id, draftId);
  }
}
