document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    const inputsTextarea = document.getElementById('inputs');
    const additionalRequestsTextarea = document.getElementById('additionalRequests');
    const countInput = document.getElementById('count');
    const gradeSelect = document.getElementById('grade');
    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const sentencesList = document.getElementById('sentencesList');
    const saveBtn = document.getElementById('saveBtn');
    const viewSavedBtn = document.getElementById('viewSavedBtn');

    // 모달 관련
    const saveModal = document.getElementById('saveModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalClose = document.querySelector('.modal-close');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');

    let currentSentences = [];

    // 로컬스토리지에서 문장 개수 불러오기
    const savedCount = localStorage.getItem('sentenceCount');
    if (savedCount) {
        countInput.value = savedCount;
    }

    // 문장 개수 변경 시 로컬스토리지에 저장
    countInput.addEventListener('change', () => {
        localStorage.setItem('sentenceCount', countInput.value);
    });

    generateBtn.addEventListener('click', async () => {
        const inputs = inputsTextarea.value.trim();
        const additionalRequests = additionalRequestsTextarea.value.trim();
        const count = parseInt(countInput.value);
        const grade = parseInt(gradeSelect.value);

        // 입력 검증 - 문장 개수만 확인
        if (!count || count < 1 || count > 20) {
            alert('1~20 사이의 문장 개수를 입력해주세요.');
            countInput.focus();
            return;
        }

        // UI 상태 변경
        generateBtn.disabled = true;
        loadingDiv.style.display = 'block';
        resultsDiv.style.display = 'none';
        sentencesList.innerHTML = '';

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: inputs || '',
                    additionalRequests: additionalRequests,
                    count: count,
                    grade: grade
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '문장 생성에 실패했습니다.');
            }

            // 결과 표시
            currentSentences = data.sentences;
            displayResults(currentSentences);
        } catch (error) {
            console.error('오류:', error);
            alert('문제 생성 중 오류가 발생했습니다: ' + error.message);
        } finally {
            generateBtn.disabled = false;
            loadingDiv.style.display = 'none';
        }
    });

    function displayResults(sentences) {
        sentencesList.innerHTML = '';

        if (!sentences || sentences.length === 0) {
            sentencesList.innerHTML = '<p style="text-align: center; color: #666;">생성된 문장이 없습니다.</p>';
            resultsDiv.style.display = 'block';
            return;
        }

        sentences.forEach((sentence, index) => {
            const sentenceDiv = document.createElement('div');
            sentenceDiv.className = 'sentence-item';
            sentenceDiv.dataset.index = index;

            const numberSpan = document.createElement('span');
            numberSpan.className = 'sentence-number';
            numberSpan.textContent = `${index + 1}번`;

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'sentence-text-input';
            textInput.value = sentence;
            textInput.addEventListener('input', (e) => {
                currentSentences[index] = e.target.value;
            });

            const editBtn = document.createElement('button');
            editBtn.className = 'edit-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = '수정';
            editBtn.addEventListener('click', () => {
                textInput.focus();
            });

            sentenceDiv.appendChild(numberSpan);
            sentenceDiv.appendChild(textInput);
            sentenceDiv.appendChild(editBtn);
            sentencesList.appendChild(sentenceDiv);
        });

        resultsDiv.style.display = 'block';
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 저장 버튼 클릭 - 모달 열기
    saveBtn.addEventListener('click', () => {
        if (!currentSentences || currentSentences.length === 0) {
            alert('저장할 문제가 없습니다.');
            return;
        }

        // 기본 제목 설정
        const today = new Date();
        const defaultTitle = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}에 생성된 문제 세트`;
        modalTitle.value = defaultTitle;

        // 모달 열기
        saveModal.classList.add('active');
        modalTitle.focus();
    });

    // 모달 닫기 함수
    function closeModal() {
        saveModal.classList.remove('active');
        modalTitle.value = '';
    }

    // 모달 닫기 이벤트들
    modalClose.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);

    // 모달 배경 클릭 시 닫기
    saveModal.addEventListener('click', (e) => {
        if (e.target === saveModal) {
            closeModal();
        }
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && saveModal.classList.contains('active')) {
            closeModal();
        }
    });

    // 모달에서 저장 버튼 클릭
    modalSaveBtn.addEventListener('click', async () => {
        const title = modalTitle.value.trim();

        if (!title) {
            alert('제목을 입력해주세요.');
            modalTitle.focus();
            return;
        }

        try {
            modalSaveBtn.disabled = true;
            modalSaveBtn.textContent = '저장 중...';

            const response = await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: title,
                    sentences: currentSentences
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '저장에 실패했습니다.');
            }

            alert('문제 세트가 저장되었습니다!');
            closeModal();
        } catch (error) {
            console.error('저장 오류:', error);
            alert('저장 중 오류가 발생했습니다: ' + error.message);
        } finally {
            modalSaveBtn.disabled = false;
            modalSaveBtn.textContent = '저장';
        }
    });

    // 모달에서 엔터키로 저장
    modalTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            modalSaveBtn.click();
        }
    });

    // 저장된 문제 보기 버튼
    viewSavedBtn.addEventListener('click', () => {
        window.location.href = '/saved.html';
    });

    // 엔터키로 생성 (Ctrl + Enter)
    inputsTextarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            generateBtn.click();
        }
    });
});
