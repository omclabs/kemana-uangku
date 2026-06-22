const rawWebVersion = import.meta.env.VITE_APP_VERSION;
const rawWebCommitSha = import.meta.env.VITE_COMMIT_SHA;
const rawWebBuildTime = import.meta.env.VITE_BUILD_TIME;

export const WEB_BUILD = {
  version: rawWebVersion && rawWebVersion.trim() ? rawWebVersion : 'dev',
  commitSha: rawWebCommitSha && rawWebCommitSha.trim() ? rawWebCommitSha : 'dev',
  builtAt: rawWebBuildTime && rawWebBuildTime.trim() ? rawWebBuildTime : null,
};
