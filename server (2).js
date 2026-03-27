const express = require("express");
const { getBeaconDistances } = require("./distance");

const app = express();
const PORT = 3000;
const path = require("path");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Coordinates of beacons (must match TARGET_NAMES order in distance.js)
const BEACON_COORDINATES = [
    [890, 333],   // Beacon1
    [796, 317],   // Beacon2
    [896, 399]    // Beacon3 
];

// CRITICAL: Scale factor - 1 meter in real world = 10 units on map
const METERS_TO_MAP_UNITS = 10;

// Trilateration function
function trilaterate(beacon1, beacon2, beacon3) {
    const [x1, y1, r1] = beacon1;
    const [x2, y2, r2] = beacon2;
    const [x3, y3, r3] = beacon3;

    // Distances are already scaled in getUserCoordinates()
    // r1, r2, r3 are now in map units

    const A = 2 * (x2 - x1);
    const B = 2 * (y2 - y1);
    const C = r1 ** 2 - r2 ** 2 - x1 ** 2 + x2 ** 2 - y1 ** 2 + y2 ** 2;

    const D = 2 * (x3 - x2);
    const E = 2 * (y3 - y2);
    const F = r2 ** 2 - r3 ** 2 - x2 ** 2 + x3 ** 2 - y2 ** 2 + y3 ** 2;

    const denominator = (A * E - B * D);
    if (Math.abs(denominator) < 0.0001) {
        console.log("⚠️ Beacons are collinear - cannot calculate position");
        return null;
    }

    const x = (C * E - F * B) / denominator;
    const y = (A * F - D * C) / denominator;

    return [parseFloat(x.toFixed(2)), parseFloat(y.toFixed(2))];
}

// Function to get user coordinates
function getUserCoordinates() {
    const distances = getBeaconDistances(); // distances in METERS

    console.log(`📡 Raw BLE distances (meters): [${distances.map(d => d ? d.toFixed(2) : 'null').join(', ')}]`);

    // Check if all beacons detected
    if (distances.every(d => d !== null && d > 0)) {
        // Convert meters to map units: multiply by 10
        const beacons = BEACON_COORDINATES.map((coord, i) => {
            const distanceInMapUnits = distances[i] * METERS_TO_MAP_UNITS;
            console.log(`📍 Beacon ${i + 1}: Distance ${distances[i].toFixed(2)}m → ${distanceInMapUnits.toFixed(2)} map units`);
            return [coord[0], coord[1], distanceInMapUnits];
        });

        const position = trilaterate(beacons[0], beacons[1], beacons[2]);
        
        if (position && !isNaN(position[0]) && !isNaN(position[1])) {
            console.log(`✅ User position calculated: [${position[0]}, ${position[1]}]`);
            return position;
        } else {
            console.log("⚠️ Trilateration failed - invalid position");
            return null;
        }
    } else {
        const detected = distances.filter(d => d !== null && d > 0).length;
        console.log(`⚠️ Only ${detected}/3 beacons detected`);
        return null;
    }
}

// Serve main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "mapnew.html"));
});

// API endpoint for user position (with polling support)
app.post("/api/user-position", (req, res) => {
    const userCoord = getUserCoordinates();
    
    if (userCoord) {
        res.json(userCoord);
    } else {
        // Return default position if beacons not detected
        console.log("📍 Returning default position [500, 500]");
        res.status(200).json([500, 500]);
    }
});

// Alternative GET endpoint (if you prefer GET requests)
app.get("/api/user-position", (req, res) => {
    const userCoord = getUserCoordinates();
    
    if (userCoord) {
        res.json(userCoord);
    } else {
        console.log("📍 Returning default position [500, 500]");
        res.status(200).json([500, 500]);
    }
});

// Debug endpoint to check beacon status
app.get("/api/beacon-status", (req, res) => {
    const distances = getBeaconDistances();
    res.json({
        beacons: BEACON_COORDINATES.map((coord, i) => ({
            id: i + 1,
            coordinates: coord,
            distanceMeters: distances[i],
            distanceMapUnits: distances[i] ? (distances[i] * METERS_TO_MAP_UNITS).toFixed(2) : null,
            detected: distances[i] !== null
        })),
        allDetected: distances.every(d => d !== null),
        scaleFactor: METERS_TO_MAP_UNITS,
        note: "1 meter = 10 map units"
    });
});

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📍 Position API: http://localhost:${PORT}/api/user-position`);
    console.log(`🔍 Debug API: http://localhost:${PORT}/api/beacon-status`);
    console.log(`📏 Scale: 1 meter = ${METERS_TO_MAP_UNITS} map units`);
});