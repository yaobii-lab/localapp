export interface StdoutPortDetection {
  port: number;
  url: string;
}

export function detectPortFromLine(line: string): StdoutPortDetection | null {
  const urlMatch = line.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
  if (urlMatch) return detectionFromPort(urlMatch[1]);

  const startedMatch = line.match(/started server on .*:(\d+)/i);
  if (startedMatch) return detectionFromPort(startedMatch[1]);

  const servingMatch = line.match(/Serving HTTP on .* port (\d+)/i);
  if (servingMatch) return detectionFromPort(servingMatch[1]);

  return null;
}

export function createStdoutPortDetector(): {
  push(chunk: string): StdoutPortDetection | null;
  flush(): StdoutPortDetection | null;
} {
  let buffer = "";

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const detection = detectPortFromLine(line);
        if (detection) return detection;
      }
      return null;
    },
    flush() {
      if (!buffer) return null;
      const detection = detectPortFromLine(buffer);
      buffer = "";
      return detection;
    }
  };
}

function detectionFromPort(raw: string): StdoutPortDetection | null {
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { port, url: `http://localhost:${port}` };
}
