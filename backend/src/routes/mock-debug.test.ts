import { it, expect, jest } from "@jest/globals";

jest.mock("../services/jobs.js", () => ({
  jobService: { fn: () => "original" },
}));

import { jobService } from "../services/jobs.js";

it("uses jest.requireMock to get writable mock ref", () => {
  // Get the actual mock object via requireMock
  const mock = jest.requireMock("../services/jobs.js") as { jobService: Record<string, unknown> };
  console.log("same ref?", mock.jobService === jobService);
  
  // Mutate via requireMock ref
  mock.jobService.fn = () => "mutated";
  
  // Does the imported ref see the mutation?
  console.log("jobService.fn():", (jobService as any).fn());
  expect((jobService as any).fn()).toBe("mutated");
});
