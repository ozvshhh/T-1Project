import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { CheckDto } from './check.dto';
import { ChecksService } from './checks.service';

// 제출 전 점검 API(api.md 9절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
// 경로가 cover-letters/:id/checks와 checks/:checkId 두 갈래라 컨트롤러 prefix를 비워 둔다.
@Controller()
export class ChecksController {
  constructor(private readonly service: ChecksService) {}

  // 점검 만들기(R9). 새 점검 문서가 생기므로 201이다.
  @Post('cover-letters/:id/checks')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ check: CheckDto }> {
    return { check: await this.service.create(user.id, id) };
  }

  // 새로고침 뒤 진행 중인 점검을 다시 찾는 목록(R11, 최신순).
  @Get('cover-letters/:id/checks')
  async list(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ checks: CheckDto[] }> {
    return { checks: await this.service.listByCoverLetter(user.id, id) };
  }

  @Get('checks/:checkId')
  async get(@CurrentUser() user: AuthUser, @Param('checkId') checkId: string): Promise<{ check: CheckDto }> {
    return { check: await this.service.get(user.id, checkId) };
  }
}
