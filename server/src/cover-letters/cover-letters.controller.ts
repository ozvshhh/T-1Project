import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CoverLetterDto, CoverLetterItemDto } from './cover-letter.dto';
import {
  validateCreateCoverLetter,
  validateGenerateCoverLetter,
  validateUpdateCoverLetter,
} from './cover-letter.validation';
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

  // 문항별 작성(R8)의 출발점. 검증을 저장보다 먼저 해 빈 우대사항·문항으로 문서가 생기지 않게 한다.
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.createGenerated(user.id, validateGenerateCoverLetter(body)) };
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

  // 문항별 카드 추천(R8). 새 자원을 만들지 않고 문항의 추천만 바꾸므로 201이 아니라 200이다(api.md 7절).
  @Post(':id/items/:itemId/recommendations')
  @HttpCode(HttpStatus.OK)
  async recommend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<{ item: CoverLetterItemDto }> {
    return { item: await this.service.recommend(user.id, id, itemId) };
  }
}
