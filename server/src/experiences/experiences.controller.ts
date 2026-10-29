import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ClueFileInterceptor } from './clue-file.interceptor';
import { UploadedClueFile, validateFileClue, validateTextClue } from './clue.validation';
import { ClueDto, ExperienceDto } from './experience.dto';
import { validateCreateExperience, validateUpdateExperience } from './experience.validation';
import { ExperiencesService } from './experiences.service';

// RFC 5987: 한글 이름은 filename*로 싣고, 옛 브라우저용 filename에는 ASCII만 남긴다. 헤더 주입을 막으려 따옴표·제어문자도 바꾼다.
function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// 경험 API(api.md 4절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly service: ExperiencesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.create(user.id, validateCreateExperience(body)) };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ experiences: ExperienceDto[] }> {
    return { experiences: await this.service.listByUser(user.id) };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.get(user.id, id) };
  }

  // 같은 경로가 JSON 텍스트 단서와 multipart 파일 단서를 받는다(api.md 4절). 본문 형식으로 갈라 각자 규칙으로 검증한다.
  // 검증을 소유자 조회보다 먼저 해 400 여부가 남의 경험 존재와 무관하게 한다.
  @Post(':id/clues')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(ClueFileInterceptor)
  async addClue(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFile() file: UploadedClueFile | undefined,
  ): Promise<{ clue: ClueDto }> {
    const input = req.is('multipart/form-data') ? validateFileClue(body, file) : validateTextClue(body);
    return { clue: await this.service.addClue(user.id, id, input) };
  }

  // 올린 바이트·형식·이름을 그대로 돌려준다(R5). attachment·nosniff로 사용자가 올린 HTML 등이 우리 화면에서 실행되지 않게 한다.
  @Get(':id/clues/:clueId/file')
  async getClueFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('clueId') clueId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.getClueFile(user.id, id, clueId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.data, {
      type: file.mimeType,
      length: file.data.length,
      disposition: contentDisposition(file.fileName),
    });
  }

  // 입력 검증을 DB 조회보다 먼저 한다: 400 여부가 자원 존재와 무관해져 남의 경험이 있는지 떠볼 수 없다.
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.update(user.id, id, validateUpdateExperience(body)) };
  }
}
