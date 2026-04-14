#!/bin/sh

set -eu

repo="${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
repo_name="${GITHUB_REPOSITORY#*/}"
gitlab_namespace="${GITLAB_NAMESPACE:-seacomoseo}"
gitlab_repo="${GITLAB_REPO:-${gitlab_namespace}/${repo_name}}"
workdir="$(mktemp -d)"

cleanup () {
  rm -rf "$workdir"
}

trap cleanup EXIT INT TERM

echo "Origin:  github.com/${repo}"
echo "Target:  gitlab.com/${gitlab_repo}"

git clone --mirror "https://x-access-token:${GH_PAT}@github.com/${repo}.git" "$workdir/repo-mirror"

cd "$workdir/repo-mirror"
git remote set-url --push origin "https://oauth2:${GL_PAT}@gitlab.com/${gitlab_repo}.git"
git push --mirror
