import { Probot } from "probot";
import { analyzePR } from "./analyser";
import { DepBlastConfig, loadConfig } from "./config";
import { formatReport } from "./formatter";

export default function depblastApp(app: Probot): void {
  const config: DepBlastConfig = loadConfig();

  app.log.info("DepBlast is alive! 🐼");

  // Handle pull request opened, synchronized, or reopened
  app.on(
    ["pull_request.opened", "pull_request.synchronize", "pull_request.reopened"],
    async (context) => {
      const { pull_request, repository } = context.payload;

      if (!pull_request || !repository) {
        app.log.warn("Missing pull_request or repository in payload");
        return;
      }

      const owner = repository.owner.login;
      const repo = repository.name;
      const prNumber = pull_request.number;
      const prHead = pull_request.head.sha;

      app.log.info(`Analyzing PR #${prNumber} in ${owner}/${repo}`);

      try {
        // Check for a .depblast.yml config in the repo
        const repoConfig = await getRepoConfig(context, owner, repo);

        // Only analyze if there are package.json changes
        const files = await getChangedPackageJsonFiles(context, owner, repo, prNumber);
        if (files.length === 0) {
          app.log.info(`PR #${prNumber}: No package.json changes found, skipping`);
          return;
        }

        // Run the analysis
        const report = await analyzePR(context, owner, repo, prNumber, prHead, files, repoConfig, app.log);

        if (!report) {
          app.log.info(`PR #${prNumber}: No new dependencies detected`);
          return;
        }

        // Format and post the report
        const commentBody = formatReport(report, config);

        // Check if we already have a DepBlast comment and update it
        const existingCommentId = await findExistingComment(context, owner, repo, prNumber);

        if (existingCommentId) {
          await context.octokit.issues.updateComment({
            owner,
            repo,
            comment_id: existingCommentId,
            body: commentBody,
          });
          app.log.info(`PR #${prNumber}: Updated existing DepBlast comment (#${existingCommentId})`);
        } else {
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: commentBody,
          });
          app.log.info(`PR #${prNumber}: Created new DepBlast comment`);
        }

        // Also create a check run for richer reporting
        await createCheckRun(context, owner, repo, prHead, report);

      } catch (err) {
        app.log.error(`Error analyzing PR #${prNumber}: ${err}`);
        // Post error as a friendly comment so dev knows
        try {
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: `🐼 **DepBlast encountered an error analyzing this PR:**\n\n\`\`\`\n${err instanceof Error ? err.message : String(err)}\n\`\`\`\n\nCheck the app logs for details.`,
          });
        } catch {
          app.log.error("Failed to post error comment");
        }
      }
    }
  );
}

async function getChangedPackageJsonFiles(
  context: any,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> {
  const files: string[] = [];

  try {
    const { data: prFiles } = await context.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    for (const file of prFiles) {
      const filename = file.filename;
      // Match package.json or package-lock.json or yarn.lock
      if (
        filename === "package.json" ||
        filename.endsWith("/package.json") ||
        filename === "package-lock.json" ||
        filename === "yarn.lock" ||
        filename === "pnpm-lock.yaml"
      ) {
        files.push(filename);
      }
    }
  } catch (err) {
    context.log.error(`Failed to list PR files: ${err}`);
  }

  return files;
}

async function findExistingComment(
  context: any,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number | null> {
  try {
    const { data: comments } = await context.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    for (const comment of comments) {
      if (comment.user?.type === "Bot" && comment.body?.startsWith("🐼 **DepBlast Report**")) {
        return comment.id;
      }
    }
  } catch {
    // Silently fail
  }
  return null;
}

async function getRepoConfig(
  context: any,
  owner: string,
  repo: string
): Promise<Record<string, any>> {
  try {
    const { data: content } = await context.octokit.repos.getContent({
      owner,
      repo,
      path: ".depblast.yml",
    });
    if ("content" in content) {
      const decoded = Buffer.from(content.content, "base64").toString();
      // Simple YAML-like parsing (we'll keep it basic)
      const config: Record<string, any> = {};
      for (const line of decoded.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...rest] = trimmed.split(":");
          if (key && rest.length > 0) {
            config[key.trim()] = rest.join(":").trim();
          }
        }
      }
      return config;
    }
  } catch {
    // No config file, use defaults
  }
  return {};
}

async function createCheckRun(
  context: any,
  owner: string,
  repo: string,
  headSha: string,
  report: any
): Promise<void> {
  try {
    const { hasIssues, summary } = getCheckSummary(report);

    await context.octokit.checks.create({
      owner,
      repo,
      name: "DepBlast",
      head_sha: headSha,
      status: "completed",
      conclusion: hasIssues ? "neutral" : "success",
      output: {
        title: "DepBlast — Dependency Impact Report",
        summary: summary,
        text: JSON.stringify(report, null, 2),
      },
    });
  } catch (err) {
    context.log.error(`Failed to create check run: ${err}`);
  }
}

function getCheckSummary(report: any): { hasIssues: boolean; summary: string } {
  let hasIssues = false;
  const items: string[] = [];

  for (const dep of report.dependencies) {
    const warnings: string[] = [];
    if (dep.licenseRisk) { warnings.push("⚠️ License risk"); hasIssues = true; }
    if (dep.securityIssues && dep.securityIssues.length > 0) { warnings.push("🔒 Security advisories"); hasIssues = true; }
    if (dep.maintainerScore !== undefined && dep.maintainerScore < 3) { warnings.push("❤️ Low maintainer health"); hasIssues = true; }
    if (dep.sizeBytes !== undefined && dep.sizeBytes > 500_000) { warnings.push("📦 Large bundle impact"); hasIssues = true; }

    const status = warnings.length > 0 ? warnings.join(", ") : "✅ Looks good";
    items.push(`**${dep.name}@${dep.version}**: ${status}`);
  }

  return {
    hasIssues,
    summary: items.join("\n"),
  };
}
