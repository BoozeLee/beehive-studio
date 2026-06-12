export interface DslDiagnostic {
  line: number;
  startColumn: number;
  endColumn: number;
  severity: "error" | "warning";
  message: string;
}

const KNOWN_FIELDS = new Set(["style", "bpm", "key", "duration", "mood", "instruments"]);

export function validateJetBeeDsl(source: string): DslDiagnostic[] {
  const diagnostics: DslDiagnostic[] = [];
  const lines = source.split(/\r?\n/);
  let balance = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const content = line.replace(/#.*$/, "").trim();
    for (const char of content) {
      if (char === "{") balance += 1;
      if (char === "}") balance -= 1;
      if (balance < 0) {
        diagnostics.push({
          line: lineNumber,
          startColumn: Math.max(1, line.indexOf("}") + 1),
          endColumn: Math.max(2, line.indexOf("}") + 2),
          severity: "error",
          message: "Unexpected closing brace.",
        });
        balance = 0;
      }
    }

    const owner = content.match(/^@owner\s+(\S+)\s+(\S+)$/);
    if (content.startsWith("@owner") && (!owner || !["dsl", "visual"].includes(owner[2]))) {
      diagnostics.push({
        line: lineNumber,
        startColumn: 1,
        endColumn: Math.max(2, line.length + 1),
        severity: "error",
        message: "Ownership directive must be: @owner <artifact-id> dsl|visual",
      });
    }

    const field = content.match(/^([a-zA-Z_]\w*)\s*:\s*(.+)$/);
    if (field && !KNOWN_FIELDS.has(field[1].toLowerCase())) {
      diagnostics.push({
        line: lineNumber,
        startColumn: 1,
        endColumn: field[1].length + 1,
        severity: "warning",
        message: `Unknown JetBee field '${field[1]}'.`,
      });
    }
    if (field?.[1].toLowerCase() === "bpm") {
      const bpm = Number(field[2]);
      if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) {
        diagnostics.push({
          line: lineNumber,
          startColumn: line.indexOf(field[2]) + 1,
          endColumn: line.indexOf(field[2]) + field[2].length + 1,
          severity: "error",
          message: "BPM must be a number between 40 and 240.",
        });
      }
    }
  });

  if (balance > 0) {
    diagnostics.push({
      line: Math.max(1, lines.length),
      startColumn: 1,
      endColumn: Math.max(2, (lines.at(-1)?.length ?? 0) + 1),
      severity: "error",
      message: "Unclosed block.",
    });
  }
  return diagnostics;
}
