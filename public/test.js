document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const elements = {
        container: document.querySelector('.test-container'),
        problemNumber: document.getElementById('problemNumber'),
        phaseIndicator: document.getElementById('phaseIndicator'),
        answerInput: document.getElementById('answerInput'),
        audioControls: document.getElementById('audioControls'),
        playBtn: document.getElementById('playBtn'),
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        submitBtn: document.getElementById('submitBtn'),
        reviewModal: document.getElementById('reviewModal'),
        startReviewBtn: document.getElementById('startReviewBtn'),
        resultScreen: document.getElementById('resultScreen'),
        finalScore: document.getElementById('finalScore'),
        resultList: document.getElementById('resultList')
    };

    // State
    const state = {
        session: null,
        sentences: [],
        currentIndex: 0,
        answers: {}, // { sentence_number: "text" }
        phase: 1, // 1: Dictation, 2: Review
        currentAudio: null,
        userInfo: {}
    };

    // 1. Initialize
    init();

    async function init() {
        // Parse URL params
        const urlParams = new URLSearchParams(window.location.search);
        state.userInfo = {
            sessionId: urlParams.get('session'),
            grade: parseInt(urlParams.get('grade')),
            classNum: parseInt(urlParams.get('class')),
            studentNum: parseInt(urlParams.get('num')),
            studentName: decodeURIComponent(urlParams.get('name') || ''),
            playbackSpeed: parseFloat(urlParams.get('speed')) || 1.0
        };

        if (!state.userInfo.sessionId) {
            alert('잘못된 접근입니다.');
            window.location.href = '/';
            return;
        }

        // Load Session Data
        try {
            const response = await fetch(`/api/sessions/${state.userInfo.sessionId}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || '세션 로드 실패');

            state.session = data.session;
            state.sentences = data.sentences;

            // Start Test
            loadProblem(0);

            // Event Listeners
            setupEventListeners();
        } catch (error) {
            console.error('Initialization error:', error);
            alert('시험 데이터를 불러오는 중 오류가 발생했습니다.');
        }
    }

    // 2. Core Logic

    function loadProblem(index) {
        if (index < 0 || index >= state.sentences.length) return;

        // Save current input before moving
        saveCurrentAnswer();

        state.currentIndex = index;
        const problem = state.sentences[index];

        // Update UI
        elements.problemNumber.textContent = `제 ${problem.sentence_number} 번`;

        // Restore previous answer if exists
        elements.answerInput.value = state.answers[problem.sentence_number] || '';
        elements.answerInput.focus();

        // Audio Handling - 자동재생 없음
        // 1단계: 선생님이 직접 읽어줌
        // 2단계: 학생이 "다시 듣기" 버튼으로 직접 재생

        // Update Navigation Buttons
        updateNavButtons();
    }

    function saveCurrentAnswer() {
        if (state.currentIndex >= 0 && state.currentIndex < state.sentences.length) {
            const problem = state.sentences[state.currentIndex];
            const val = elements.answerInput.value.trim();
            state.answers[problem.sentence_number] = val;
        }
    }

    function updateNavButtons() {
        // Previous Button (use 'invisible' to maintain layout)
        if (state.currentIndex > 0) {
            elements.prevBtn.classList.remove('invisible');
        } else {
            elements.prevBtn.classList.add('invisible');
        }

        // Next/Submit Button
        if (state.currentIndex === state.sentences.length - 1) {
            if (state.phase === 1) {
                elements.nextBtn.classList.remove('hidden'); // Last question of phase 1 -> leads to modal
                elements.nextBtn.textContent = '다음 단계로';
                elements.submitBtn.classList.add('hidden');
            } else {
                elements.nextBtn.classList.add('hidden');
                elements.submitBtn.classList.remove('hidden');
            }
        } else {
            elements.nextBtn.classList.remove('hidden');
            elements.nextBtn.textContent = '다음';
            elements.submitBtn.classList.add('hidden');
        }
    }

    function playAudio(sentenceNum) {
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio = null;
        }

        const problemSetId = state.session.problem_set_id;
        // Construct audio path based on server structure (problem_X/sentence_Y.mp3)
        const audioPath = `/audio/problem_${problemSetId}/sentence_${sentenceNum}.mp3`;

        console.log('Playing audio:', audioPath);
        const audio = new Audio(audioPath);
        audio.playbackRate = state.userInfo.playbackSpeed;

        audio.play().catch(e => console.error("Audio play error:", e));
        state.currentAudio = audio;
    }

    // 3. Event Listeners
    function setupEventListeners() {
        // Input Enter Key
        elements.answerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleNext();
            }
        });

        // Navigation
        elements.prevBtn.addEventListener('click', () => {
            loadProblem(state.currentIndex - 1);
        });

        elements.nextBtn.addEventListener('click', handleNext);

        // Phase 1 -> Phase 2 Transition
        elements.startReviewBtn.addEventListener('click', () => {
            elements.reviewModal.classList.remove('active');
            state.phase = 2;
            elements.phaseIndicator.textContent = '2단계: 따로 듣기';
            elements.audioControls.style.display = 'block'; // Show replay button

            // Go back to first problem
            loadProblem(0);
        });

        // Audio Replay (Only in Phase 2)
        elements.playBtn.addEventListener('click', () => {
            const problem = state.sentences[state.currentIndex];
            playAudio(problem.sentence_number);
        });

        // Submit
        elements.submitBtn.addEventListener('click', handleSubmit);
    }

    function handleNext() {
        saveCurrentAnswer(); // Ensure saving before logic

        if (state.currentIndex < state.sentences.length - 1) {
            loadProblem(state.currentIndex + 1);
        } else {
            // Last question
            if (state.phase === 1) {
                // Show Review Modal
                elements.reviewModal.classList.add('active');
            } else {
                // Already in Phase 2, ready to submit?
                // Logic handled by submitBtn visibility, but if Enter is pressed on last Q of Phase 2:
                handleSubmit();
            }
        }
    }

    async function handleSubmit() {
        if (!confirm('시험을 제출하시겠습니까?')) return;

        saveCurrentAnswer();

        try {
            const response = await fetch('/api/submissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: state.userInfo.sessionId,
                    grade: state.userInfo.grade,
                    classNum: state.userInfo.classNum,
                    studentNum: state.userInfo.studentNum,
                    studentName: state.userInfo.studentName,
                    answers: state.answers
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            showResults(result);

        } catch (error) {
            console.error('Submission error:', error);
            alert('제출 중 오류가 발생했습니다.');
        }
    }

    function showResults(data) {
        elements.container.style.display = 'none';
        elements.resultScreen.classList.remove('hidden');

        // 점수를 퍼센트로 계산 (score는 맞은 개수, total은 전체 개수)
        const scorePercent = Math.round((data.score / data.total) * 100);
        elements.finalScore.textContent = scorePercent;

        elements.resultList.innerHTML = '';

        // data.answers는 배열로 각 문제의 정답/학생답안/정오여부 포함
        if (data.answers && data.answers.length > 0) {
            data.answers.forEach(answer => {
                const resultItem = document.createElement('div');
                resultItem.className = `result-item ${answer.is_correct ? 'correct' : 'wrong'}`;

                const isCorrectText = answer.is_correct ? '✓' : '✗';
                const isCorrectClass = answer.is_correct ? 'correct-mark' : 'wrong-mark';

                resultItem.innerHTML = `
                    <div class="result-header">
                        <span class="result-number">${answer.sentence_number}번</span>
                        <span class="${isCorrectClass}">${isCorrectText}</span>
                    </div>
                    <div class="result-answers">
                        <div class="answer-row">
                            <span class="answer-label">정답:</span>
                            <span class="answer-text correct-text">${answer.correct_answer}</span>
                        </div>
                        <div class="answer-row">
                            <span class="answer-label">내 답:</span>
                            <span class="answer-text student-text ${answer.is_correct ? '' : 'wrong-text'}">${answer.student_answer || '(미입력)'}</span>
                        </div>
                    </div>
                `;
                elements.resultList.appendChild(resultItem);
            });
        }
    }
});
