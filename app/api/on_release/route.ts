import { NextRequest } from "next/server";

const GITHUB_API = "https://api.github.com";

type SlackWebhookPayload = {
  release_name: string;
  tag_name: string;
  changelog: string;
  release_url: string;
  changelog_url: string;
};

type ReleaseEvent = {
  release: {
    name: string;
    tag_name: string;
    body: string;
  };
  repository: {
    full_name: string;
  };
};

type CommitsCompare = {
  html_url: string;
  commits: {
    commit: {
      message: string;
    };
  }[];
};

const extractCommitTitle = ({ commit }: CommitsCompare["commits"][number]) =>
  `• ${commit.message.split("\n")[0].replaceAll(/\(#\d+\)/g, "")}`;

const getChangelog = async (repo: string, release: ReleaseEvent["release"]) => {
  // The body usually ends with the changelog URL
  const baseHead = release.body.split("\n").pop()?.split("compare/").pop();

  const changelog = (await fetch(
    `${GITHUB_API}/repos/${repo}/compare/${baseHead}`
  ).then((res) => res.json())) as CommitsCompare;

  return {
    changelog: changelog.commits.map(extractCommitTitle).join("\r\n"),
    changelog_url: changelog.html_url,
  };
};

export async function POST(request: NextRequest) {
  const slackWebhookURL = request.nextUrl.searchParams.get("destination");

  if (!slackWebhookURL) {
    return Response.json(
      { error: "'slackWebhookURL' query param is required." },
      { status: 400 }
    );
  }
  const event = (await request.json()) as ReleaseEvent;

  const repo = event.repository.full_name;
  const diff = await getChangelog(repo, event.release);

  const payload: SlackWebhookPayload = {
    ...diff,
    tag_name: event.release.tag_name,
    release_url: `https://github.com/${repo}/releases/tag/${event.release.tag_name}`,
    release_name: event.release.name,
  };

  const res = await fetch(slackWebhookURL, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await res.text();

  return Response.json(
    { payload, slack_response: data },
    { status: res.status }
  );
}
