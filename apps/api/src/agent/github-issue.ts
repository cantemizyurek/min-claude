import type { Db } from "@min-claude/db";
import { getMessagesByPrdId, updatePrdGithubIssueNumber } from "@min-claude/db";

/**
 * Extract the PRD content from conversation messages.
 * Finds the last substantial assistant text message (the final synthesized PRD).
 */
export function extractPrdContent(
  db: Db,
  prdId: number
): string | null {
  const messages = getMessagesByPrdId(db, prdId);

  // Filter to assistant text messages (not ask_user_question tool calls)
  const assistantTexts = messages.filter((msg) => {
    if (msg.role !== "assistant") return false;
    // Skip tool use messages (ask_user_question)
    if (msg.toolUseId) return false;
    // Skip JSON content that is tool-related
    if (typeof msg.content === "object" && msg.content !== null) {
      const obj = msg.content as Record<string, unknown>;
      if (obj.type === "ask_user_question") return false;
    }
    return true;
  });

  if (assistantTexts.length === 0) return null;

  // The last assistant text message should be the final synthesized PRD
  const lastMessage = assistantTexts[assistantTexts.length - 1];
  return typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);
}

/**
 * Create a GitHub issue using `gh issue create` in the project directory.
 * Returns the issue number on success.
 */
export async function createGithubIssue(
  title: string,
  body: string,
  projectPath: string,
  spawnFn: typeof Bun.spawn = Bun.spawn
): Promise<{ issueNumber: number; issueUrl: string }> {
  const proc = spawnFn(
    ["gh", "issue", "create", "--title", `PRD: ${title}`, "--body", body],
    {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (exitCode !== 0) {
    throw new Error(
      `gh issue create failed (exit ${exitCode}): ${stderr.trim()}`
    );
  }

  // gh issue create outputs the issue URL, e.g. https://github.com/owner/repo/issues/42
  const issueUrl = stdout.trim();
  const match = issueUrl.match(/\/issues\/(\d+)$/);
  if (!match) {
    throw new Error(`Could not parse issue number from gh output: ${issueUrl}`);
  }

  return { issueNumber: parseInt(match[1], 10), issueUrl };
}

/**
 * Submit the completed PRD as a GitHub issue.
 * Extracts PRD content from messages, creates a GitHub issue,
 * and stores the issue number in the database.
 */
export async function submitPrdAsGithubIssue(
  db: Db,
  prdId: number,
  prdTitle: string,
  projectPath: string,
  spawnFn?: typeof Bun.spawn
): Promise<{ issueNumber: number; issueUrl: string }> {
  const content = extractPrdContent(db, prdId);
  if (!content) {
    throw new Error("No PRD content found in conversation messages");
  }

  const result = await createGithubIssue(
    prdTitle,
    content,
    projectPath,
    spawnFn
  );

  updatePrdGithubIssueNumber(db, prdId, result.issueNumber);
  return result;
}
