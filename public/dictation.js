document.addEventListener('DOMContentLoaded', () => {
    const readyScreen = document.getElementById('readyScreen');
    const dictationScreen = document.getElementById('dictationScreen');
    const startBtn = document.getElementById('startBtn');
    const problemNumber = document.getElementById('problemNumber');

    // URL에서 파라미터 가져오기
    const urlParams = new URLSearchParams(window.location.search);
    const problemSetId = urlParams.get('id');
    const readCount = parseInt(urlParams.get('count')) || 5;
    const playbackSpeed = parseFloat(urlParams.get('speed')) || 0.8;

    let sentences = [];
    let currentIndex = 0;

    // 문제 세트 불러오기
    async function loadProblemSet() {
        try {
            const response = await fetch(`/api/problem-sets/${problemSetId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '문제를 불러오는데 실패했습니다.');
            }

            sentences = data.sentences;
        } catch (error) {
            console.error('불러오기 오류:', error);
            alert('문제를 불러오는 중 오류가 발생했습니다: ' + error.message);
            window.location.href = '/saved.html';
        }
    }

    // 오디오 파일 재생
    function playAudio(audioUrl) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);

            // 재생 속도 조절 - URL 파라미터 사용
            audio.playbackRate = playbackSpeed;

            audio.onended = resolve;
            audio.onerror = reject;
            audio.play().catch(reject);
        });
    }

    // 현재 문제 읽기
    async function readCurrentProblem() {
        if (currentIndex >= sentences.length) {
            // 모든 문제 완료
            setTimeout(() => {
                window.location.href = '/saved.html';
            }, 2000);
            return;
        }

        const sentence = sentences[currentIndex];
        const problemNum = sentence.sentence_number;

        // 문제 번호 표시
        problemNumber.textContent = `${problemNum}번`;
        problemNumber.style.animation = 'none';
        setTimeout(() => {
            problemNumber.style.animation = 'fadeIn 0.5s ease';
        }, 10);

        try {
            // 번호 + 문장을 지정된 횟수만큼 재생
            const sentenceAudioUrl = `/audio/problem_${problemSetId}/sentence_${problemNum}.mp3`;
            for (let i = 0; i < readCount; i++) {
                await playAudio(sentenceAudioUrl);
                if (i < readCount - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
        } catch (error) {
            console.error('오디오 재생 오류:', error);
            alert('오디오 파일을 재생하는 중 오류가 발생했습니다. 음성 파일이 생성 중일 수 있습니다.');
            window.location.href = '/saved.html';
            return;
        }

        // 다음 문제로
        await new Promise(resolve => setTimeout(resolve, 1500));
        currentIndex++;
        readCurrentProblem();
    }

    // 시작 버튼 클릭
    startBtn.addEventListener('click', () => {
        readyScreen.classList.remove('active');
        dictationScreen.classList.add('active');
        readCurrentProblem();
    });

    // 페이지 로드 시 문제 세트 불러오기
    loadProblemSet();
});
