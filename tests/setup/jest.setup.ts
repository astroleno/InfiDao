import "@testing-library/jest-dom";

class MockResponse {
  public readonly status: number;

  constructor(private readonly body: unknown, init: ResponseInit = {}) {
    this.status = init.status ?? 200;
  }

  static json(body: unknown, init?: ResponseInit) {
    return new MockResponse(body, init);
  }

  async json() {
    return this.body;
  }
}

Object.assign(globalThis, {
  Response: MockResponse,
});
