const startStopBtn = document.getElementById('startStopBtn');
const transcript = document.getElementById('transcript');
const statusDiv = document.getElementById('status');

let isListening = false;
let socket;
let mediaStream;

// Replace with your Deepgram API key
const DEEPGRAM_API_KEY = '6307627d8ed71d885ab1ddd9f4ee746838cecac8';

startStopBtn.addEventListener('click', toggleListening);

async function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        await startListening();
    }
}

async function startListening() {
    try {
        statusDiv.textContent = 'Status: Starting...';
        
        // Get microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create a WebSocket connection to Deepgram
        socket = new WebSocket('wss://api.deepgram.com/v1/listen', [
            'token', 
            DEEPGRAM_API_KEY
        ]);
        
        socket.onopen = () => {
            isListening = true;
            startStopBtn.textContent = 'Stop Listening';
            statusDiv.textContent = 'Status: Listening...';
            
            // Set up audio context and processor
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(mediaStream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            processor.onaudioprocess = (e) => {
                if (socket.readyState === WebSocket.OPEN) {
                    const audioData = e.inputBuffer.getChannelData(0);
                    const raw = convertFloat32ToInt16(audioData);
                    socket.send(raw);
                }
            };
        };
        
        socket.onmessage = (message) => {
            const data = JSON.parse(message.data);
            if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
                const text = data.channel.alternatives[0].transcript;
                if (text) {
                    transcript.value += ' ' + text;
                }
            }
        };
        
        socket.onclose = () => {
            if (isListening) {
                statusDiv.textContent = 'Status: Connection closed';
                stopListening();
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusDiv.textContent = 'Status: Error occurred';
            stopListening();
        };
        
    } catch (error) {
        console.error('Error:', error);
        statusDiv.textContent = 'Status: Error - ' + error.message;
        stopListening();
    }
}

function stopListening() {
    isListening = false;
    startStopBtn.textContent = 'Start Listening';
    statusDiv.textContent = 'Status: Ready';
    
    if (socket) {
        socket.close();
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
}

function convertFloat32ToInt16(buffer) {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        buf[i] = Math.min(1, buffer[i]) * 0x7FFF;
    }
    return buf.buffer;
}
