import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// 전역 가드의 유일한 예외 표시. 기본이 "막힘"이라 공개할 경로만 명시적으로 연다(명세 03).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
