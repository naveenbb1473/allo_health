import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

/**
 * --------------------------------------------------------
 * Custom Metrics
 * --------------------------------------------------------
 */

export const successReservations = new Counter("reservation_success_total");
export const conflictReservations = new Counter("reservation_conflict_total");
export const reservationErrors = new Rate("reservation_error_rate");
export const reservationLatency = new Trend("reservation_latency");

/**
 * --------------------------------------------------------
 * Test Configuration
 * --------------------------------------------------------
 */

export const options = {
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: 5,
      duration: "30s",
      exec: "baselineScenario",
      startTime: "0s",
    },
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [{ duration: "1m", target: 50 }],
      exec: "raceConditionScenario",
      startTime: "35s",
    },
    peak_load: {
      executor: "constant-vus",
      vus: 50,
      duration: "2m",
      exec: "peakLoadScenario",
      startTime: "1m40s",
    },
    spike_test: {
      executor: "constant-vus",
      vus: 100,
      duration: "30s",
      exec: "spikeScenario",
      startTime: "3m50s",
    },
  },
  thresholds: {
    // Thresholds might be easily met with realistic distributed load,
    // so we keep the tight p95<500ms constraint
    http_req_duration: ["p(50)<200", "p(95)<500", "p(99)<1000"],
    reservation_error_rate: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(50)", "p(95)", "p(99)"],
};

/**
 * --------------------------------------------------------
 * Config
 * --------------------------------------------------------
 */

const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3000";

/**
 * --------------------------------------------------------
 * Utility Functions
 * --------------------------------------------------------
 */

function customerId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 50 realistic products
const PRODUCT_IDS = Array.from({ length: 50 }).map(
  (_, i) => `11111111-1111-1111-1111-${String(i + 1).padStart(12, "0")}`,
);

// Randomize warehouse selection to distribute DB locks further
// Assuming 3 main fulfillment centers
const WAREHOUSE_IDS = Array.from({ length: 3 }).map(
  (_, i) => `22222222-2222-2222-2222-${String(i + 1).padStart(12, "0")}`,
);

function reservationPayload() {
  const randomProduct =
    PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
  const randomWarehouse =
    WAREHOUSE_IDS[Math.floor(Math.random() * WAREHOUSE_IDS.length)];

  // Mixed reservation sizes (mostly 1 unit, occasionally 2 or 3)
  const rand = Math.random();
  const quantity = rand > 0.9 ? 3 : rand > 0.7 ? 2 : 1;

  return JSON.stringify({
    productId: randomProduct,
    warehouseId: randomWarehouse,
    quantity,
    customerId: customerId(),
  });
}

const params = {
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * --------------------------------------------------------
 * Setup
 * --------------------------------------------------------
 */

export function setup() {
  console.log("Starting realistic distributed load tests...");
  return {
    startedAt: new Date().toISOString(),
  };
}

export default function defaultScenario() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 409 }));
}

/**
 * --------------------------------------------------------
 * Stage 1 Baseline
 * --------------------------------------------------------
 */

export function baselineScenario() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 409 }));
  const response = http.post(
    `${BASE_URL}/api/reservations`,
    reservationPayload(),
    params,
  );
  reservationLatency.add(response.timings.duration);

  if (response.status !== 201 && response.status !== 409) {
    console.log(`Unexpected status: ${response.status} Body: ${response.body}`);
  }

  const success = check(response, {
    "baseline status valid": (r) => r.status === 201 || r.status === 409,
  });

  reservationErrors.add(!success);

  if (response.status === 201) successReservations.add(1);
  if (response.status === 409) conflictReservations.add(1);

  sleep(1);
}

/**
 * --------------------------------------------------------
 * Stage 2 Race Condition Ramp-Up
 * --------------------------------------------------------
 */

export function raceConditionScenario() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 409 }));
  const response = http.post(
    `${BASE_URL}/api/reservations`,
    reservationPayload(),
    params,
  );
  reservationLatency.add(response.timings.duration);

  if (response.status !== 201 && response.status !== 409) {
    console.log(`Unexpected status: ${response.status} Body: ${response.body}`);
  }

  const success = check(response, {
    "race condition response valid": (r) =>
      r.status === 201 || r.status === 409,
  });

  reservationErrors.add(!success);

  if (response.status === 201) successReservations.add(1);
  if (response.status === 409) conflictReservations.add(1);

  check(response, {
    "successful reservation OR proper conflict": (r) =>
      r.status === 201 || r.status === 409,
  });

  sleep(0.2);
}

/**
 * --------------------------------------------------------
 * Stage 3 Peak Load
 * --------------------------------------------------------
 */

export function peakLoadScenario() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 409 }));
  const response = http.post(
    `${BASE_URL}/api/reservations`,
    reservationPayload(),
    params,
  );
  reservationLatency.add(response.timings.duration);

  if (response.status !== 201 && response.status !== 409) {
    console.log(`Unexpected status: ${response.status} Body: ${response.body}`);
  }

  const success = check(response, {
    "peak load valid response": (r) => r.status === 201 || r.status === 409,
  });

  reservationErrors.add(!success);

  if (response.status === 201) successReservations.add(1);
  if (response.status === 409) conflictReservations.add(1);

  sleep(0.1);
}

/**
 * --------------------------------------------------------
 * Stage 4 Spike Test
 * --------------------------------------------------------
 */

export function spikeScenario() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 409 }));
  const response = http.post(
    `${BASE_URL}/api/reservations`,
    reservationPayload(),
    params,
  );
  reservationLatency.add(response.timings.duration);

  if (response.status !== 201 && response.status !== 409) {
    console.log(`Unexpected status: ${response.status} Body: ${response.body}`);
  }

  const success = check(response, {
    "spike response valid": (r) => r.status === 201 || r.status === 409,
  });

  reservationErrors.add(!success);

  if (response.status === 201) successReservations.add(1);
  if (response.status === 409) conflictReservations.add(1);

  sleep(0.05);
}

/**
 * --------------------------------------------------------
 * Teardown
 * --------------------------------------------------------
 */

export function teardown() {
  console.log("Load tests completed.");
}

/**
 * --------------------------------------------------------
 * Summary Output
 * --------------------------------------------------------
 */

export function handleSummary(data) {
  console.log("\n================================================");
  console.log("Realistic Distributed Load Test Summary");
  console.log("================================================\n");
  console.log(
    `Total Success Reservations: ${data.metrics.reservation_success_total?.values?.count ?? 0}`,
  );
  console.log(
    `Total 409 Conflicts: ${data.metrics.reservation_conflict_total?.values?.count ?? 0}`,
  );
  console.log(
    `Error Rate: ${((data.metrics.reservation_error_rate?.values?.rate ?? 0) * 100).toFixed(2)}%`,
  );

  // Export JSON results
  return {
    "k6-realistic-results.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
