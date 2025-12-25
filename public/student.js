document.addEventListener('DOMContentLoaded', async () => {
    const infoScreen = document.getElementById('infoScreen');
    const testScreen = document.getElementById('testScreen');
    const resultScreen = document.getElementById('resultScreen');

    const gradeInput = document.getElementById('grade');
    const classNumInput = document.getElementById('classNum');
    const studentNumInput = document.getElementById('studentNum');
    const studentNameInput = document.getElementById('studentName');
    const startTestBtn = document.getElementById('startTestBtn');

    const problemNumber = document.getElementById('problemNumber');
    const progress = document.getElementById('progress');
    const answerInput = document.getElementById('answerInput');
    const submitBtn = document.getElementById('submitBtn');

    const resultScore = document.getElementById('resultScore');
    const resultDetails = document.getElementById('resultDetails');

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const playbackSpeed = parseFloat(urlParams.get('speed')) || 0.8;

    let session = null;
    let sentences = [];
    let currentIndex = 0;
    let answers = {};
    let autoNextTimer = null;
    let isSubmitting = false; // 중복 제출 방지
    let currentAudio = null; // 현재 재생 중인 오디오

    // 세션 정보 로드
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '세션을 찾을 수 없습니다.');
        }

        session = data.session;
        sentences = data.sentences;

        document.querySelector('.student-title').textContent = `${session.title} - 받아쓰기 시험`;
    } catch (error) {
        console.error('세션 로드 오류:', error);
        alert('세션을 불러올 수 없습니다: ' + error.message);
        window.location.href = '/';
    }

    // 시험 시작
    startTestBtn.addEventListener('click', () => {
        const grade = parseInt(gradeInput.value);
        const classNum = parseInt(classNumInput.value);
        const studentNum = parseInt(studentNumInput.value);
        const studentName = studentNameInput.value.trim();

        if (!grade || !classNum || !studentNum || !studentName) {
            alert('모든 정보를 입력해주세요.');
            return;
        }

        infoScreen.classList.remove('active');
        testScreen.classList.add('active');

        startDictation();
    });

    // 오디오 파일 재생
    function playAudio(audioUrl) {
        return new Promise((resolve, reject) => {
            // 이전 오디오가 재생 중이면 정지
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentAudio = null;
            }

            const audio = new Audio(audioUrl);
            currentAudio = audio;

            // 재생 속도 조절 - URL 파라미터 사용
            audio.playbackRate = playbackSpeed;

            audio.onended = () => {
                currentAudio = null;
                resolve();
            };
            audio.onerror = (err) => {
                currentAudio = null;
                reject(err);
            };
            audio.play().catch((err) => {
                currentAudio = null;
                reject(err);
            });
        });
    }

    // 받아쓰기 시작
    async function startDictation() {
        readCurrentProblem();
    }

    // 현재 문제 읽기
    async function readCurrentProblem() {
        // 이전 자동 넘김 타이머 취소
        if (autoNextTimer) {
            clearTimeout(autoNextTimer);
            autoNextTimer = null;
        }

        // 이전 오디오 정지
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }

        if (currentIndex >= sentences.length) {
            // 모든 문제 완료 - 제출
            await submitTest();
            return;
        }

        const sentence = sentences[currentIndex];
        const problemNum = sentence.sentence_number;

        // UI 업데이트
        problemNumber.textContent = `${problemNum}번`;
        progress.textContent = `${currentIndex + 1} / ${sentences.length}`;
        answerInput.value = '';
        answerInput.focus();

        try {
            // 번호 + 문장을 readCount만큼 재생
            const sentenceAudioUrl = `/audio/problem_${session.problem_set_id}/sentence_${problemNum}.mp3`;
            for (let i = 0; i < session.read_count; i++) {
                await playAudio(sentenceAudioUrl);
                if (i < session.read_count - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
        } catch (error) {
            console.error('오디오 재생 오류:', error);
            alert('오디오 파일을 재생하는 중 오류가 발생했습니다. 음성 파일이 생성 중일 수 있습니다.');
        }

        // 듣기가 끝난 후 5초 대기 후 자동으로 다음 문제로
        autoNextTimer = setTimeout(() => {
            // 이미 제출 중이면 무시
            if (isSubmitting) {
                return;
            }

            // 자동으로 답변 저장하고 다음 문제로
            answers[sentence.sentence_number] = answerInput.value.trim();
            currentIndex++;
            readCurrentProblem();
        }, 5000);
    }

    // 제출 버튼 (수동으로 다음 문제로)
    submitBtn.addEventListener('click', () => {
        // 이미 제출 중이면 무시
        if (isSubmitting) {
            return;
        }

        // 자동 넘김 타이머 취소
        if (autoNextTimer) {
            clearTimeout(autoNextTimer);
            autoNextTimer = null;
        }

        // 현재 답변 저장
        const sentence = sentences[currentIndex];
        answers[sentence.sentence_number] = answerInput.value.trim();

        // 다음 문제로
        currentIndex++;
        readCurrentProblem();
    });

    // Enter 키로도 제출
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitBtn.click();
        }
    });

    // 시험 제출
    async function submitTest() {
        // 중복 제출 방지
        if (isSubmitting) {
            return;
        }
        isSubmitting = true;

        const grade = parseInt(gradeInput.value);
        const classNum = parseInt(classNumInput.value);
        const studentNum = parseInt(studentNumInput.value);
        const studentName = studentNameInput.value.trim();

        try {
            const response = await fetch('/api/submissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId,
                    grade,
                    classNum,
                    studentNum,
                    studentName,
                    answers
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '제출 실패');
            }

            // 결과 표시
            showResult(data);
        } catch (error) {
            console.error('제출 오류:', error);
            alert('제출 중 오류가 발생했습니다: ' + error.message);
            isSubmitting = false; // 에러 발생 시 다시 제출 가능하도록
        }
    }

    // 결과 표시
    function showResult(data) {
        testScreen.classList.remove('active');
        resultScreen.classList.add('active');

        const scorePercent = Math.round((data.score / data.total) * 100);
        resultScore.textContent = `${scorePercent}점`;

        resultDetails.innerHTML = '';

        data.answers.forEach(answer => {
            const item = document.createElement('div');
            item.className = `result-item ${answer.is_correct ? 'correct' : 'wrong'}`;

            const number = document.createElement('div');
            number.className = 'result-item-number';
            number.textContent = `${answer.sentence_number}번 ${answer.is_correct ? '✓ 정답' : '✗ 오답'}`;

            const yourAnswer = document.createElement('div');
            yourAnswer.className = 'result-item-text';
            yourAnswer.innerHTML = `<strong>내 답:</strong> ${answer.student_answer || '(미입력)'}`;

            const correctAnswer = document.createElement('div');
            correctAnswer.className = 'result-item-text';
            correctAnswer.innerHTML = `<strong>정답:</strong> ${answer.correct_answer}`;

            item.appendChild(number);
            item.appendChild(yourAnswer);
            if (!answer.is_correct) {
                item.appendChild(correctAnswer);
            }

            resultDetails.appendChild(item);
        });
    }
});
