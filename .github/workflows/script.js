const startStopBtn = document.getElementById('startStopBtn');
const transcript = document.getElementById('transcript');
const statusDiv = document.getElementById('status');

// Configuration
const config = {
    DEEPGRAM_API_KEY: '6307627d8ed71d885ab1ddd9f4ee746838cecac8', // Replace with your key
    KEEPALIVE_INTERVAL: 30000, // Send ping every 30 seconds
    SAMPLE_RATE: 16000, // 16kHz sample rate
    BUFFER_SIZE: 4096 // Buffer size for audio processing
};

let isListening = false;
let socket;
let mediaStream;
let audioContext;
let processor;
let source;
let keepAliveInterval;

// Improved start/stop functionality
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
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: config.SAMPLE_RATE
        });
        
        // Get microphone access with better error handling
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
        
        // Create WebSocket connection with more options
        socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&language=en', [
            'token', 
            config.DEEPGRAM_API_KEY
        ]);
        
        socket.onopen = () => {
            isListening = true;
            startStopBtn.textContent = 'Stop Listening';
            startStopBtn.disabled = false;
            statusDiv.textContent = 'Status: Listening...';
            
            // Set up keepalive
            keepAliveInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'KeepAlive' }));
                }
            }, config.KEEPALIVE_INTERVAL);
            
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
            const data = JSON.parse(message.data);
            if (data.is_final && data.channel?.alternatives?.[0]?.transcript) {
                transcript.value += ' ' + data.channel.alternatives[0].transcript;
                // Auto-scroll to bottom
                transcript.scrollTop = transcript.scrollHeight;
            }
        };
        
        socket.onclose = (event) => {
            if (!event.wasClean) {
                statusDiv.textContent = `Status: Connection lost (${event.code})`;
            }
            stopListening();
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
    statusDiv.textContent = 'Status: Processing final data...';
    startStopBtn.disabled = true;
    
    // Clear keepalive interval
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    // Clean up WebSocket
    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'CloseStream' }));
            await new Promise(resolve => {
                setTimeout(() => {
                    socket.close();
                    resolve();
                }, 500);
            });
        } else {
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
