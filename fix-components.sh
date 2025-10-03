#!/bin/bash

# Fix all components to remove gitlabToken and gitlabUrl usage

echo "Fixing components..."

# List of files to fix
files=(
  "src/components/Sidebar.tsx"
  "src/components/ProjectsTab.tsx"
  "src/components/DashboardAnalytics.tsx"
  "src/components/PipelineDetailsModal.tsx"
  "src/components/PipelineListModal.tsx"
  "src/components/ProjectDetailsModal.tsx"
  "src/components/ArtifactsTab.tsx"
  "src/components/ContainerRegistryTab.tsx"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."

    # Remove gitlabUrl, gitlabToken from destructuring
    sed -i '' 's/, gitlabUrl, gitlabToken//g' "$file"
    sed -i '' 's/gitlabUrl, gitlabToken, //g' "$file"
    sed -i '' 's/gitlabUrl, gitlabToken//g' "$file"

    # Replace getGitLabAPI(gitlabUrl, gitlabToken) with getGitLabAPIAsync()
    sed -i '' 's/getGitLabAPI(gitlabUrl, gitlabToken)/await getGitLabAPIAsync()/g' "$file"

    # Replace getGitLabAPI import with getGitLabAPIAsync
    sed -i '' 's/getGitLabAPI,/getGitLabAPIAsync,/g' "$file"
    sed -i '' 's/{ getGitLabAPI }/{ getGitLabAPIAsync }/g' "$file"

    # Remove gitlabToken checks
    sed -i '' '/if (gitlabToken)/d' "$file"
    sed -i '' '/if (!gitlabToken)/d' "$file"

    # Remove gitlabToken, gitlabUrl from dependencies
    sed -i '' 's/, gitlabToken, gitlabUrl//g' "$file"
    sed -i '' 's/gitlabToken, gitlabUrl, //g' "$file"
    sed -i '' 's/\[gitlabToken, gitlabUrl\]/[]/' "$file"

    echo "Fixed $file"
  fi
done

echo "Done!"
