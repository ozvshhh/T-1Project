// 비밀번호·토큰 관련 숫자를 한 곳에 둔다(api.md 11절 비밀번호 규칙이 정해지면 여기만 고친다).

// bcrypt는 72바이트 뒤를 버리므로, 넘는 입력을 받으면 앞부분만 같아도 로그인된다.
export const PASSWORD_MAX_BYTES = 72;

// bcrypt 비용 인자. 10이면 기동·가입 지연 없이 해시 강도를 확보한다.
export const BCRYPT_ROUNDS = 10;

// 만료는 api.md 11절 「학생 답 대기」라 환경변수로만 바꾼다.
export const DEFAULT_JWT_EXPIRES_IN = '7d';

// JWT_SECRET이 비었을 때 만드는 임시 비밀의 바이트 수. 32바이트(256비트)면 HS256 키로 추측할 수 없다.
export const GENERATED_JWT_SECRET_BYTES = 32;
