import { DEFAULT_PORT, resolvePort } from './main';

// 3000은 nginx(app)가 쓴다. Lightsail에서는 두 컨테이너가 localhost를 함께 쓰므로 서버 기본 포트가 3000이면 겹친다(C2-1).
describe('C2-1 server port', () => {
  it('defaults to 3001', () => {
    expect(DEFAULT_PORT).toBe(3001);
    expect(resolvePort({})).toBe(3001);
  });

  it('uses PORT when it is a positive integer', () => {
    expect(resolvePort({ PORT: '4000' })).toBe(4000);
  });

  // 잘못된 값으로 0번(무작위) 포트에 붙으면 nginx가 서버를 찾지 못한다.
  it('falls back to 3001 for empty or invalid PORT', () => {
    for (const PORT of ['', 'abc', '0', '-1', '3.5']) expect(resolvePort({ PORT })).toBe(3001);
  });
});
