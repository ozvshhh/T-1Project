import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

// 주최 측 검사가 배포 버전을 확인하는 공개 경로: 인증 없이, 캐시 없이, RELEASE_ID만 돌려준다.
// 전역 JWT 가드가 막지 않도록 @Public()을 붙인다.
@Public()
@Controller('__health')
export class HealthController {
  @Get()
  @Header('Cache-Control', 'no-store')
  get(): { releaseId: string } {
    // 요청마다 환경변수를 읽고, 미지정이면 C1-7 기준대로 'dev'. 다른 값은 응답에 넣지 않는다.
    return { releaseId: process.env.RELEASE_ID || 'dev' };
  }
}
