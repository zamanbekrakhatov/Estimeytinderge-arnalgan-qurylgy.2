const startStopBtn = document.getElementById('startStopBtn');
const outputTextDiv = document.getElementById('output-text');
const statusText = document.getElementById('status-text');
const waveformCanvas = document.getElementById('waveformCanvas');
const langKzBtn = document.getElementById('lang-kz');
const langRuBtn = document.getElementById('lang-ru');
const recordingIndicator = document.querySelector('.recording-indicator');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentLanguage = 'kk-KZ'; // Default to Kazakh

// Waveform visualization setup
const canvasCtx = waveformCanvas.getContext('2d');
let audioContext;
let analyser;
let source;
let animationFrameId;

// --- Language Switching ---
langKzBtn.addEventListener('click', () => {
    currentLanguage = 'kk-KZ';
    langKzBtn.classList.add('active');
    langRuBtn.classList.remove('active');
    document.documentElement.lang = 'kk'; // Set HTML lang attribute
    updateTexts('kk');
});

langRuBtn.addEventListener('click', () => {
    currentLanguage = 'ru-RU';
    langRuBtn.classList.add('active');
    langKzBtn.classList.remove('active');
    document.documentElement.lang = 'ru'; // Set HTML lang attribute
    updateTexts('ru');
});

function updateTexts(lang) {
    const texts = {
        'kk': {
            'h1': 'Дыбысты мәтінге айналдыру',
            'status_initial': 'Микрофонды қосу үшін басыңыз...',
            'status_recording': 'Жазылуда...',
            'output_initial': 'Мәтін осында пайда болады...',
            'start_btn': 'Бастау',
            'stop_btn': 'Тоқтату'
        },
        'ru': {
            'h1': 'Преобразование речи в текст',
            'status_initial': 'Нажмите, чтобы включить микрофон...',
            'status_recording': 'Запись...',
            'output_initial': 'Текст появится здесь...',
            'start_btn': 'Начать',
            'stop_btn': 'Остановить'
        }
    };
    document.querySelector('h1').textContent = texts[lang].h1;
    statusText.textContent = isRecording ? texts[lang].status_recording : texts[lang].status_initial;
    if (outputTextDiv.textContent.includes('Мәтін осында пайда болады...') || outputTextDiv.textContent.includes('Текст появится здесь...')) {
        outputTextDiv.textContent = texts[lang].output_initial;
    }
    startStopBtn.querySelector('.text').textContent = isRecording ? texts[lang].stop_btn : texts[lang].start_btn;
}

// --- Waveform Visualization ---
function visualize() {
    canvasCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height); // Clear the canvas

    const bufferLength = analyser.frequencyBinData.length;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const barWidth = (waveformCanvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 2; // Adjust height for better visualization

        canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
        canvasCtx.fillRect(x, waveformCanvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }

    animationFrameId = requestAnimationFrame(visualize);
}

// --- Start/Stop Recording ---
startStopBtn.addEventListener('click', async () => {
    if (!isRecording) {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256; // Adjust for smoother visualization

            // Set up MediaRecorder
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                audioChunks = []; // Clear for next recording

                // Send audio to backend
                const formData = new FormData();
                formData.append('audio', audioBlob, 'audio.wav');
                formData.append('lang', currentLanguage);

                statusText.textContent = currentLanguage === 'kk-KZ' ? 'Танылуда...' : 'Распознавание...';

                try {
                    const response = await fetch('/transcribe', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();
                    let transcribedText = result.transcribed_text;

                    // Highlight dangerous words
                    const dangerousWordsKz = ['қауіп', 'өрт', 'дабыл', 'апат', 'жарылыс'];
                    const dangerousWordsRu = ['опасность', 'пожар', 'тревога', 'авария', 'взрыв'];
                    const dangerousWords = currentLanguage === 'kk-KZ' ? dangerousWordsKz : dangerousWordsRu;

                    dangerousWords.forEach(word => {
                        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
                        transcribedText = transcribedText.replace(regex, `<span class="highlight">$&</span>`);
                    });

                    outputTextDiv.innerHTML = transcribedText || (currentLanguage === 'kk-KZ' ? 'Ештеңе танылмады.' : 'Ничего не распознано.');
                } catch (error) {
                    console.error('Transcription error:', error);
                    outputTextDiv.innerHTML = currentLanguage === 'kk-KZ' ? 'Дыбысты тану кезінде қате орын алды.' : 'Произошла ошибка при распознавании речи.';
                }
                statusText.textContent = currentLanguage === 'kk-KZ' ? 'Микрофонды қосу үшін басыңыз...' : 'Нажмите, чтобы включить микрофон...';
                recordingIndicator.classList.remove('recording');
                startStopBtn.classList.remove('recording');
                startStopBtn.querySelector('.text').textContent = currentLanguage === 'kk-KZ' ? 'Бастау' : 'Начать';

                // Stop media stream tracks
                stream.getTracks().forEach(track => track.stop());
                if (audioContext) audioContext.close();
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
            };

            mediaRecorder.start();
            isRecording = true;
            statusText.textContent = currentLanguage === 'kk-KZ' ? 'Жазылуда...' : 'Запись...';
            startStopBtn.classList.add('recording');
            recordingIndicator.classList.add('recording');
            startStopBtn.querySelector('.text').textContent = currentLanguage === 'kk-KZ' ? 'Тоқтату' : 'Остановить';
            visualize(); // Start waveform visualization

        } catch (err) {
            console.error('Error accessing microphone:', err);
            statusText.textContent = currentLanguage === 'kk-KZ' ? 'Микрофонға рұқсат қажет.' : 'Требуется доступ к микрофону.';
        }
    } else {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        // The onstop event handler will handle post-processing
    }
});

// Initial text update
updateTexts(document.documentElement.lang === 'ru' ? 'ru' : 'kk');
