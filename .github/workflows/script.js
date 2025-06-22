const startStopBtn = document.getElementById('startStopBtn');
const transcript = document.getElementById('transcript');
const statusDiv = document.getElementById('status');

// Configuration
const config = {
    DEEPGRAM_API_KEY: '6307627d8ed71d885ab1ddd9f4ee746838cecac8', // Replace with your key
    SAMPLE_RATE: 16000, // 16kHz sample rate
    BUFFER_SIZE: 4096, // Buffer size for audio processing
    ENDPOINT: 'wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1'
};

let isListening = false;
let socket;
let mediaStream;
let audioContext;
let processor;
let source;

// Initialize
startStopBtn.addEventListener('click', toggleListening);

async function toggleListening() {
    if (isListening) {
        await stopListening();
    } else {
        await startListening();
    }
}

async function startListening() {
    try {
        statusDiv.textContent = 'Status: Initializing...';
        startStopBtn.disabled = true;
        
        // Initialize audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Get microphone access with proper constraints
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                sampleRate: config.SAMPLE_RATE,
                channelCount: 1,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        }).catch(handleMicError);
        
        if (!mediaStream) return;
        
        // Create WebSocket connection with proper parameters
        socket = new WebSocket(`${config.ENDPOINT}&language=en-US`, [
            'token', 
            config.DEEPGRAM_API_KEY
        ]);
        
        socket.onopen = () => {
            isListening = true;
            startStopBtn.textContent = 'Stop Listening';
            startStopBtn.disabled = false;
            statusDiv.textContent = 'Status: Listening - speak now...';
            
            // Audio processing setup
            source = audioContext.createMediaStreamSource(mediaStream);
            processor = audioContext.createScriptProcessor(
                config.BUFFER_SIZE, 
                1, 
                1
            );
            
            processor.onaudioprocess = (e) => {
                if (socket.readyState === WebSocket.OPEN) {
                    const audioData = e.inputBuffer.getChannelData(0);
                    const raw = convertFloat32ToInt16(audioData);
                    socket.send(raw);
                }
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
        };
        
        socket.onmessage = (message) => {
            try {
                const data = JSON.parse(message.data);
                
                // Handle different response types
                if (data.type === 'Results') {
                    const transcriptText = data.channel.alternatives[0].transcript;
                    if (transcriptText && transcriptText.trim() !== '') {
                        transcript.value += transcriptText + ' ';
                        // Auto-scroll to bottom
                        transcript.scrollTop = transcript.scrollHeight;
                    }
                }
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };
        
        socket.onclose = () => {
            if (isListening) {
                statusDiv.textContent = 'Status: Connection closed unexpectedly';
                stopListening();
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            statusDiv.textContent = 'Status: Connection error';
            stopListening();
        };
        
    } catch (error) {
        console.error('Initialization error:', error);
        statusDiv.textContent = 'Status: Error - ' + error.message;
        stopListening();
    }
}

async function stopListening() {
    if (!isListening) return;
    
    isListening = false;
    startStopBtn.textContent = 'Start Listening';
    statusDiv.textContent = 'Status: Stopping...';
    startStopBtn.disabled = true;
    
    // Clean up WebSocket
    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.close();
        }
        socket = null;
    }
    
    // Clean up audio resources
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    
    if (source) {
        source.disconnect();
        source = null;
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
    }
    
    statusDiv.textContent = 'Status: Ready';
    startStopBtn.disabled = false;
}

function handleMicError(error) {
    console.error('Microphone error:', error);
    statusDiv.textContent = 'Status: Microphone access denied';
    startStopBtn.disabled = false;
    return null;
}

function convertFloat32ToInt16(buffer) {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        buf[i] = Math.min(1, buffer[i]) * 0x7FFF;
    }
    return buf.buffer;
}
