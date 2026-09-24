# Container registry

**Registry** lists the GitLab container registry repositories of your projects and their tags.

![Container registry page](/screenshots/registry.webp){.screenshot}

- Each repository shows its path, tag count, creation date and a `docker pull` command to copy.
- **Expand** a repository to load its tags with size, age and short digest, each with its own
  `docker pull` command.
- **Delete** a single tag, or a whole repository with all its tags, after a confirmation (needs
  the `api` scope). GitLab removes repositories asynchronously.

Repositories are collected from the 20 most recently active projects and cached in the browser
for two minutes; tags for 30 seconds. Projects with the container registry disabled are skipped.
