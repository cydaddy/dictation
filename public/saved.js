document.addEventListener('DOMContentLoaded', () => {
    const loadingDiv = document.getElementById('loading');
    const problemSetsList = document.getElementById('problemSetsList');
    const emptyState = document.getElementById('emptyState');
    const backBtn = document.getElementById('backBtn');
    const createBtn = document.getElementById('createBtn');

    // 모달 관련
    const detailModal = document.getElementById('detailModal');
    const detailTitle = document.getElementById('detailTitle');
    const detailSentencesList = document.getElementById('detailSentencesList');
    const modalClose = document.querySelector('.modal-close');
    const closeDetailBtn = document.getElementById('closeDetailBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const startDictationBtn = document.getElementById('startDictationBtn');
    const createStudentLinkBtn = document.getElementById('createStudentLinkBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const readCountInput = document.getElementById('readCount');
    const playbackSpeedInput = document.getElementById('playbackSpeed');
    const speedValueDisplay = document.getElementById('speedValue');

    let currentProblemSetId = null;
    let audioQueue = {}; // 문장별 오디오 재생 큐
    let currentAudio = null; // 현재 재생 중인 오디오
    let ttsPollingInterval = null; // TTS 상태 폴링 인터벌

    // 뒤로 가기 버튼
    backBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    createBtn.addEventListener('click', () => {
        window.location.href = '/';
    });

    // 재생 속도 슬라이더 업데이트
    playbackSpeedInput.addEventListener('input', (e) => {
        const speed = parseFloat(e.target.value);
        speedValueDisplay.textContent = `${speed.toFixed(2)}x`;
    });

    // 문제 세트 목록 불러오기
    async function loadProblemSets() {
        loadingDiv.style.display = 'block';
        problemSetsList.innerHTML = '';
        emptyState.style.display = 'none';

        try {
            const response = await fetch('/api/problem-sets');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '목록을 불러오는데 실패했습니다.');
            }

            if (!data.problemSets || data.problemSets.length === 0) {
                emptyState.style.display = 'block';
            } else {
                displayProblemSets(data.problemSets);
            }
        } catch (error) {
            console.error('불러오기 오류:', error);
            alert('문제 세트를 불러오는 중 오류가 발생했습니다: ' + error.message);
        } finally {
            loadingDiv.style.display = 'none';
        }
    }

    // 문제 세트 목록 표시
    function displayProblemSets(problemSets) {
        problemSetsList.innerHTML = '';

        problemSets.forEach(set => {
            const card = document.createElement('div');
            card.className = 'problem-set-card';
            card.dataset.id = set.id;

            const title = document.createElement('div');
            title.className = 'problem-set-title';
            title.textContent = set.title;

            const meta = document.createElement('div');
            meta.className = 'problem-set-meta';

            const date = new Date(set.created_at);
            // 한국 시간으로 변환 (UTC+9)
            const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
            const dateStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth() + 1).padStart(2, '0')}-${String(kstDate.getDate()).padStart(2, '0')} ${String(kstDate.getHours()).padStart(2, '0')}:${String(kstDate.getMinutes()).padStart(2, '0')}`;

            meta.innerHTML = `
                <span>📅 ${dateStr}</span>
                <span>📝 ${set.sentence_count}개 문항</span>
            `;

            // TTS 상태 배지
            const ttsBadge = document.createElement('span');
            ttsBadge.className = 'tts-status-badge';
            ttsBadge.id = `tts-badge-${set.id}`;

            // 오디오 파일이 이미 있으면 완료 표시
            if (set.has_audio) {
                ttsBadge.className = 'tts-status-badge complete';
                ttsBadge.textContent = '✓ 읽어주기 생성 완료';
                ttsBadge.style.display = 'inline-flex';
            } else {
                ttsBadge.style.display = 'none';
            }
            meta.appendChild(ttsBadge);

            // 액션 버튼 컨테이너
            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'card-btn card-btn-edit';
            editBtn.textContent = '수정';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editProblemSetTitle(set.id, set.title);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'card-btn card-btn-delete';
            deleteBtn.textContent = '삭제';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteProblemSet(set.id);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            card.appendChild(title);
            card.appendChild(meta);
            card.appendChild(actions);

            card.addEventListener('click', () => {
                loadProblemSetDetail(set.id);
            });

            problemSetsList.appendChild(card);
        });

        // TTS 상태 폴링 시작
        startTtsStatusPolling();
    }

    // TTS 상태 폴링 시작
    function startTtsStatusPolling() {
        // 기존 인터벌 정리
        if (ttsPollingInterval) {
            clearInterval(ttsPollingInterval);
        }

        // 즉시 한번 실행
        updateTtsStatuses();

        // 2초마다 폴링
        ttsPollingInterval = setInterval(updateTtsStatuses, 2000);
    }

    // TTS 상태 폴링 중지
    function stopTtsStatusPolling() {
        if (ttsPollingInterval) {
            clearInterval(ttsPollingInterval);
            ttsPollingInterval = null;
        }
    }

    // TTS 상태 업데이트
    async function updateTtsStatuses() {
        try {
            const response = await fetch('/api/tts-status');
            const data = await response.json();

            if (!response.ok) return;

            const statuses = data.statuses || {};

            // 모든 배지 숨기기
            document.querySelectorAll('.tts-status-badge').forEach(badge => {
                const id = badge.id.replace('tts-badge-', '');
                const status = statuses[id];

                if (status) {
                    badge.style.display = 'inline-flex';

                    if (status.status === 'generating') {
                        badge.className = 'tts-status-badge generating';
                        badge.innerHTML = `<span class="tts-spinner"></span>읽어주기 생성 중 (${status.current}/${status.total})`;
                    } else if (status.status === 'complete') {
                        badge.className = 'tts-status-badge complete';
                        badge.textContent = '✓ 읽어주기 생성 완료';
                    } else if (status.status === 'error') {
                        badge.className = 'tts-status-badge error';
                        badge.textContent = '⚠ 생성 오류';
                    }
                } else {
                    // 진행 중인 상태가 아니면, 이미 완료된 배지는 유지하고 그 외에는 숨김
                    if (!badge.classList.contains('complete')) {
                        badge.style.display = 'none';
                    }
                }
            });

            // 진행 중인 TTS가 없으면 폴링 중지
            const hasGenerating = Object.values(statuses).some(s => s.status === 'generating');
            if (!hasGenerating && ttsPollingInterval) {
                // 완료 메시지 표시 후 폴링 중지
                setTimeout(() => {
                    stopTtsStatusPolling();
                }, 5000);
            }
        } catch (error) {
            console.error('TTS 상태 조회 오류:', error);
        }
    }

    // 문제 세트 상세 불러오기
    async function loadProblemSetDetail(id) {
        try {
            const response = await fetch(`/api/problem-sets/${id}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '상세 정보를 불러오는데 실패했습니다.');
            }

            currentProblemSetId = id;
            displayProblemSetDetail(data);
        } catch (error) {
            console.error('상세 불러오기 오류:', error);
            alert('문제 세트 상세 정보를 불러오는 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 오디오 재생 함수
    async function playAudioFile(audioUrl) {
        return new Promise((resolve, reject) => {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            const audio = new Audio(audioUrl);
            currentAudio = audio;

            // 재생 속도 조절 - 슬라이더 값 사용
            const speed = parseFloat(playbackSpeedInput.value);
            audio.playbackRate = speed;

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

    // 문장 읽기 (큐에 추가)
    async function playSentence(sentenceNum, button) {
        const audioUrl = `/audio/problem_${currentProblemSetId}/sentence_${sentenceNum}.mp3`;

        // 큐가 없으면 초기화
        if (!audioQueue[sentenceNum]) {
            audioQueue[sentenceNum] = { queue: [], isPlaying: false };
        }

        const queue = audioQueue[sentenceNum];

        // 큐에 추가
        queue.queue.push(audioUrl);

        // 버튼 텍스트 업데이트 (disabled 제거)
        button.textContent = `읽기 (${queue.queue.length})`;

        // 이미 재생 중이면 리턴 (큐에만 추가)
        if (queue.isPlaying) {
            return;
        }

        // 큐 재생 시작
        queue.isPlaying = true;

        while (queue.queue.length > 0) {
            queue.queue.shift(); // 큐에서 제거
            button.textContent = queue.queue.length > 0 ? `읽기 (${queue.queue.length})` : '읽기';

            try {
                await playAudioFile(audioUrl);
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
            } catch (error) {
                console.error('오디오 재생 오류:', error);
                alert('음성 파일을 재생할 수 없습니다. 파일이 아직 생성 중일 수 있습니다.');
                break;
            }
        }

        queue.isPlaying = false;
        button.textContent = '읽기';
    }

    // 문제 세트 상세 표시
    function displayProblemSetDetail(data) {
        detailTitle.textContent = data.title;
        detailSentencesList.innerHTML = '';

        // 오디오 큐 초기화
        audioQueue = {};
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        data.sentences.forEach((sentence, index) => {
            const item = document.createElement('div');
            item.className = 'detail-sentence-item';

            const number = document.createElement('span');
            number.className = 'detail-sentence-number';
            number.textContent = `${index + 1}번`;

            const text = document.createElement('div');
            text.className = 'detail-sentence-text';
            text.textContent = sentence.sentence_text;

            // 버튼 컨테이너
            const actions = document.createElement('div');
            actions.className = 'sentence-actions';

            // 읽기 버튼
            const playBtn = document.createElement('button');
            playBtn.className = 'sentence-play-btn';
            playBtn.textContent = '읽기';
            playBtn.addEventListener('click', () => {
                playSentence(sentence.sentence_number, playBtn);
            });

            // 수정 버튼
            const editBtn = document.createElement('button');
            editBtn.className = 'sentence-edit-btn';
            editBtn.textContent = '수정';
            editBtn.addEventListener('click', () => {
                editSentence(sentence.id, sentence.sentence_text, text);
            });

            actions.appendChild(playBtn);
            actions.appendChild(editBtn);

            item.appendChild(number);
            item.appendChild(text);
            item.appendChild(actions);
            detailSentencesList.appendChild(item);
        });

        detailModal.classList.add('active');
    }

    // 문장 수정 함수
    async function editSentence(sentenceId, currentText, textElement) {
        const newText = prompt('문장을 수정하세요:', currentText);

        if (newText === null || newText.trim() === '') {
            return; // 취소 또는 빈 문장
        }

        if (newText.trim() === currentText) {
            return; // 변경사항 없음
        }

        try {
            const response = await fetch(`/api/sentences/${sentenceId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sentenceText: newText.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '문장 수정에 실패했습니다.');
            }

            alert(data.message);
            textElement.textContent = newText.trim(); // UI 업데이트
        } catch (error) {
            console.error('문장 수정 오류:', error);
            alert('문장 수정 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 모달 닫기
    function closeModal() {
        detailModal.classList.remove('active');
        currentProblemSetId = null;
    }

    modalClose.addEventListener('click', closeModal);
    closeDetailBtn.addEventListener('click', closeModal);

    // 모달 배경 클릭 시 닫기
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            closeModal();
        }
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailModal.classList.contains('active')) {
            closeModal();
        }
    });

    // 제목 수정 함수
    async function editProblemSetTitle(id, currentTitle) {
        const newTitle = prompt('새 제목을 입력하세요:', currentTitle);

        if (newTitle === null || newTitle.trim() === '') {
            return; // 취소 또는 빈 제목
        }

        if (newTitle.trim() === currentTitle) {
            return; // 변경사항 없음
        }

        try {
            const response = await fetch(`/api/problem-sets/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: newTitle.trim() })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '제목 수정에 실패했습니다.');
            }

            alert('제목이 수정되었습니다.');
            loadProblemSets(); // 목록 새로고침
        } catch (error) {
            console.error('제목 수정 오류:', error);
            alert('제목 수정 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 삭제 함수 (카드에서 직접 호출)
    async function deleteProblemSet(id) {
        if (!confirm('이 문제 세트를 삭제하시겠습니까?\n관련된 모든 평가 결과도 함께 삭제됩니다.')) {
            return;
        }

        try {
            const response = await fetch(`/api/problem-sets/${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '삭제에 실패했습니다.');
            }

            alert('문제 세트가 삭제되었습니다.');
            loadProblemSets(); // 목록 새로고침
        } catch (error) {
            console.error('삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // 삭제 버튼 (모달 내부)
    deleteBtn.addEventListener('click', async () => {
        if (!currentProblemSetId) return;

        if (!confirm('이 문제 세트를 삭제하시겠습니까?\n관련된 모든 평가 결과도 함께 삭제됩니다.')) {
            return;
        }

        try {
            const response = await fetch(`/api/problem-sets/${currentProblemSetId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '삭제에 실패했습니다.');
            }

            alert('문제 세트가 삭제되었습니다.');
            closeModal();
            loadProblemSets(); // 목록 새로고침
        } catch (error) {
            console.error('삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다: ' + error.message);
        }
    });

    // 전체 읽기 버튼 (출제 준비 - 받아쓰기 출제 페이지로 이동)
    startDictationBtn.addEventListener('click', () => {
        if (!currentProblemSetId) return;

        const readCount = parseInt(readCountInput.value) || 5;
        const playbackSpeed = parseFloat(playbackSpeedInput.value);

        // 받아쓰기 출제 페이지로 이동 (재생 속도 포함)
        window.location.href = `/dictation.html?id=${currentProblemSetId}&count=${readCount}&speed=${playbackSpeed}`;
    });

    // 학생 링크 생성 버튼
    createStudentLinkBtn.addEventListener('click', async () => {
        if (!currentProblemSetId) return;

        const readCount = parseInt(readCountInput.value) || 5;
        const playbackSpeed = parseFloat(playbackSpeedInput.value);

        try {
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    problemSetId: currentProblemSetId,
                    readCount
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '링크 생성 실패');
            }

            const studentUrl = `${window.location.origin}/student.html?session=${data.sessionId}&speed=${playbackSpeed}`;
            const reusedMsg = data.reused ? ' (기존 링크 재사용)' : '';

            // 링크 복사 (보안된 환경에서만 clipboard API 사용 가능)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(studentUrl).then(() => {
                    alert(`학생 링크가 클립보드에 복사되었습니다!${reusedMsg}\n\n${studentUrl}`);
                }).catch(() => {
                    prompt('학생 링크 (Ctrl+C로 복사):', studentUrl);
                });
            } else {
                // HTTP 환경이나 비보안 환경에서는 prompt 사용
                prompt('학생 링크 (Ctrl+C로 복사):', studentUrl);
            }
        } catch (error) {
            console.error('링크 생성 오류:', error);
            alert('링크 생성 중 오류가 발생했습니다: ' + error.message);
        }
    });

    // 대시보드 버튼
    dashboardBtn.addEventListener('click', () => {
        if (!currentProblemSetId) return;

        window.location.href = `/dashboard.html?id=${currentProblemSetId}`;
    });

    // 페이지 로드 시 목록 불러오기
    loadProblemSets();
});
