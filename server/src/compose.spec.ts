import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');

type Service = {
  image?: string;
  build?: { context?: string; args?: Record<string, string> };
  ports?: string[];
  container_name?: string;
  env_file?: unknown;
  environment?: Record<string, string>;
  depends_on?: string[] | Record<string, { condition?: string }>;
  volumes?: string[];
  healthcheck?: { test?: string[] | string };
};
type Compose = { services: Record<string, Service>; volumes?: Record<string, unknown> };

// 주최 측은 배포 사이트가 아니라 이 docker-compose.yml로 빈 DB에서 앱을 직접 띄운다.
describe('C1-5 docker-compose.yml', () => {
  const compose = load(readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8')) as Compose;
  const { app, server, db } = compose.services;

  it('has exactly app, server, db services', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['app', 'db', 'server']);
  });

  // 주최 측 실행·scenarios.yml은 시드 계정을 app의 environment에서 읽어 E2E 로그인에 쓴다(C2-3).
  // 계정은 server가 만들므로 두 값이 다르면 E2E가 없는 계정으로 로그인하게 된다.
  it('app carries the same literal seed values as server', () => {
    const appEnv = app.environment ?? {};
    const serverEnv = server.environment ?? {};
    expect(appEnv.SEED_USER_EMAIL).toBe('seeker@example.com');
    expect(appEnv.SEED_USER_PASSWORD).toBe('loopthon-2026');
    expect(appEnv.SEED_USER_EMAIL).toBe(serverEnv.SEED_USER_EMAIL);
    expect(appEnv.SEED_USER_PASSWORD).toBe(serverEnv.SEED_USER_PASSWORD);
  });

  // 3000 공개는 app(nginx) 하나뿐이고, 정적 프런트는 루트 Dockerfile 그대로 빌드한다.
  it('app keeps the root nginx build, publishes 3000, depends on server', () => {
    expect(app.ports).toEqual(['3000:3000']);
    expect(app.build?.context).toBe('.');
    expect(app.depends_on).toContain('server');
  });

  it('server builds from server/ with RELEASE_ID arg and no ports', () => {
    expect(server.build?.context).toBe('server');
    expect(server.build?.args).toHaveProperty('RELEASE_ID');
    expect(server.ports).toBeUndefined();
  });

  // 환경변수 이름은 대회 규칙으로 고정이고, 시드 값은 ${}가 아닌 리터럴이어야 주최 측이 바로 로그인한다.
  it('server environment has fixed names and literal seed values', () => {
    const env = server.environment ?? {};
    expect(env.DATABASE_URL).toBe('mongodb://db:27017/app');
    expect(env.SEED_USER_EMAIL).toBe('seeker@example.com');
    expect(env.SEED_USER_PASSWORD).toBe('loopthon-2026');
    // 인증은 JWT(api.md 0절). 로컬 compose용 리터럴 비밀을 둔다(C2-3, 명세 02가 SESSION_SECRET 단언을 대체).
    expect(typeof env.JWT_SECRET).toBe('string');
    expect(env.JWT_SECRET).not.toBe('');
    expect(env.JWT_SECRET).not.toContain('${');
    expect(env.AI_GATEWAY_API_KEY).toBe('${AI_GATEWAY_API_KEY:-}');
    expect(env).toHaveProperty('RELEASE_ID');
  });

  // DB가 응답하기 전에 서버가 뜨면 시드·연결이 실패한다.
  it('server waits for healthy db', () => {
    const deps = server.depends_on as Record<string, { condition?: string }>;
    expect(deps.db.condition).toBe('service_healthy');
  });

  it('db is mongo:7 with db-data volume and ping healthcheck', () => {
    expect(db.image).toBe('mongo:7');
    expect(db.volumes?.some((v) => v.startsWith('db-data:'))).toBe(true);
    expect(compose.volumes).toHaveProperty('db-data');
    const test = db.healthcheck?.test;
    expect(Array.isArray(test) ? test.join(' ') : test).toContain("db.adminCommand('ping')");
  });

  // 주최 측 실행 환경에서 포트·컨테이너 이름이 겹치거나 없는 env 파일을 찾으면 기동이 실패한다.
  it('only app has ports; no container_name or env_file anywhere', () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      if (name !== 'app') expect(svc.ports).toBeUndefined();
      expect(svc.container_name).toBeUndefined();
      expect(svc.env_file).toBeUndefined();
    }
  });

  // 세션 쿠키 인증은 버렸다. 남아 있으면 쓰이지 않는 비밀이 배포 설정에 끌려 다닌다.
  it('has no SESSION_SECRET anywhere', () => {
    expect(readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8')).not.toContain('SESSION_SECRET');
  });
});

// 브라우저는 3000(nginx) 하나로만 들어오므로 /api/와 /__health는 nginx가 server로 넘겨야 한다.
// 넘길 주소는 API_UPSTREAM 하나로 받아 compose(server:3001)와 Lightsail(localhost:3001)의 차이를 이 값에만 둔다(C2-2).
describe('C1-5 deploy/nginx.conf.template', () => {
  const conf = readFileSync(join(repoRoot, 'deploy', 'nginx.conf.template'), 'utf8');
  const block = (header: string) => {
    const start = conf.indexOf(header);
    // 블록 끝은 줄 맨 앞(들여쓰기 뒤)의 '}'다. ${API_UPSTREAM} 안의 '}'에서 자르지 않는다.
    if (start < 0) return '';
    const end = conf.slice(start).search(/\n\s*\}/);
    return end < 0 ? conf.slice(start) : conf.slice(start, start + end);
  };

  it('proxies /api/ to ${API_UPSTREAM} with a long read timeout for AI calls', () => {
    const api = block('location /api/ {');
    expect(api).toContain('proxy_pass ${API_UPSTREAM};');
    expect(api).toContain('proxy_read_timeout 120s;');
    expect(conf).not.toContain('server:3000');
  });

  // 단서 파일(최대 5MB)이 nginx 기본 1MB 한도에 막혀 HTML 413이 나가지 않게 한다.
  it('allows request bodies up to 6m', () => {
    expect(conf).toMatch(/^\s*client_max_body_size 6m;$/m);
  });

  it('root Dockerfile defaults API_UPSTREAM to the compose server', () => {
    const dockerfile = readFileSync(join(repoRoot, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/^ENV API_UPSTREAM=http:\/\/server:3001$/m);
  });

  // releaseId는 서버가 RELEASE_ID로 답해야 한다. nginx가 직접 return하면 서버 상태와 무관하게 200이 나간다.
  it('proxies /__health to server instead of returning directly', () => {
    expect(block('location = /__health {')).toContain('proxy_pass ${API_UPSTREAM}/__health;');
    expect(conf).not.toContain('return 200');
  });

  it('keeps SPA fallback', () => {
    expect(block('location / {')).toContain('try_files $uri /index.html;');
  });
});
