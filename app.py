from flask import Flask, request, jsonify
import speech_recognition as sr
import os
from pydub import AudioSegment
from pydub.silence import split_on_silence

app = Flask(__name__)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    lang = request.form.get('lang', 'kk-KZ') # Get language from frontend

    # Save the received audio file temporarily
    audio_path = "temp_audio.wav"
    audio_file.save(audio_path)

    r = sr.Recognizer()
    transcribed_text = ""

    try:
        # Load audio using pydub
        audio = AudioSegment.from_wav(audio_path)

        # Split audio on silence for better accuracy (optional)
        # You might need to tune these parameters
        chunks = split_on_silence(audio,
                                  min_silence_len=500, # ms
                                  silence_thresh=-40,  # dBFS
                                  keep_silence=100)

        # Process each chunk
        for i, chunk in enumerate(chunks):
            chunk_filename = f"chunk{i}.wav"
            chunk.export(chunk_filename, format="wav")
            with sr.AudioFile(chunk_filename) as source:
                audio_listened = r.record(source)
                try:
                    # Use Google Web Speech API for transcription
                    # You can specify language codes like 'kk-KZ' for Kazakh, 'ru-RU' for Russian
                    text = r.recognize_google(audio_listened, language=lang)
                    transcribed_text += text + " "
                except sr.UnknownValueError:
                    print(f"Could not understand audio in chunk {i}")
                except sr.RequestError as e:
                    print(f"Could not request results from Google Speech Recognition service; {e}")
            os.remove(chunk_filename) # Clean up chunk file

    except Exception as e:
        print(f"Error processing audio: {e}")
        return jsonify({'error': f'Failed to process audio: {e}'}), 500
    finally:
        os.remove(audio_path) # Clean up original audio file

    return jsonify({'transcribed_text': transcribed_text.strip()})

if __name__ == '__main__':
    # Make sure 'static' directory exists for Flask to serve static files
    if not os.path.exists('static'):
        os.makedirs('static')
    # Move your HTML, CSS, JS files into a 'static' folder
    # For simplicity, we assume they are in the same directory as app.py
    # In a real project, you would structure them properly:
    # project_root/
    # ├── app.py
    # └── static/
    #     ├── index.html
    #     ├── style.css
    #     └── script.js
    
    # Copy files to 'static' if they are in the current directory
    current_dir_files = ['index.html', 'style.css', 'script.js']
    for filename in current_dir_files:
        if os.path.exists(filename) and not os.path.exists(os.path.join('static', filename)):
            os.rename(filename, os.path.join('static', filename))

    app.run(debug=True, host='0.0.0.0', port=5000)
