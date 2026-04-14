#!/bin/sh

set -eu

repo="${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
repo_name="${GITHUB_REPOSITORY#*/}"
gitlab_namespace="${GITLAB_NAMESPACE:-seacomoseo}"
gitlab_repo="${GITLAB_REPO:-${gitlab_namespace}/${repo_name}}"
gitlab_username="${GL_USERNAME:-oauth2}"
gitlab_api_base="${GITLAB_API_BASE:-https://gitlab.com/api/v4}"
workdir="$(mktemp -d)"
gitlab_namespace_path="$(printf '%s' "$gitlab_namespace" | sed 's/\//%2F/g')"
gitlab_project_path="$(printf '%s' "$gitlab_repo" | sed 's/\//%2F/g')"

cleanup () {
  rm -rf "$workdir"
}

trap cleanup EXIT INT TERM

echo "Origin:  github.com/${repo}"
echo "Target:  gitlab.com/${gitlab_repo}"

project_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "PRIVATE-TOKEN: ${GL_PAT}" \
  "${gitlab_api_base}/projects/${gitlab_project_path}")"

if [ "$project_status" = "404" ]; then
  echo "Target project does not exist. Creating gitlab.com/${gitlab_repo}"

  namespace_id="$(curl --silent --show-error --fail \
    --header "PRIVATE-TOKEN: ${GL_PAT}" \
    "${gitlab_api_base}/groups/${gitlab_namespace_path}" |
    sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p' |
    head -n 1)"

  if [ -z "$namespace_id" ]; then
    echo "Unable to resolve GitLab namespace ${gitlab_namespace}" >&2
    echo "Check that GL_PAT has api scope and can access the target group." >&2
    exit 1
  fi

  create_response="$(curl --silent --show-error --fail \
    --request POST \
    --header "PRIVATE-TOKEN: ${GL_PAT}" \
    --header "Content-Type: application/json" \
    --data "{\"name\":\"${repo_name}\",\"path\":\"${repo_name}\",\"namespace_id\":${namespace_id}}" \
    "${gitlab_api_base}/projects")"

  if ! printf '%s' "$create_response" | grep -q "\"path_with_namespace\":\"${gitlab_repo}\""; then
    echo "GitLab project creation response did not match ${gitlab_repo}" >&2
    echo "Check that the token owner can create projects in the ${gitlab_namespace} namespace." >&2
    exit 1
  fi
elif [ "$project_status" != "200" ]; then
  echo "Unable to query GitLab project ${gitlab_repo} (HTTP ${project_status})" >&2
  echo "Check that GL_PAT is valid and has api scope." >&2
  exit 1
fi

git clone --mirror "https://x-access-token:${GH_PAT}@github.com/${repo}.git" "$workdir/repo-mirror"

cd "$workdir/repo-mirror"
git remote set-url --push origin "https://${gitlab_username}:${GL_PAT}@gitlab.com/${gitlab_repo}.git"

if ! git push --mirror; then
  echo "Mirror push failed for gitlab.com/${gitlab_repo}" >&2
  echo "Check that GL_PAT is valid, not expired, and has api + write_repository scopes." >&2
  echo "Also verify that the destination project exists and that the token owner can push to it." >&2
  exit 1
fi
