import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ExperienceDto } from './experience.dto';
import { validateCreateExperience, validateUpdateExperience } from './experience.validation';
import { ExperiencesService } from './experiences.service';

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
