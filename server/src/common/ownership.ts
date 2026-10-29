import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

// 남의 자원·없는 자원·잘못된 id를 모두 같은 본문으로 돌려줘야 다른 사용자의 자원이 있는지조차 알 수 없다.
const NOT_FOUND = { code: 'NOT_FOUND', message: '찾을 수 없습니다.' } as const;

// 24자리 hex만 받는다. mongoose isValidObjectId는 아무 12글자 문자열도 통과시킨다.
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function notFound(): NotFoundException {
  return new NotFoundException({ ...NOT_FOUND });
}

// 경로의 id를 ObjectId로 바꾼다. 형식이 틀리면 CastError(500) 대신 404로 막는다.
export function parseObjectIdOr404(id: string): Types.ObjectId {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) throw notFound();
  return new Types.ObjectId(id);
}

// 토큰 사용자가 자원 소유자가 아니면 404. 소유자 검사는 서버에서만 한다(4단계부터 모든 자원이 쓴다).
export function assertOwner<T extends { userId: unknown }>(
  resource: T | null | undefined,
  userId: string,
): T {
  if (!resource || String(resource.userId) !== userId) throw notFound();
  return resource;
}
