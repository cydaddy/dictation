# AI 기반 받아쓰기 문제 생성기

초등학교 선생님을 위한 AI 기반 받아쓰기 문제 자동 생성 및 평가 시스템입니다.

## 주요 기능

- **AI 문제 생성**: Google Gemini 또는 Upstage Solar를 활용한 자동 문장 생성
- **고품질 TTS**: Humelo Prosody TTS를 사용한 자연스러운 한국어 음성 합성
- **선생님용 출제**: 자동 음성으로 받아쓰기 진행
- **학생용 테스트**: 온라인으로 받아쓰기 응시 및 즉시 채점
- **결과 대시보드**: 학생별 제출 결과 및 오답 분석

## 기술 스택

### Backend
- Node.js + Express.js
- SQLite (better-sqlite3)
- Google Gemini API
- Upstage Solar API
- Humelo Prosody TTS API

### Frontend
- Vanilla JavaScript
- HTML5 Audio API
- CSS3

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 참고하여 `.env` 파일을 생성하고 API 키를 입력하세요:

```env
# AI model selection (gemini or solar)
AI_MODEL=solar

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
SOLAR_API_KEY=your_solar_api_key_here

# Humelo Prosody TTS API Key
HUMELO_API_KEY=your_humelo_api_key_here

# Server port
PORT=3000
```

### 3. 서버 실행

**개발 모드** (자동 재시작):
```bash
npm run dev
```

**프로덕션 모드**:
```bash
npm start
```

서버가 실행되면 브라우저에서 `http://localhost:3000`으로 접속합니다.

## 사용 방법

### 1. 문제 세트 생성

1. 메인 페이지에서 AI 모델(Solar/Gemini) 선택
2. 키워드와 문장 개수 입력
3. "생성하기" 버튼 클릭
4. 생성된 문장 확인 후 "저장하기" 클릭
5. **자동으로 TTS 음성 파일이 생성됩니다**

### 2. 받아쓰기 출제 (선생님)

1. "저장된 문제" 페이지에서 문제 세트 클릭
2. 읽어주기 횟수 설정
3. "출제 준비" 버튼 클릭
4. 전체화면으로 자동 진행

### 3. 학생 테스트

1. 선생님이 "학생 링크 생성" 클릭
2. 생성된 링크를 학생들에게 공유
3. 학생이 학년/반/번호/이름 입력 후 시험 시작
4. 각 문제를 듣고 답안 입력
5. 모든 문제 완료 후 자동 제출 및 채점

### 4. 결과 확인

1. "저장된 문제" 페이지에서 문제 세트 열기
2. "대시보드" 버튼 클릭
3. 학생별 점수 및 상세 답안 확인

## TTS 음성 생성 시스템

### 자동 생성되는 파일

문제 세트를 저장하면 다음 구조로 음성 파일이 자동 생성됩니다:

```
audio/
└── problem_{문제세트ID}/
    ├── number_1.mp3    # "일번"
    ├── sentence_1.mp3  # 첫 번째 문장
    ├── number_2.mp3    # "이번"
    ├── sentence_2.mp3  # 두 번째 문장
    └── ...
```

### TTS 설정

- **음성**: 시아 (Humelo Prosody TTS)
- **감정**: neutral
- **형식**: MP3
- **품질**: 48kHz 스튜디오 품질

### 주의사항

- 문제 세트 저장 후 TTS 생성은 백그라운드에서 진행됩니다
- 문제 개수가 많을 경우 몇 초~수십 초 소요될 수 있습니다
- 음성 파일 생성 완료 전 출제 시 오류가 발생할 수 있습니다
- 문제 세트 삭제 시 음성 파일도 함께 삭제됩니다

## API 엔드포인트

### 문제 생성
- `POST /api/generate` - AI로 문장 생성

### 문제 관리
- `POST /api/save` - 문제 세트 저장 (TTS 자동 생성)
- `GET /api/problem-sets` - 문제 세트 목록 조회
- `GET /api/problem-sets/:id` - 특정 문제 세트 조회
- `PATCH /api/problem-sets/:id` - 문제 세트 제목 수정
- `DELETE /api/problem-sets/:id` - 문제 세트 삭제 (음성 파일 포함)

### 세션 및 제출
- `POST /api/sessions` - 학생 테스트 세션 생성
- `GET /api/sessions/:sessionId` - 세션 정보 조회
- `POST /api/submissions` - 학생 답안 제출
- `GET /api/submissions/:problemSetId` - 제출 목록 조회
- `GET /api/submissions/detail/:submissionId` - 상세 답안 조회

### 오디오 파일
- `GET /audio/problem_{id}/number_{n}.mp3` - 문제 번호 음성
- `GET /audio/problem_{id}/sentence_{n}.mp3` - 문장 음성

## 데이터베이스 스키마

- `problem_sets` - 문제 세트 메타데이터
- `sentences` - 문장 데이터
- `student_sessions` - 테스트 세션
- `student_submissions` - 학생 제출 기록
- `student_answers` - 개별 답안 정답/오답

## 라이센스

ISC

## 개발자

초등학교 교육을 위한 오픈소스 프로젝트
