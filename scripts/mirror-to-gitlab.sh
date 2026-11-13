#!/bin/sh

set -eu

repo="${GITHUB_REPOSITORY:?Missing GITHUB_REPOSITORY}"
repo_name="${GITHUB_REPOSITORY#*/}"
gitlab_namespace="${GITLAB_NAMESPACE:-seacomoseo}"
# Naming rule: <owner> when the repository is `site` (almost all), else <owner>-<repo>.
repo_owner="${repo%%/*}"
if [ "$repo_name" = site ]; then gitlab_name="$repo_owner"; else gitlab_name="${repo_owner}-${repo_name}"; fi
gitlab_repo="${GITLAB_REPO:-${gitlab_namespace}/${gitlab_name}}"
gitlab_username="${GL_USERNAME:-oauth2}"
gitlab_api_base="${GITLAB_API_BASE:-https://gitlab.com/api/v4}"
workdir="$(mktemp -d)"
gitlab_namespace_path="$(printf '%s' "$gitlab_namespace" | sed 's/\//%2F/g')"
gitlab_project_name="${gitlab_repo##*/}"
gitlab_project_path="$(printf '%s' "$gitlab_repo" | sed 's/\//%2F/g')"

cleanup () {
  rm -rf "$workdir"
}

trap cleanup EXIT INT TERM

echo "Origin:  github.com/${repo}"
echo "Target:  gitlab.com/${gitlab_repo}"

# Preferred path (no expiry): SSH deploy key (GL_DEPLOY_KEY) enabled on the existing
# GitLab project with push rights. The project is created once, at migration time.
if [ -n "${GL_DEPLOY_KEY:-}" ]; then
  key="$workdir/deploy_key"
  printf '%s\n' "$GL_DEPLOY_KEY" > "$key"
  chmod 600 "$key"
  # Pinned gitlab.com ED25519 host key (SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8).
  printf '%s\n' 'gitlab.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAfuCHKVTjquxvt6CM6tdG4SLp1Btn/nOeHHE5UOzRdf' > "$workdir/known_hosts"
  git clone --mirror "https://x-access-token:${GH_PAT:?Missing GH_PAT}@github.com/${repo}.git" "$workdir/repo-mirror"
  cd "$workdir/repo-mirror"
  git remote set-url --push origin "git@gitlab.com:${gitlab_repo}.git"
  if ! GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$workdir/known_hosts" git push --mirror; then
    echo "Mirror push failed for gitlab.com/${gitlab_repo}" >&2
    echo "Check that the project exists and the deploy key is enabled on it with write access." >&2
    exit 1
  fi
  exit 0
fi

project_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "PRIVATE-TOKEN: ${GL_PAT}" \
  "${gitlab_api_base}/projects/${gitlab_project_path}")"

if [ "$project_status" = "404" ]; then
  echo "Target project does not exist. Creating gitlab.com/${gitlab_repo}"

  namespace_id="$(curl --silent --show-error --fail \
    --header "PRIVATE-TOKEN: ${GL_PAT}" \
    "${gitlab_api_base}/namespaces/${gitlab_namespace_path}" |
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
    --data "{\"name\":\"${gitlab_project_name}\",\"path\":\"${gitlab_project_name}\",\"namespace_id\":${namespace_id}}" \
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
  echo "If GitLab reported a protected branch, allow force pushes for that branch." >&2
  echo "A mirror must force-update a protected branch when its history differs from GitHub." >&2
  echo "Check that GL_PAT is valid, not expired, and has api + write_repository scopes." >&2
  echo "Also verify that the destination project exists and that the token owner can push to it." >&2
  exit 1
fi
