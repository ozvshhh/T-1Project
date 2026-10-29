import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CoverLetterDto } from './cover-letter.dto';
import { validateCreateCoverLetter, validateUpdateCoverLetter } from './cover-letter.validation';
import { CoverLettersService } from './cover-letters.service';

// 자기소개서 API(api.md 7절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
@Controller('cover-letters')
export class CoverLettersController {
  constructor(private readonly service: CoverLettersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.createPasted(user.id, validateCreateCoverLetter(body)) };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ coverLetters: CoverLetterDto[] }> {
    return { coverLetters: await this.service.listByUser(user.id) };
  }

  // 검증을 소유자 조회보다 먼저 해 빈 글 400 여부가 남의 자소서 존재와 무관하게 한다.
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.update(user.id, id, validateUpdateCoverLetter(body)) };
  }
}
