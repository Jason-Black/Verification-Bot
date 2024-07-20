// Generate a pseudo-random spreading code
function generateSpreadingCode(length) {
    const code = [];
    for (let i = 0; i < length; i++) {
        code.push(Math.random() < 0.5 ? -1 : 1);
    }
    return code;
}

// Convert data to binary bits
function dataToBits(data) {
    let bits = [];
    for (let i = 0; i < data.length; i++) {
        const byte = data.charCodeAt(i);
        for (let j = 0; j < 8; j++) {
            bits.push((byte >> j) & 1);
        }
    }
    return bits;
}

// Convert binary bits back to data
function bitsToData(bits) {
    let data = '';
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
            byte |= (bits[i + j] << j);
        }
        data += String.fromCharCode(byte);
    }
    return data;
}

// Generate a Hamming (7,4) code for a 4-bit nibble
function hammingEncode(nibble) {
    const dataBits = [(nibble >> 3) & 1, (nibble >> 2) & 1, (nibble >> 1) & 1, nibble & 1];
    const p1 = dataBits[0] ^ dataBits[1] ^ dataBits[3];
    const p2 = dataBits[0] ^ dataBits[2] ^ dataBits[3];
    const p3 = dataBits[1] ^ dataBits[2] ^ dataBits[3];
    return (p1 << 6) | (p2 << 5) | (dataBits[0] << 4) | (p3 << 3) | (dataBits[1] << 2) | (dataBits[2] << 1) | dataBits[3];
}

// Decode a Hamming (7,4) code and correct a single-bit error
function hammingDecode(encodedByte) {
    const bits = [
        (encodedByte >> 6) & 1, (encodedByte >> 5) & 1, (encodedByte >> 4) & 1,
        (encodedByte >> 3) & 1, (encodedByte >> 2) & 1, (encodedByte >> 1) & 1, encodedByte & 1
    ];
    const p1 = bits[0] ^ bits[2] ^ bits[4] ^ bits[6];
    const p2 = bits[1] ^ bits[2] ^ bits[5] ^ bits[6];
    const p3 = bits[3] ^ bits[4] ^ bits[5] ^ bits[6];
    const errorPos = (p3 << 2) | (p2 << 1) | p1;

    if (errorPos !== 0) {
        bits[errorPos - 1] = bits[errorPos - 1] ^ 1; // Correct the error
    }

    return (bits[2] << 3) | (bits[4] << 2) | (bits[5] << 1) | bits[6];
}

// Convert data to Hamming encoded bits
function dataToHammingBits(data) {
    let bits = [];
    for (let i = 0; i < data.length; i++) {
        const byte = data.charCodeAt(i);
        bits.push(hammingEncode((byte >> 4) & 0x0F)); // High nibble
        bits.push(hammingEncode(byte & 0x0F)); // Low nibble
    }
    return bits;
}

// Convert Hamming encoded bits back to data
function hammingBitsToData(bits) {
    let data = '';
    for (let i = 0; i < bits.length; i += 2) {
        const highNibble = hammingDecode(bits[i]);
        const lowNibble = hammingDecode(bits[i + 1]);
        data += String.fromCharCode((highNibble << 4) | lowNibble);
    }
    return data;
}

// Embed data using DSSS, echo hiding, and Hamming codes
function embedDataCombined(audioBuffer, data, fingerprint, delay0, delay1) {
    const audioData = audioBuffer.getChannelData(0);
    const spreadingCode = generateSpreadingCode(audioData.length);
    const dataBits = dataToHammingBits(data + fingerprint); // Use Hamming encoding

    // Spread the data using DSSS
    const spreadData = [];
    for (let i = 0; i < dataBits.length; i++) {
        for (let j = 0; j < spreadingCode.length; j++) {
            spreadData.push(dataBits[i] * spreadingCode[j]);
        }
    }

    // Embed the spread data using echo hiding
    for (let i = 0; i < spreadData.length; i++) {
        const delay = spreadData[i] === 0 ? delay0 : delay1;
        for (let j = 0; j < audioData.length - delay; j++) {
            audioData[j + delay] += audioData[j] * 0.5; // Adjust the echo amplitude as needed
        }
    }

    return audioBuffer;
}

// Extract data using DSSS, echo hiding, and Hamming codes
function extractDataCombined(audioBuffer, dataLength, delay0, delay1) {
    const audioData = audioBuffer.getChannelData(0);
    const spreadingCode = generateSpreadingCode(audioData.length / dataLength);
    const extractedBits = [];

    // Extract the spread data using echo hiding
    const spreadData = [];
    for (let i = 0; i < dataLength; i++) {
        const correlation0 = calculateCorrelation(audioData, delay0);
        const correlation1 = calculateCorrelation(audioData, delay1);
        spreadData.push(correlation1 > correlation0 ? 1 : 0);
    }

    // Despread the data using DSSS
    for (let i = 0; i < spreadData.length; i += spreadingCode.length) {
        let bitSum = 0;
        for (let j = 0; j < spreadingCode.length; j++) {
            bitSum += spreadData[i + j] * spreadingCode[j];
        }
        extractedBits.push(bitSum > 0 ? 1 : 0);
    }

    return hammingBitsToData(extractedBits); // Use Hamming decoding
}

// Calculate correlation for a given delay
function calculateCorrelation(audioData, delay) {
    let sum = 0;
    for (let i = 0; i < audioData.length - delay; i++) {
        sum += audioData[i] * audioData[i + delay];
    }
    return sum;
}

// Handle the embedding process
async function embedData() {
    const file = document.getElementById('audioFile').files[0];
    const dataToEmbed = document.getElementById('dataToEmbed').value;
    const fingerprint = document.getElementById('fingerprint').value;
    if (file && dataToEmbed && fingerprint) {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const delay0 = 500; // Example delay for binary 0
        const delay1 = 700; // Example delay for binary 1
        const modifiedAudioBuffer = embedDataCombined(audioBuffer, dataToEmbed, fingerprint, delay0, delay1);

        // Play or save the modified audio buffer
        const source = audioContext.createBufferSource();
        source.buffer = modifiedAudioBuffer;
        source.connect(audioContext.destination);
        source.start();

        // Optionally, save the modified audio buffer using FFmpeg.js
        const ffmpeg = FFmpeg.createFFmpeg({ log: true });
        await ffmpeg.load();
        const audioArrayBuffer = modifiedAudioBuffer.getChannelData(0).buffer;
        ffmpeg.FS('writeFile', 'output.wav', new Uint8Array(audioArrayBuffer));
        await ffmpeg.run('-i', 'output.wav', 'output_with_data.wav');
        const output = ffmpeg.FS('readFile', 'output_with_data.wav');
        const blob = new Blob([output.buffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audioElement = document.getElementById('audio');
        audioElement.src = url;
        audioElement.play();
    }
}

// Handle the extraction process
async function extractData() {
    const file = document.getElementById('audioFile').files[0];
    if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const dataLength = 8 * (document.getElementById('dataToEmbed').value.length + document.getElementById('fingerprint').value.length); // Assuming ASCII encoding
        const delay0 = 500; // Example delay for binary 0
        const delay1 = 700; // Example delay for binary 1
        const extractedData = extractDataCombined(audioBuffer, dataLength, delay0, delay1);
        document.getElementById('extractedData').textContent = `Extracted Data: ${extractedData}`;
    }
}

// Event listeners for buttons
document.getElementById('embedButton').addEventListener('click', embedData);
document.getElementById('extractButton').addEventListener('click', extractData);
