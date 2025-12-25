document.addEventListener('DOMContentLoaded', async () => {
    const dashboardTitle = document.getElementById('dashboardTitle');
    const loading = document.getElementById('loading');
    const submissionsTable = document.getElementById('submissionsTable');
    const submissionsBody = document.getElementById('submissionsBody');
    const emptyState = document.getElementById('emptyState');

    const urlParams = new URLSearchParams(window.location.search);
    const problemSetId = urlParams.get('id');

    // 제출 결과 불러오기
    async function loadSubmissions() {
        loading.style.display = 'block';
        submissionsTable.style.display = 'none';
        emptyState.style.display = 'none';

        try {
            const response = await fetch(`/api/submissions/${problemSetId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '제출 결과를 불러오는데 실패했습니다.');
            }

            if (!data.submissions || data.submissions.length === 0) {
                emptyState.style.display = 'block';
            } else {
                displaySubmissions(data.submissions);
                submissionsTable.style.display = 'block';
            }
        } catch (error) {
            console.error('불러오기 오류:', error);
            alert('제출 결과를 불러오는 중 오류가 발생했습니다: ' + error.message);
        } finally {
            loading.style.display = 'none';
        }
    }

    // 제출 결과 표시
    function displaySubmissions(submissions) {
        submissionsBody.innerHTML = '';

        submissions.forEach(sub => {
            const tr = document.createElement('tr');

            const scorePercent = Math.round((sub.score / sub.total) * 100);
            let scoreClass = 'score-low';
            if (scorePercent === 100) scoreClass = 'score-perfect';
            else if (scorePercent >= 80) scoreClass = 'score-good';
            else if (scorePercent >= 60) scoreClass = 'score-average';

            const date = new Date(sub.submitted_at);
            const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
            const dateStr = `${kstDate.getFullYear()}-${String(kstDate.getMonth() + 1).padStart(2, '0')}-${String(kstDate.getDate()).padStart(2, '0')} ${String(kstDate.getHours()).padStart(2, '0')}:${String(kstDate.getMinutes()).padStart(2, '0')}`;

            tr.innerHTML = `
                <td>${sub.grade}</td>
                <td>${sub.class_num}</td>
                <td>${sub.student_num}</td>
                <td>${sub.student_name}</td>
                <td><span class="score-badge ${scoreClass}">${sub.score} / ${sub.total} (${scorePercent}점)</span></td>
                <td>${dateStr}</td>
                <td><button class="detail-btn" onclick="showDetail(${sub.submission_id}, '${sub.student_name}')">상세보기</button></td>
            `;

            submissionsBody.appendChild(tr);
        });
    }

    // 답안 상세 보기
    window.showDetail = async function(submissionId, studentName) {
        const detailModal = document.getElementById('detailModal');
        const detailModalTitle = document.getElementById('detailModalTitle');
        const detailContent = document.getElementById('detailContent');

        detailModalTitle.textContent = `${studentName} 학생 답안 상세`;
        detailContent.innerHTML = '<div class="loading"><div class="spinner"></div><p>불러오는 중...</p></div>';
        detailModal.classList.add('active');

        try {
            const response = await fetch(`/api/submissions/detail/${submissionId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '답안 상세를 불러오는데 실패했습니다.');
            }

            // 답안 상세 표시
            detailContent.innerHTML = '';

            data.answers.forEach(answer => {
                const item = document.createElement('div');
                item.className = `detail-item ${answer.is_correct ? 'correct' : 'wrong'}`;

                const number = document.createElement('div');
                number.className = 'detail-item-number';
                number.textContent = `${answer.sentence_number}번 ${answer.is_correct ? '✓ 정답' : '✗ 오답'}`;

                const correctAnswer = document.createElement('div');
                correctAnswer.className = 'detail-item-text';
                correctAnswer.innerHTML = `<strong>정답:</strong> ${answer.correct_answer || '정보 없음'}`;

                const studentAnswer = document.createElement('div');
                studentAnswer.className = 'detail-item-text';
                studentAnswer.innerHTML = `<strong>학생 답:</strong> ${answer.student_answer || '(미입력)'}`;

                item.appendChild(number);
                item.appendChild(correctAnswer);
                item.appendChild(studentAnswer);

                detailContent.appendChild(item);
            });
        } catch (error) {
            console.error('답안 상세 조회 오류:', error);
            detailContent.innerHTML = `<p style="color: #dc3545;">오류: ${error.message}</p>`;
        }
    };

    // 모달 닫기
    window.closeDetailModal = function() {
        const detailModal = document.getElementById('detailModal');
        detailModal.classList.remove('active');
    };

    // 페이지 로드 시 제출 결과 불러오기
    loadSubmissions();

    // 주기적으로 새로고침 (30초마다)
    setInterval(loadSubmissions, 30000);
});
