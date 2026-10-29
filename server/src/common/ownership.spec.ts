import { HttpException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { assertOwner, parseObjectIdOr404 } from './ownership';

// 남의 자원·없는 자원·잘못된 id가 모두 같은 404여야 다른 사용자의 자원이 있는지조차 알 수 없다(R1 계정 분리).
describe('C3-4 ownership helpers', () => {
  const me = new Types.ObjectId().toHexString();
  const other = new Types.ObjectId().toHexString();

  const catchError = (fn: () => unknown): HttpException => {
    try {
      fn();
    } catch (e) {
      return e as HttpException;
    }
    throw new Error('expected an exception');
  };

  const expectNotFound = (err: HttpException) => {
    expect(err).toBeInstanceOf(NotFoundException);
    expect(err.getStatus()).toBe(404);
    expect((err.getResponse() as { code: string }).code).toBe('NOT_FOUND');
  };

  // 소유자 본인이면 자원을 그대로 돌려줘야 호출 쪽이 한 줄로 쓸 수 있다.
  it.each([
    ['ObjectId', new Types.ObjectId(me)],
    ['string', me],
  ])('returns the resource when userId (%s) matches', (_label, userId) => {
    const resource = { userId, title: 'mine' };
    expect(assertOwner(resource, me)).toBe(resource);
  });

  it("throws 404 NOT_FOUND for another user's resource", () => {
    expectNotFound(catchError(() => assertOwner({ userId: new Types.ObjectId(other) }, me)));
  });

  // 없는 자원과 남의 자원이 같은 message여야 응답만 보고 둘을 구분할 수 없다.
  it('throws the same 404 for a missing resource', () => {
    const missing = catchError(() => assertOwner(null, me));
    const foreign = catchError(() => assertOwner({ userId: other }, me));
    expectNotFound(missing);
    expect(missing.getResponse()).toEqual(foreign.getResponse());
  });

  it('parses a valid id into an ObjectId', () => {
    expect(parseObjectIdOr404(me).toHexString()).toBe(me);
  });

  // 형식이 틀린 id가 CastError(500)로 새지 않고 같은 404여야 한다(AGENT.md 소유자 규칙).
  it.each(['not-an-id', '', '123', `${me}x`])('rejects malformed id %p with the same 404', (id) => {
    const err = catchError(() => parseObjectIdOr404(id));
    expectNotFound(err);
    expect(err.getResponse()).toEqual(catchError(() => assertOwner(null, me)).getResponse());
  });
});
