document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selection ---
    const startButton = document.getElementById('startButton');
    const speedDisplay = document.getElementById('speedDisplay');
    const needle = document.getElementById('needle');
    const pingResult = document.getElementById('pingResult');
    const jitterResult = document.getElementById('jitterResult');
    const downloadResult = document.getElementById('downloadResult');
    const ispInfo = document.getElementById('ispInfo');
    const statusText = document.getElementById('statusText');

    // Result Boxes for styling
    const resultBoxes = {
        ping: document.getElementById('pingBox'),
        jitter: document.getElementById('jitterBox'),
        download: document.getElementById('downloadBox'),
    };

    // --- Configuration ---
    const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down?bytes=50000000'; // 50MB
    const PING_URL = 'https://one.one.one.one/cdn-cgi/trace'; 
    const PING_COUNT = 10;

    let testInProgress = false;

    // --- Main Test Logic ---
    startButton.addEventListener('click', runSpeedTest);

    async function runSpeedTest() {
        if (testInProgress) return;
        testInProgress = true;
        
        resetUI();
        startButton.disabled = true;
        startButton.textContent = 'Testing...';

        try {
            await fetchISPInfo();

            setActiveTest('ping');
            updateStatus('Testing Ping & Jitter...');
            const { ping, jitter } = await testPing();
            pingResult.textContent = `${ping.toFixed(0)} ms`;
            jitterResult.textContent = `${jitter.toFixed(1)} ms`;
            clearActiveTest();

            setActiveTest('download');
            updateStatus('Testing Download Speed...');
            const downloadSpeed = await testDownloadSpeed();
            downloadResult.textContent = `${downloadSpeed.toFixed(2)} Mbps`;
            clearActiveTest();
            
            updateStatus('Test Complete!');
        } catch (error) {
            console.error("Speed test failed:", error);
            speedDisplay.textContent = "Error";
            updateStatus(`Test failed. Please try again.`);
            statusText.classList.add('text-red-400');
            clearActiveTest();
        } finally {
            startButton.disabled = false;
            startButton.textContent = 'Run Test Again';
            testInProgress = false;
        }
    }

    // --- UI Update Functions ---
    function resetUI() {
        statusText.classList.remove('text-red-400');
        statusText.textContent = '';
        speedDisplay.textContent = '0.00';
        pingResult.textContent = '- ms';
        jitterResult.textContent = '- ms';
        downloadResult.textContent = '- Mbps';
        updateNeedle(0);
        ispInfo.textContent = 'Fetching ISP information...';
        clearActiveTest();
    }
    
    function updateStatus(message) { statusText.textContent = message; }
    function setActiveTest(testName) {
        clearActiveTest();
        if (resultBoxes[testName]) resultBoxes[testName].classList.add('testing');
        if (testName === 'ping' && resultBoxes.jitter) resultBoxes.jitter.classList.add('testing');
    }
    function clearActiveTest() { Object.values(resultBoxes).forEach(box => box.classList.remove('testing')); }

    function updateNeedle(speedMbps) {
        let rotation;
        const logMax = Math.log10(1000); 
        if (speedMbps > 0) {
            const logSpeed = Math.log10(speedMbps);
            rotation = -90 + (logSpeed / logMax) * 180;
        } else {
            rotation = -90;
        }
        const clampedRotation = Math.max(-90, Math.min(90, rotation));
        needle.style.transform = `translateX(-50%) rotate(${clampedRotation}deg)`;
    }

    // --- Core Test Functions ---
    async function testPing() {
        const latencies = [];
        for (let i = 0; i < PING_COUNT; i++) {
            const startTime = performance.now();
            try {
                await fetch(`${PING_URL}?t=${new Date().getTime()}`, { cache: 'no-store', mode: 'no-cors' });
            } catch (e) { /* Expected */ }
            latencies.push(performance.now() - startTime);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        const sum = latencies.reduce((a, b) => a + b, 0);
        const avgPing = sum / latencies.length;
        let sumOfSquares = 0;
        for (const latency of latencies) { sumOfSquares += Math.pow(latency - avgPing, 2); }
        const jitter = latencies.length > 1 ? Math.sqrt(sumOfSquares / (latencies.length - 1)) : 0;
        return { ping: avgPing, jitter };
    }

    async function testDownloadSpeed() {
        const startTime = performance.now();
        let bytesLoaded = 0;
        const response = await fetch(`${DOWNLOAD_URL}&nocache=${new Date().getTime()}`, { cache: 'no-store' });
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesLoaded += value.length;
            const elapsedTime = performance.now() - startTime;
            if (elapsedTime > 0) {
                const speedMbps = (bytesLoaded * 8) / (elapsedTime / 1000) / 1_000_000;
                speedDisplay.textContent = speedMbps.toFixed(2);
                updateNeedle(speedMbps);
            }
        }
        const totalTime = performance.now() - startTime;
        const finalSpeedMbps = (bytesLoaded * 8) / (totalTime / 1000) / 1_000_000;
        speedDisplay.textContent = finalSpeedMbps.toFixed(2);
        return finalSpeedMbps;
    }

    async function fetchISPInfo() {
        try {
            const response = await fetch('https://ip-api.com/json/');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.status === 'success') {
                ispInfo.textContent = `📍 ${data.city}, ${data.country} ・ 🏢 ${data.isp}`;
                return;
            }
        } catch (error) { console.warn('Primary ISP info provider failed. Trying fallback.', error); }

        try {
            const response = await fetch('https://ipinfo.io/json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            ispInfo.textContent = `📍 ${data.city}, ${data.country} ・ 🏢 ${data.org || 'Unknown ISP'}`;
        } catch (error) {
            console.error('Fallback ISP info provider also failed.', error);
            ispInfo.textContent = 'Could not fetch ISP information.';
        }
    }
});