import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthResult, AuthService } from './auth.service';
import { validateSignup } from './signup.validation';

// 가입은 토큰 없이 부르는 입구다(api.md 3절). 전역 prefix로 /api/auth/signup이 된다.
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() body: unknown): Promise<AuthResult> {
    return this.authService.signup(validateSignup(body));
  }
}
