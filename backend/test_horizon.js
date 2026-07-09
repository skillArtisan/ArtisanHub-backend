import http from "http";

const BASE_URL = "http://localhost:4000";

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("Starting Horizon Payment Operations Tests...\n");

  try {
    // Test 1: Create a job
    console.log("Test 1: Creating a job...");
    const createJobResponse = await makeRequest("POST", "/api/jobs", {
      customer: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
      artisan: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567891",
      amount: "100000000", // 10 XLM in stroops
      jobHash: "abc123def456",
      trade: "Plumbing",
      description: "Fix kitchen sink",
    });
    console.log(`Status: ${createJobResponse.status}`);
    console.log(`Job ID: ${createJobResponse.data.job?.jobId}\n`);

    const jobId = createJobResponse.data.job?.jobId;

    // Test 2: Accept the job
    console.log("Test 2: Accepting the job...");
    const acceptResponse = await makeRequest(
      "POST",
      `/api/jobs/${jobId}/accept`,
      {
        actor: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567891",
      },
    );
    console.log(`Status: ${acceptResponse.status}`);
    console.log(`Job State: ${acceptResponse.data.job?.state}\n`);

    // Test 3: Confirm job completion with idempotency key
    console.log("Test 3: Confirming job completion with idempotency key...");
    const idempotencyKey = `test-key-${Date.now()}`;
    const confirmResponse = await makeRequest(
      "POST",
      `/api/jobs/${jobId}/confirm`,
      {
        actor: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        idempotencyKey: idempotencyKey,
      },
    );
    console.log(`Status: ${confirmResponse.status}`);
    console.log(`Job State: ${confirmResponse.data.job?.state}`);
    console.log(
      `Settlement Event Type: ${confirmResponse.data.settlementEvent?.type}`,
    );
    console.log(
      `Settlement Event Status: ${confirmResponse.data.settlementEvent?.status}`,
    );
    console.log(
      `Transaction Hash: ${confirmResponse.data.settlementEvent?.transactionHash}\n`,
    );

    // Test 4: Test idempotency - call confirm again with same key
    console.log(
      "Test 4: Testing idempotency (calling confirm again with same key)...",
    );
    const confirmResponse2 = await makeRequest(
      "POST",
      `/api/jobs/${jobId}/confirm`,
      {
        actor: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        idempotencyKey: idempotencyKey,
      },
    );
    console.log(`Status: ${confirmResponse2.status}`);
    console.log(
      `Transaction Hash: ${confirmResponse2.data.settlementEvent?.transactionHash}`,
    );
    console.log(
      `Same transaction hash: ${confirmResponse.data.settlementEvent?.transactionHash === confirmResponse2.data.settlementEvent?.transactionHash}\n`,
    );

    // Test 5: Get settlement events for the job
    console.log("Test 5: Getting settlement events for the job...");
    const settlementsResponse = await makeRequest(
      "GET",
      `/api/jobs/${jobId}/settlements`,
    );
    console.log(`Status: ${settlementsResponse.status}`);
    console.log(`Number of events: ${settlementsResponse.data.events?.length}`);
    console.log(`Event ID: ${settlementsResponse.data.events?.[0]?.id}\n`);

    // Test 6: Get all settlements
    console.log("Test 6: Getting all settlements...");
    const allSettlementsResponse = await makeRequest("GET", "/api/settlements");
    console.log(`Status: ${allSettlementsResponse.status}`);
    console.log(
      `Total settlements: ${allSettlementsResponse.data.events?.length}\n`,
    );

    // Test 7: Create another job for dispute testing
    console.log("Test 7: Creating another job for dispute testing...");
    const createJob2Response = await makeRequest("POST", "/api/jobs", {
      customer: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567892",
      artisan: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567893",
      amount: "50000000",
      jobHash: "xyz789abc123",
      trade: "Electrical",
    });
    console.log(`Job ID: ${createJob2Response.data.job?.jobId}\n`);

    const jobId2 = createJob2Response.data.job?.jobId;

    // Accept the job
    await makeRequest("POST", `/api/jobs/${jobId2}/accept`, {
      actor: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567893",
    });

    // Raise dispute
    console.log("Test 8: Raising a dispute...");
    const disputeResponse = await makeRequest(
      "POST",
      `/api/jobs/${jobId2}/dispute`,
      {
        actor: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567892",
      },
    );
    console.log(`Status: ${disputeResponse.status}`);
    console.log(`Job State: ${disputeResponse.data.job?.state}\n`);

    // Resolve dispute in favor of customer (refund)
    console.log("Test 9: Resolving dispute in favor of customer (refund)...");
    const disputeIdempotencyKey = `dispute-key-${Date.now()}`;
    const resolveResponse = await makeRequest(
      "POST",
      `/api/jobs/${jobId2}/resolve`,
      {
        mediator: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567894",
        favour: "customer",
        idempotencyKey: disputeIdempotencyKey,
      },
    );
    console.log(`Status: ${resolveResponse.status}`);
    console.log(`Job State: ${resolveResponse.data.job?.state}`);
    console.log(
      `Settlement Event Type: ${resolveResponse.data.settlementEvent?.type}`,
    );
    console.log(
      `Settlement Event Status: ${resolveResponse.data.settlementEvent?.status}`,
    );
    console.log(
      `Refund Amount: ${resolveResponse.data.settlementEvent?.amount}\n`,
    );

    // Test 10: Get specific settlement event
    if (resolveResponse.data.settlementEvent?.id) {
      console.log("Test 10: Getting specific settlement event...");
      const eventResponse = await makeRequest(
        "GET",
        `/api/settlements/${resolveResponse.data.settlementEvent.id}`,
      );
      console.log(`Status: ${eventResponse.status}`);
      console.log(`Event Type: ${eventResponse.data.event?.type}`);
      console.log(`Event Status: ${eventResponse.data.event?.status}\n`);
    }

    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

// Wait a bit for server to be ready
setTimeout(runTests, 1000);
