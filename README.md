# 📝 받아쓰기 문제 생성기

AI 기반 초등학생용 받아쓰기 문제 생성 및 시험 프로그램입니다.

## ✨ 주요 기능

### 🎯 선생님용
- **AI 문제 생성**: Google Gemini AI가 학년 수준에 맞는 받아쓰기 문장 자동 생성
- **TTS 음성 생성**: Humelo TTS로 자연스러운 한국어 음성 생성
- **문제 세트 관리**: 생성된 문제 저장, 수정, 삭제
- **학생 링크 생성**: 학생들에게 공유할 시험 링크 생성
- **대시보드**: 학생별 시험 결과 조회

### 📚 학생용
- **2단계 시험**:
  - 1단계 (함께 듣기): 선생님이 직접 읽어주는 단계
  - 2단계 (따로 듣기): 개별 음성 재생으로 복습
- **자동 채점**: 제출 즉시 정답 확인
- **결과 조회**: 학년/반/번호로 이전 시험 결과 다시 보기

## 🛠️ 기술 스택

- **Backend**: Node.js + Express
- **AI**: Google Generative AI (Gemini)
- **TTS**: Humelo Prosody TTS API
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla HTML/CSS/JavaScript

## 📦 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/cydaddy/dictation.git
cd dictation
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경변수 설정
```bash
# .env.example을 복사하여 .env 파일 생성
cp .env.example .env

# .env 파일 열어서 API 키 입력
```

**.env 파일 내용:**
```
GEMINI_API_KEY=your_gemini_api_key_here
HUMELO_API_KEY=your_humelo_api_key_here
PORT=3000
```

### 4. 서버 실행
```bash
# 개발 모드 (자동 재시작)
npm run dev

# 또는 일반 실행
npm start
```

### 5. 브라우저 접속
```
http://localhost:3000
```

## 📖 사용 방법

### 선생님 (문제 출제)

1. **메인 페이지** 접속 (`/`)
2. 출제할 **단어/표현** 입력 (콤마로 구분)
3. **학년** 선택 및 **문장 개수** 설정
4. **[문제 생성하기]** 클릭
5. 생성된 문장 확인 후 **[문제 세트 저장]**

### 선생님 (시험 진행)

1. **[저장된 문제 보기]** 클릭
2. 원하는 문제 세트 선택
3. **[학생 링크 생성]** 클릭 → 링크 복사
4. 학생들에게 링크 공유
5. **[대시보드]**에서 결과 확인

### 학생 (시험 응시)

1. 선생님이 공유한 **링크** 접속
2. **학년/반/번호/이름** 입력
3. **[시험 시작]** 클릭
4. **1단계**: 선생님 말씀 듣고 받아쓰기
5. **2단계**: 틀린 문제 다시 듣기
6. **[제출하기]** 클릭 → 결과 확인

### 학생 (결과 다시 보기)

1. 같은 **링크** 접속
2. **학년/반/번호** 입력
3. **[내 결과 보기]** 클릭

## 📁 프로젝트 구조

```
dictation/
├── server.js           # 메인 서버
├── package.json        # 의존성 정의
├── .env.example        # 환경변수 예시
├── .gitignore          # Git 제외 파일
├── audio/              # TTS 음성 파일 (자동 생성)
├── dictation.db        # SQLite 데이터베이스 (자동 생성)
└── public/             # 프론트엔드 파일
    ├── index.html      # 메인 페이지 (문제 생성)
    ├── saved.html      # 저장된 문제 목록
    ├── student.html    # 학생 시험 입구
    ├── test.html       # 시험 페이지
    ├── dictation.html  # 받아쓰기 출제 페이지
    ├── dashboard.html  # 결과 대시보드
    └── *.css, *.js     # 스타일 및 스크립트
```

## 🔑 API 키 발급

### Google Gemini API
1. [Google AI Studio](https://aistudio.google.com/) 접속
2. API 키 생성
3. `.env` 파일에 `GEMINI_API_KEY` 추가

### Humelo TTS API
1. [Humelo](https://humelo.com/) 회원가입
2. API 키 발급
3. `.env` 파일에 `HUMELO_API_KEY` 추가

## 📝 라이센스

ISC License

## 🤝 기여

이슈 및 PR 환영합니다!
