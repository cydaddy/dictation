require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3010;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// 오디오 파일 저장 디렉토리 설정
const AUDIO_DIR = path.join(__dirname, 'audio');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}
app.use('/audio', express.static(AUDIO_DIR));

// TTS 생성 상태 추적 (메모리 저장)
const ttsStatus = {};
// 예: { problemSetId: { status: 'generating' | 'complete' | 'error', current: 2, total: 5 } }

// Gemini 설정
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// SQLite 데이터베이스 설정
const db = new Database(path.join(__dirname, 'dictation.db'));

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS problem_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    voice_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 기존 테이블에 voice_name 컬럼 추가 (이미 있으면 에러 무시)
try {
  db.exec(`ALTER TABLE problem_sets ADD COLUMN voice_name TEXT`);
  console.log('voice_name 컬럼이 추가되었습니다.');
} catch (error) {
  // 컬럼이 이미 존재하면 에러 무시
  if (!error.message.includes('duplicate column name')) {
    console.error('컬럼 추가 오류:', error.message);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_set_id INTEGER NOT NULL,
    sentence_number INTEGER NOT NULL,
    sentence_text TEXT NOT NULL,
    FOREIGN KEY (problem_set_id) REFERENCES problem_sets(id)
  )
`);

// 학생 세션 테이블
db.exec(`
  CREATE TABLE IF NOT EXISTS student_sessions (
    id TEXT PRIMARY KEY,
    problem_set_id INTEGER NOT NULL,
    read_count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (problem_set_id) REFERENCES problem_sets(id)
  )
`);

// 학생 제출 테이블
db.exec(`
  CREATE TABLE IF NOT EXISTS student_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    class_num INTEGER NOT NULL,
    student_num INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    score INTEGER,
    total INTEGER,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES student_sessions(id)
  )
`);

// 학생 답안 테이블
db.exec(`
  CREATE TABLE IF NOT EXISTS student_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    sentence_number INTEGER NOT NULL,
    student_answer TEXT,
    is_correct INTEGER NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES student_submissions(id)
  )
`);

// 랜덤 보이스 선택 함수
function getRandomVoice() {
  const voices = ['시아', '효은', '희웅', '선우'];
  return voices[Math.floor(Math.random() * voices.length)];
}

// Humelo Prosody TTS 함수
async function generateTTS(text, outputPath, voiceName) {
  try {
    console.log(`TTS 생성 중 - 보이스: ${voiceName}, 텍스트: ${text}`);

    const response = await axios.post(
      'https://agitvxptajouhvoatxio.supabase.co/functions/v1/dive-synthesize-v1',
      {
        text: text,
        mode: 'preset',
        voiceName: voiceName,
        emotion: 'neutral',
        lang: 'ko',
        outputFormat: 'mp3'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.HUMELO_API_KEY
        }
      }
    );

    console.log('TTS API 응답:', JSON.stringify(response.data, null, 2));

    // API 응답에서 audioUrl 확인 (success 필드 대신 audioUrl로 성공 판단)
    const audioUrl = response.data.audioUrl || response.data.audio_url;
    if (!audioUrl) {
      console.error('TTS API 실패 응답:', response.data);
      throw new Error(`TTS 생성 실패: ${response.data.error || response.data.message || '오디오 URL 없음'}`);
    }

    // 오디오 파일 다운로드
    const audioResponse = await axios.get(audioUrl, {
      responseType: 'arraybuffer'
    });

    // 파일 저장
    fs.writeFileSync(outputPath, audioResponse.data);

    console.log(`TTS 생성 완료: ${outputPath}`);
    return true;
  } catch (error) {
    if (error.response) {
      // API가 에러 응답을 반환한 경우
      console.error('TTS API 에러 응답:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.request) {
      // 요청은 보냈지만 응답을 받지 못한 경우
      console.error('TTS API 응답 없음:', error.message);
    } else {
      // 요청 설정 중 에러
      console.error('TTS 생성 오류:', error.message);
    }
    throw error;
  }
}

// 한글 숫자를 생성하는 함수
function getKoreanNumber(num) {
  const koreanNumbers = ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십'];

  if (num <= 10) {
    return koreanNumbers[num - 1] + ' 번. ';  // 공백 + 마침표 + 공백 (약간의 쉼)
  } else if (num <= 99) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    let result = '';

    if (tens === 1) {
      result = '십';
    } else {
      result = koreanNumbers[tens - 1] + '십';
    }

    if (ones > 0) {
      result += koreanNumbers[ones - 1];
    }

    return result + ' 번. ';  // 공백 + 마침표 + 공백 (약간의 쉼)
  } else {
    return num + ' 번. ';  // 공백 + 마침표 + 공백 (약간의 쉼)
  }
}

// 받아쓰기 문제 생성 API
app.post('/api/generate', async (req, res) => {
  try {
    const { inputs, additionalRequests, count, grade } = req.body;

    if (!count) {
      return res.status(400).json({ error: '문장 개수가 필요합니다.' });
    }

    const targetGrade = grade || 3; // 기본값 3학년
    const sentences = await generateWithGemini(inputs || '', additionalRequests || '', count, targetGrade);

    res.json({ sentences });
  } catch (error) {
    console.error('생성 오류:', error);
    res.status(500).json({ error: '문장 생성 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문제 세트 저장 API (TTS 오디오 생성 포함)
app.post('/api/save', async (req, res) => {
  try {
    const { title, sentences } = req.body;

    if (!title || !sentences || sentences.length === 0) {
      return res.status(400).json({ error: '제목과 문장이 필요합니다.' });
    }

    // 보이스 랜덤 선택
    const voiceName = getRandomVoice();

    // 트랜잭션으로 저장
    const insertProblemSet = db.prepare('INSERT INTO problem_sets (title, voice_name) VALUES (?, ?)');
    const insertSentence = db.prepare('INSERT INTO sentences (problem_set_id, sentence_number, sentence_text) VALUES (?, ?, ?)');

    const transaction = db.transaction((title, voiceName, sentences) => {
      const info = insertProblemSet.run(title, voiceName);
      const problemSetId = info.lastInsertRowid;

      sentences.forEach((sentence, index) => {
        insertSentence.run(problemSetId, index + 1, sentence);
      });

      return problemSetId;
    });

    const problemSetId = transaction(title, voiceName, sentences);

    // 문제 세트별 오디오 폴더 생성
    const problemAudioDir = path.join(AUDIO_DIR, `problem_${problemSetId}`);
    if (!fs.existsSync(problemAudioDir)) {
      fs.mkdirSync(problemAudioDir, { recursive: true });
    }

    // TTS 생성 상태 초기화
    ttsStatus[problemSetId] = {
      status: 'generating',
      current: 0,
      total: sentences.length
    };

    // TTS 오디오 파일 생성 (비동기로 백그라운드 처리)
    setImmediate(async () => {
      try {
        console.log(`문제 세트 ${problemSetId}의 TTS 생성 시작... (보이스: ${voiceName})`);

        // 각 문장에 대해 오디오 생성
        for (let i = 0; i < sentences.length; i++) {
          const sentenceNum = i + 1;
          const sentence = sentences[i];

          // 번호 + 문장을 합쳐서 하나의 오디오로 생성 (예: "일 번. 오늘은 날씨가 좋습니다.")
          const numberText = getKoreanNumber(sentenceNum);
          const fullText = `${numberText} ${sentence}`;
          const sentenceAudioPath = path.join(problemAudioDir, `sentence_${sentenceNum}.mp3`);
          await generateTTS(fullText, sentenceAudioPath, voiceName);

          // TTS 상태 업데이트
          ttsStatus[problemSetId].current = sentenceNum;

          console.log(`문제 ${sentenceNum} TTS 생성 완료`);
        }

        // 완료 상태로 변경
        ttsStatus[problemSetId].status = 'complete';
        console.log(`문제 세트 ${problemSetId} TTS 생성 모두 완료 (보이스: ${voiceName})`);

        // 5분 후 상태 정보 삭제 (메모리 정리)
        setTimeout(() => {
          delete ttsStatus[problemSetId];
        }, 5 * 60 * 1000);
      } catch (error) {
        ttsStatus[problemSetId].status = 'error';
        console.error(`문제 세트 ${problemSetId} TTS 생성 오류:`, error);
      }
    });

    res.json({ success: true, id: problemSetId, message: '저장되었습니다. 음성 파일을 생성 중입니다.' });
  } catch (error) {
    console.error('저장 오류:', error);
    res.status(500).json({ error: '저장 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문제 세트 목록 조회 API
app.get('/api/problem-sets', (req, res) => {
  try {
    const problemSets = db.prepare(`
      SELECT
        ps.id,
        ps.title,
        ps.created_at,
        COUNT(s.id) as sentence_count
      FROM problem_sets ps
      LEFT JOIN sentences s ON ps.id = s.problem_set_id
      GROUP BY ps.id
      ORDER BY ps.created_at DESC
    `).all();

    // 각 문제 세트에 대해 오디오 파일 존재 여부 확인
    const problemSetsWithAudio = problemSets.map(ps => {
      const audioDir = path.join(AUDIO_DIR, `problem_${ps.id}`);
      let hasAudio = false;

      if (fs.existsSync(audioDir)) {
        // 첫 번째 문장의 오디오 파일이 있으면 TTS 생성 완료로 판단
        const firstAudioFile = path.join(audioDir, 'sentence_1.mp3');
        hasAudio = fs.existsSync(firstAudioFile);
      }

      return { ...ps, has_audio: hasAudio };
    });

    res.json({ problemSets: problemSetsWithAudio });
  } catch (error) {
    console.error('목록 조회 오류:', error);
    res.status(500).json({ error: '목록 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

// TTS 생성 상태 조회 API
app.get('/api/tts-status', (req, res) => {
  try {
    // 모든 진행 중인 TTS 상태 반환
    const statuses = {};
    for (const [id, status] of Object.entries(ttsStatus)) {
      statuses[id] = status;
    }
    res.json({ statuses });
  } catch (error) {
    console.error('TTS 상태 조회 오류:', error);
    res.status(500).json({ error: 'TTS 상태 조회 중 오류가 발생했습니다.' });
  }
});

// 특정 문제 세트 TTS 상태 조회
app.get('/api/tts-status/:id', (req, res) => {
  try {
    const { id } = req.params;
    const status = ttsStatus[id] || null;
    res.json({ status });
  } catch (error) {
    console.error('TTS 상태 조회 오류:', error);
    res.status(500).json({ error: 'TTS 상태 조회 중 오류가 발생했습니다.' });
  }
});

// 특정 문제 세트 상세 조회 API
app.get('/api/problem-sets/:id', (req, res) => {
  try {
    const { id } = req.params;

    const problemSet = db.prepare('SELECT * FROM problem_sets WHERE id = ?').get(id);

    if (!problemSet) {
      return res.status(404).json({ error: '문제 세트를 찾을 수 없습니다.' });
    }

    const sentences = db.prepare(`
      SELECT * FROM sentences
      WHERE problem_set_id = ?
      ORDER BY sentence_number
    `).all(id);

    res.json({
      id: problemSet.id,
      title: problemSet.title,
      created_at: problemSet.created_at,
      sentences
    });
  } catch (error) {
    console.error('상세 조회 오류:', error);
    res.status(500).json({ error: '상세 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문제 세트 제목 수정 API
app.patch('/api/problem-sets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: '제목이 필요합니다.' });
    }

    const result = db.prepare('UPDATE problem_sets SET title = ? WHERE id = ?').run(title.trim(), id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '문제 세트를 찾을 수 없습니다.' });
    }

    res.json({ success: true, message: '제목이 수정되었습니다.' });
  } catch (error) {
    console.error('제목 수정 오류:', error);
    res.status(500).json({ error: '제목 수정 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문장 수정 API (TTS 재생성 포함)
app.patch('/api/sentences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sentenceText } = req.body;

    if (!sentenceText || !sentenceText.trim()) {
      return res.status(400).json({ error: '문장 내용이 필요합니다.' });
    }

    // 문장 정보 조회
    const sentence = db.prepare('SELECT * FROM sentences WHERE id = ?').get(id);

    if (!sentence) {
      return res.status(404).json({ error: '문장을 찾을 수 없습니다.' });
    }

    // 문제 세트 정보 조회 (보이스 정보 가져오기)
    const problemSet = db.prepare('SELECT voice_name FROM problem_sets WHERE id = ?').get(sentence.problem_set_id);

    if (!problemSet || !problemSet.voice_name) {
      return res.status(404).json({ error: '문제 세트 정보를 찾을 수 없습니다.' });
    }

    // 문장 업데이트
    const result = db.prepare('UPDATE sentences SET sentence_text = ? WHERE id = ?').run(sentenceText.trim(), id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '문장 수정에 실패했습니다.' });
    }

    // TTS 재생성 (비동기로 백그라운드 처리)
    setImmediate(async () => {
      try {
        const problemAudioDir = path.join(AUDIO_DIR, `problem_${sentence.problem_set_id}`);
        if (!fs.existsSync(problemAudioDir)) {
          fs.mkdirSync(problemAudioDir, { recursive: true });
        }

        // 번호 + 문장 합쳐서 TTS 생성
        const numberText = getKoreanNumber(sentence.sentence_number);
        const fullText = `${numberText} ${sentenceText.trim()}`;
        const sentenceAudioPath = path.join(problemAudioDir, `sentence_${sentence.sentence_number}.mp3`);

        console.log(`문장 ${sentence.sentence_number} TTS 재생성 시작... (보이스: ${problemSet.voice_name})`);
        await generateTTS(fullText, sentenceAudioPath, problemSet.voice_name);
        console.log(`문장 ${sentence.sentence_number} TTS 재생성 완료`);
      } catch (error) {
        console.error(`문장 ${sentence.sentence_number} TTS 재생성 오류:`, error);
      }
    });

    res.json({ success: true, message: '문장이 수정되었습니다. 음성 파일을 재생성 중입니다.' });
  } catch (error) {
    console.error('문장 수정 오류:', error);
    res.status(500).json({ error: '문장 수정 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문제 세트 삭제 API (평가 결과 및 오디오 파일 포함)
app.delete('/api/problem-sets/:id', (req, res) => {
  try {
    const { id } = req.params;

    const transaction = db.transaction((id) => {
      // 1. 해당 문제 세트와 연결된 세션 ID들 조회
      const sessions = db.prepare('SELECT id FROM student_sessions WHERE problem_set_id = ?').all(id);
      const sessionIds = sessions.map(s => s.id);

      // 2. 각 세션의 제출 ID들 조회
      if (sessionIds.length > 0) {
        const placeholders = sessionIds.map(() => '?').join(',');
        const submissions = db.prepare(`SELECT id FROM student_submissions WHERE session_id IN (${placeholders})`).all(...sessionIds);
        const submissionIds = submissions.map(s => s.id);

        // 3. 학생 답안 삭제
        if (submissionIds.length > 0) {
          const answerPlaceholders = submissionIds.map(() => '?').join(',');
          db.prepare(`DELETE FROM student_answers WHERE submission_id IN (${answerPlaceholders})`).run(...submissionIds);
        }

        // 4. 학생 제출 삭제
        db.prepare(`DELETE FROM student_submissions WHERE session_id IN (${placeholders})`).run(...sessionIds);
      }

      // 5. 학생 세션 삭제
      db.prepare('DELETE FROM student_sessions WHERE problem_set_id = ?').run(id);

      // 6. 문장 삭제
      db.prepare('DELETE FROM sentences WHERE problem_set_id = ?').run(id);

      // 7. 문제 세트 삭제
      const result = db.prepare('DELETE FROM problem_sets WHERE id = ?').run(id);
      return result.changes;
    });

    const changes = transaction(id);

    if (changes === 0) {
      return res.status(404).json({ error: '문제 세트를 찾을 수 없습니다.' });
    }

    // 8. 오디오 파일 삭제
    const problemAudioDir = path.join(AUDIO_DIR, `problem_${id}`);
    if (fs.existsSync(problemAudioDir)) {
      fs.rmSync(problemAudioDir, { recursive: true, force: true });
      console.log(`오디오 폴더 삭제 완료: ${problemAudioDir}`);
    }

    res.json({ success: true, message: '문제 세트와 관련된 모든 평가 결과 및 음성 파일이 삭제되었습니다.' });
  } catch (error) {
    console.error('삭제 오류:', error);
    res.status(500).json({ error: '삭제 중 오류가 발생했습니다.', details: error.message });
  }
});

// Gemini로 문장 생성
async function generateWithGemini(inputs, additionalRequests, count, grade) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview'
  });

  // 학년별 난이도 가이드
  const gradeGuide = {
    1: { level: '매우 쉬운', length: '10~15자', description: '기본 받침과 간단한 단어 위주, 짧은 문장' },
    2: { level: '쉬운', length: '15~20자', description: '겹받침 일부 포함, 간단한 조사 활용' },
    3: { level: '보통', length: '20~30자', description: '다양한 받침과 조사, 기본적인 연결어미 사용' },
    4: { level: '중간', length: '25~35자', description: '복합 문장 구조, 다양한 어휘 활용' },
    5: { level: '어려운', length: '30~40자', description: '복잡한 문장 구조, 관용 표현 포함 가능' },
    6: { level: '높은', length: '35~45자', description: '고급 어휘와 복잡한 문장, 추상적 개념 포함 가능' }
  };

  const currentGuide = gradeGuide[grade] || gradeGuide[3];

  // 입력된 단어/표현을 콤마로 분리
  const keywords = inputs.trim() ? inputs.split(',').map(k => k.trim()).filter(k => k.length > 0) : [];
  const keywordCount = keywords.length;

  let prompt = `당신은 초등학교 ${grade}학년을 위한 받아쓰기 문제를 출제하는 선생님입니다.

대상 학년: 초등학교 ${grade}학년
난이도: ${currentGuide.level}
권장 문장 길이: ${currentGuide.length}
특징: ${currentGuide.description}

총 ${count}개의 받아쓰기 문장을 만들어주세요.

`;

  if (keywordCount > 0) {
    if (keywordCount <= count) {
      // 키워드 수가 문항 수 이하: 각 키워드를 개별 문장에 포함
      const randomCount = count - keywordCount;
      prompt += `다음 단어/표현을 각각 하나의 문장에만 포함시켜주세요 (각 단어/표현은 전체 문제 세트에서 딱 한 번만 사용):
${keywords.map((k, i) => `${i + 1}번 문장: "${k}" 포함`).join('\n')}

`;
      if (randomCount > 0) {
        prompt += `나머지 ${randomCount}개 문장은 ${grade}학년에게 적합한 내용으로 자유롭게 작성해주세요.

`;
      }
    } else {
      // 키워드 수가 문항 수보다 많음: 여러 키워드를 문장에 분배
      prompt += `다음 ${keywordCount}개의 단어/표현을 ${count}개 문장에 골고루 분배하여 포함시켜주세요.
각 단어/표현은 전체 문제 세트에서 딱 한 번만 사용되어야 합니다.
한 문장에 여러 개의 단어/표현이 들어가도 되지만, 자연스러운 문장이 되도록 작성하세요.

포함시킬 단어/표현:
${keywords.map((k, i) => `${i + 1}. "${k}"`).join('\n')}

`;
    }
  } else {
    // 키워드가 없으면 자유롭게 작성
    prompt += `${grade}학년에게 적합한 내용으로 ${count}개 문장을 자유롭게 작성해주세요.

`;
  }

  if (additionalRequests.trim()) {
    prompt += `추가 요청사항:
${additionalRequests}

`;
  }

  prompt += `요구사항:
1. 각 문장은 초등학교 ${grade}학년이 이해하기 쉬운 자연스러운 문장이어야 합니다.
2. 교육적이고 긍정적인 내용으로 작성하세요.
3. 각 단어/표현은 해당 문장에만 사용하고 다른 문장에서는 사용하지 마세요.
4. 해라체, 하게체, 하오체, 합쇼체 등 다양한 높임 수준으로 문장을 끝 맺게 하되 자연스럽게 해줘.
5. 쉼표(,)나 따옴표("", '')를 절대 사용하지 않는 문장을 생성하세요.
6. 모든 문장은 반드시 마침표(.) 또는 물음표(?)로 끝나야 합니다.

반드시 다음 JSON 형식으로만 응답하세요. 다른 설명이나 텍스트는 포함하지 마세요:
{
  "sentences": ["문장1", "문장2", "문장3", ...]
}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  console.log('Gemini 원본 응답:', text);

  // JSON 코드 블록이 있다면 제거
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```\n?/g, '');
  }

  const data = JSON.parse(jsonText);
  const sentences = data.sentences.slice(0, count);

  console.log('Gemini 파싱된 문장:', sentences);

  return sentences;
}

// 학생 세션 생성 API (문제 세트당 하나의 세션만 생성)
app.post('/api/sessions', (req, res) => {
  try {
    const { problemSetId, readCount } = req.body;

    if (!problemSetId || !readCount) {
      return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    // 기존 세션 확인 (같은 problemSetId로 생성된 세션이 있으면 재사용)
    const existingSession = db.prepare(`
      SELECT id FROM student_sessions 
      WHERE problem_set_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(problemSetId);

    if (existingSession) {
      // 기존 세션 재사용
      console.log(`기존 세션 재사용: ${existingSession.id}`);
      return res.json({ success: true, sessionId: existingSession.id, reused: true });
    }

    // 고유 세션 ID 생성
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare('INSERT INTO student_sessions (id, problem_set_id, read_count) VALUES (?, ?, ?)');
    stmt.run(sessionId, problemSetId, readCount);

    console.log(`새 세션 생성: ${sessionId}`);
    res.json({ success: true, sessionId, reused: false });
  } catch (error) {
    console.error('세션 생성 오류:', error);
    res.status(500).json({ error: '세션 생성 중 오류가 발생했습니다.', details: error.message });
  }
});

// 학생 세션 조회 API
app.get('/api/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = db.prepare(`
      SELECT ss.*, ps.title
      FROM student_sessions ss
      JOIN problem_sets ps ON ss.problem_set_id = ps.id
      WHERE ss.id = ?
    `).get(sessionId);

    if (!session) {
      return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    }

    const sentences = db.prepare(`
      SELECT * FROM sentences
      WHERE problem_set_id = ?
      ORDER BY sentence_number
    `).all(session.problem_set_id);

    res.json({ session, sentences });
  } catch (error) {
    console.error('세션 조회 오류:', error);
    res.status(500).json({ error: '세션 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

// 학생 답안 제출 API
app.post('/api/submissions', (req, res) => {
  try {
    const { sessionId, grade, classNum, studentNum, studentName, answers } = req.body;

    if (!sessionId || !grade || !classNum || !studentNum || !studentName || !answers) {
      return res.status(400).json({ error: '필수 정보가 없습니다.' });
    }

    // 세션에서 문제 세트 가져오기
    const session = db.prepare('SELECT problem_set_id FROM student_sessions WHERE id = ?').get(sessionId);

    if (!session) {
      return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    }

    // 정답 가져오기
    const sentences = db.prepare(`
      SELECT sentence_number, sentence_text
      FROM sentences
      WHERE problem_set_id = ?
      ORDER BY sentence_number
    `).all(session.problem_set_id);

    // 채점
    let score = 0;
    const gradedAnswers = sentences.map(sentence => {
      const studentAnswer = answers[sentence.sentence_number] || '';
      const correctAnswer = sentence.sentence_text;
      const isCorrect = studentAnswer.trim() === correctAnswer.trim();

      if (isCorrect) score++;

      return {
        sentence_number: sentence.sentence_number,
        student_answer: studentAnswer,
        correct_answer: correctAnswer,
        is_correct: isCorrect
      };
    });

    const total = sentences.length;

    // 트랜잭션으로 제출 저장
    const transaction = db.transaction((sessionId, grade, classNum, studentNum, studentName, score, total, gradedAnswers) => {
      const insertSubmission = db.prepare(`
        INSERT INTO student_submissions (session_id, grade, class_num, student_num, student_name, score, total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const info = insertSubmission.run(sessionId, grade, classNum, studentNum, studentName, score, total);
      const submissionId = info.lastInsertRowid;

      const insertAnswer = db.prepare(`
        INSERT INTO student_answers (submission_id, sentence_number, student_answer, is_correct)
        VALUES (?, ?, ?, ?)
      `);

      gradedAnswers.forEach(answer => {
        insertAnswer.run(submissionId, answer.sentence_number, answer.student_answer, answer.is_correct ? 1 : 0);
      });

      return submissionId;
    });

    const submissionId = transaction(sessionId, grade, classNum, studentNum, studentName, score, total, gradedAnswers);

    res.json({ success: true, submissionId, score, total, answers: gradedAnswers });
  } catch (error) {
    console.error('제출 오류:', error);
    res.status(500).json({ error: '제출 중 오류가 발생했습니다.', details: error.message });
  }
});

// 문제 세트별 제출 목록 조회 API
app.get('/api/submissions/:problemSetId', (req, res) => {
  try {
    const { problemSetId } = req.params;

    const submissions = db.prepare(`
      SELECT
        ss.grade,
        ss.class_num,
        ss.student_num,
        ss.student_name,
        ss.score,
        ss.total,
        ss.submitted_at,
        ss.id as submission_id
      FROM student_submissions ss
      JOIN student_sessions s ON ss.session_id = s.id
      WHERE s.problem_set_id = ?
      ORDER BY ss.submitted_at DESC
    `).all(problemSetId);

    res.json({ submissions });
  } catch (error) {
    console.error('제출 목록 조회 오류:', error);
    res.status(500).json({ error: '제출 목록 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

// 학생이 자신의 최신 시험 결과 조회 API (세션 있으면 해당 세션, 없으면 최신 결과)
app.get('/api/my-result', (req, res) => {
  try {
    const { sessionId, grade, classNum, studentNum } = req.query;

    if (!grade || !classNum || !studentNum) {
      return res.status(400).json({ error: '학년, 반, 번호를 입력해주세요.' });
    }

    let submission;
    let session;

    if (sessionId) {
      // 특정 세션에서 조회
      submission = db.prepare(`
        SELECT * FROM student_submissions 
        WHERE session_id = ? AND grade = ? AND class_num = ? AND student_num = ?
        ORDER BY submitted_at DESC
        LIMIT 1
      `).get(sessionId, grade, classNum, studentNum);

      if (submission) {
        session = db.prepare(`SELECT problem_set_id FROM student_sessions WHERE id = ?`).get(sessionId);
      }
    }

    // 세션 없거나 해당 세션에 결과가 없으면 전체에서 최신 결과 조회
    if (!submission) {
      submission = db.prepare(`
        SELECT ss.*, s.problem_set_id 
        FROM student_submissions ss
        JOIN student_sessions s ON ss.session_id = s.id
        WHERE ss.grade = ? AND ss.class_num = ? AND ss.student_num = ?
        ORDER BY ss.submitted_at DESC
        LIMIT 1
      `).get(grade, classNum, studentNum);

      if (submission) {
        session = { problem_set_id: submission.problem_set_id };
      }
    }

    if (!submission) {
      return res.status(404).json({ error: '시험 결과를 찾을 수 없습니다. 아직 시험을 보지 않았거나 정보가 틀렸습니다.' });
    }

    // 답안과 정답 문장 가져오기
    const answers = db.prepare(`
      SELECT
        sa.sentence_number,
        sa.student_answer,
        sa.is_correct,
        (SELECT s.sentence_text FROM sentences s
         WHERE s.problem_set_id = ? AND s.sentence_number = sa.sentence_number
         LIMIT 1) as correct_answer
      FROM student_answers sa
      WHERE sa.submission_id = ?
      ORDER BY sa.sentence_number
    `).all(session.problem_set_id, submission.id);

    res.json({
      success: true,
      submission: {
        score: submission.score,
        total: submission.total,
        submitted_at: submission.submitted_at,
        student_name: submission.student_name
      },
      answers
    });
  } catch (error) {
    console.error('결과 조회 오류:', error);
    res.status(500).json({ error: '결과 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

// 학생이 자신의 최신 시험 결과 조회 API (기존 호환용)
app.get('/api/my-result/:sessionId', (req, res) => {
  req.query.sessionId = req.params.sessionId;
  // 위의 API로 리다이렉트
  const { grade, classNum, studentNum } = req.query;
  res.redirect(`/api/my-result?sessionId=${req.params.sessionId}&grade=${grade}&classNum=${classNum}&studentNum=${studentNum}`);
});

// 특정 제출의 상세 답안 조회 API
app.get('/api/submissions/detail/:submissionId', (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = db.prepare(`
      SELECT * FROM student_submissions WHERE id = ?
    `).get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: '제출을 찾을 수 없습니다.' });
    }

    // 세션에서 problem_set_id 가져오기
    const session = db.prepare(`
      SELECT problem_set_id FROM student_sessions WHERE id = ?
    `).get(submission.session_id);

    console.log('=== 상세보기 디버깅 ===');
    console.log('submission_id:', submissionId);
    console.log('session_id:', submission.session_id);
    console.log('problem_set_id:', session?.problem_set_id);

    // sentences 테이블 확인
    const sentencesCheck = db.prepare(`
      SELECT sentence_number, sentence_text FROM sentences WHERE problem_set_id = ?
    `).all(session.problem_set_id);
    console.log('sentences 테이블:', sentencesCheck);

    // student_answers 확인
    const studentAnswersCheck = db.prepare(`
      SELECT sentence_number, student_answer FROM student_answers WHERE submission_id = ?
    `).all(submissionId);
    console.log('student_answers 테이블:', studentAnswersCheck);

    // 답안과 정답 문장을 가져오기
    const answers = db.prepare(`
      SELECT
        sa.sentence_number,
        sa.student_answer,
        sa.is_correct,
        (SELECT s.sentence_text FROM sentences s
         WHERE s.problem_set_id = ? AND s.sentence_number = sa.sentence_number
         LIMIT 1) as correct_answer
      FROM student_answers sa
      WHERE sa.submission_id = ?
      ORDER BY sa.sentence_number
    `).all(session.problem_set_id, submissionId);

    console.log('최종 answers:', answers);
    console.log('======================');

    res.json({ submission, answers });
  } catch (error) {
    console.error('답안 상세 조회 오류:', error);
    res.status(500).json({ error: '답안 상세 조회 중 오류가 발생했습니다.', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
