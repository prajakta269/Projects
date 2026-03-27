const noble = require('@abandonware/noble');

// Replace with your 3 BLE beacon names
// const TARGET_NAMES = ["moto g96 5G", "motorola edge 60 pro", "motorola edge 50 fusion"]; 
// const TARGET_NAMES = ["moto g96 5G", "vivo Y200e 5G", "motorola edge 50 fusion"];  
// const TARGET_NAMES = ["moto g96 5G", "Adinath's S23", "realme 12 Pro 5G"];
const TARGET_NAMES = ["moto g96 5G", "Nothing Phone (2a)", "realme narzo 50A"];  
const TX_POWER = -70;  // Adjust per calibration
const N = 2.0;         // Path-loss exponent

// Distances will be stored in fixed slots
let distances = [null, null, null]; 
let beaconRSSI = {};
let isScanning = false;

// Initialize RSSI arrays for each beacon
TARGET_NAMES.forEach(name => {
    beaconRSSI[name] = [];
});

// Function to calculate distance from RSSI
function calculateDistance(rssi, txPower = TX_POWER, n = N) {
    return Math.pow(10, (txPower - rssi) / (10 * n));
}

// Function to calculate average RSSI
function calculateAverageRSSI(rssiArray) {
    if (rssiArray.length === 0) return null;
    return rssiArray.reduce((a, b) => a + b, 0) / rssiArray.length;
}

// Start scanning when BLE is ready
noble.on('stateChange', async (state) => {
    if (state === 'poweredOn' && !isScanning) {
        console.log('📡 Starting BLE scan...');
        try {
            await noble.startScanningAsync([], true);
            isScanning = true;
            console.log('✅ Scanning started successfully');
        } catch (error) {
            console.log('❌ Failed to start scanning:', error.message);
        }
    } else if (state !== 'poweredOn') {
        console.log('❌ Bluetooth not available, state:', state);
        isScanning = false;
    }
});

noble.on('discover', (peripheral) => {
    try {
        const name = peripheral.advertisement.localName;
        const rssi = peripheral.rssi;

        // Only process if name is one of our targets and RSSI is valid
        if (!name || rssi === undefined) return;
        
        const index = TARGET_NAMES.indexOf(name);
        if (index !== -1) {
            // Add new RSSI reading
            beaconRSSI[name].push(rssi);
            
            // Keep only last 10 readings
            if (beaconRSSI[name].length > 10) {
                beaconRSSI[name].shift();
            }
            
            // Calculate average RSSI
            const avgRssi = calculateAverageRSSI(beaconRSSI[name]);
            
            if (avgRssi !== null) {
                const distance = calculateDistance(avgRssi);
                distances[index] = distance;
                
                console.clear();
                console.log("📡 BLE Beacons Detected:");
                TARGET_NAMES.forEach((target, i) => {
                    if (distances[i] !== null && beaconRSSI[target].length > 0) {
                        const currentAvg = calculateAverageRSSI(beaconRSSI[target]);
                        console.log(`🔹 ${target}: Avg RSSI = ${currentAvg.toFixed(2)} dBm, Distance = ${distances[i].toFixed(2)} m`);
                    } else {
                        console.log(`🔸 ${target}: Not detected yet`);
                    }
                });
                
                console.log(`\n🎯 Distances Array: [${distances.map(d => d ? d.toFixed(2) : 'null').join(', ')}]`);
            }
        }
    } catch (error) {
        console.log('❌ Error processing peripheral:', error.message);
    }
});

// Handle scanning errors
noble.on('warning', (message) => {
    console.log('⚠️ BLE Warning:', message);
});

// Export distances for server-side use
function getBeaconDistances() {
    console.log('Current distances:', distances);
    return distances;
}

// Stop scanning function
function stopScanning() {
    if (isScanning) {
        noble.stopScanningAsync();
        isScanning = false;
        console.log('🛑 Scanning stopped');
    }
}

// Cleanup on process exit
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    stopScanning();
    process.exit(0);
});

module.exports = {
    getBeaconDistances,
    stopScanning
};