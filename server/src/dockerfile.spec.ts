import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const serverRoot = join(__dirname, '..');
const readLines = (file: string) =>
  readFileSync(join(serverRoot, file), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

// 대회 규칙: 빌드는 Dockerfile에서 끝내고 시작 명령은 서버 실행만 해야 2분 안에 /__health가 뜬다.
describe('C1-4 server/Dockerfile', () => {
  const lines = existsSync(join(serverRoot, 'Dockerfile')) ? readLines('Dockerfile') : [];
  const fromIdx = lines.flatMap((line, i) => (line.startsWith('FROM ') ? [i] : []));
  const stage = (n: number) => lines.slice(fromIdx[n], fromIdx[n + 1] ?? lines.length);

  it('is multi-stage with node:22-slim', () => {
    expect(fromIdx).toHaveLength(2);
    expect(lines[fromIdx[0]]).toMatch(/^FROM node:22-slim AS build$/);
    expect(lines[fromIdx[1]]).toBe('FROM node:22-slim');
  });

  // 개발 의존성 설치와 TypeScript 빌드는 이미지 빌드 시점(1단계)에서만 일어난다.
  it('stage 1 runs npm ci and npm run build', () => {
    expect(stage(0)).toEqual(expect.arrayContaining(['RUN npm ci', 'RUN npm run build']));
  });

  // 실행 이미지에는 dist와 production 의존성만 있어야 이미지가 작고 개발 도구가 섞이지 않는다.
  it('stage 2 copies dist from build and installs production deps only', () => {
    const final = stage(1);
    expect(final).toContain('RUN npm ci --omit=dev');
    expect(final).toContain('COPY --from=build /app/dist ./dist');
    expect(final.filter((line) => /npm run build|nest build/.test(line))).toEqual([]);
  });

  // /__health가 돌려주는 releaseId는 빌드 인자로 주입된다. 미지정 시 'dev'(C1-7 기준).
  it('passes ARG RELEASE_ID through to ENV RELEASE_ID with dev default', () => {
    const final = stage(1);
    const argIdx = final.indexOf('ARG RELEASE_ID=dev');
    expect(argIdx).toBeGreaterThanOrEqual(0);
    expect(final.indexOf('ENV RELEASE_ID=$RELEASE_ID')).toBeGreaterThan(argIdx);
  });

  // 시작 명령에 설치·빌드가 섞이면 기동이 느려져 2분 제한을 넘길 수 있다.
  it('starts with CMD ["node","dist/main.js"] only', () => {
    const cmds = lines.filter((line) => line.startsWith('CMD') || line.startsWith('ENTRYPOINT'));
    expect(cmds).toEqual(['CMD ["node","dist/main.js"]']);
  });

  // 로컬 node_modules·dist·.env가 빌드 컨텍스트로 들어가면 비밀이 이미지에 남거나 빌드가 오염된다.
  it('server/.dockerignore excludes node_modules, dist, .env, ralph', () => {
    const ignore = existsSync(join(serverRoot, '.dockerignore')) ? readLines('.dockerignore') : [];
    expect(ignore).toEqual(expect.arrayContaining(['node_modules', 'dist', '.env', 'ralph']));
  });
});
