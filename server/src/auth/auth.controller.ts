import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthResult, AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { validateLogin } from './login.validation';
import { Public } from './public.decorator';
import { validateSignup } from './signup.validation';

// 가입·로그인은 토큰 없이 부르는 입구다(api.md 3절). 전역 prefix로 /api/auth/...가 된다.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() body: unknown): Promise<AuthResult> {
    return this.authService.signup(validateSignup(body));
  }

  // Nest의 POST 기본값은 201이다. 로그인은 새 자원을 만들지 않으므로 api.md대로 200을 명시한다.
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown): Promise<AuthResult> {
    return this.authService.login(validateLogin(body));
  }

  // 새로고침 뒤 로그인 상태 확인용. 가드가 DB에서 다시 읽은 {id,email}만 돌려준다(role 등은 넣지 않음).
  @Get('me')
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }
}
